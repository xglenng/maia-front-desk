/**
 * One-off: mock appointments for Embellished Studios (Nov 2026).
 *
 *   tsx packages/db/src/seed-mock-appointments.ts \
 *     --organization-id <uuid> --val-artist-id <uuid> --garrett-artist-id <uuid> [--apply]
 *
 * Dry run by default. Fixtures are CONFIRMED (so they block the calendar) but carry no
 * contact details, no consent, no deposit/payment, no conversation and no calendar-provider
 * ids, so reminders, consent requests, payments and calendar writes have nothing to act on.
 */
import { and, eq, like, lt, gt, sql } from "drizzle-orm";
import { db, pool } from "./index";
import { appointments, artists, availabilityRules, calendarTimeOff, clients, organizations, services } from "./schema";
import { localDateTimeToUtc } from "../../booking/src/time";

const MARKER_PREFIX = "MOCK-SEED:2026-11";
const EARLIEST_DAY = "2026-11-05";
const WEEKS = [["2026-11-05", "2026-11-06", "2026-11-07", "2026-11-08"], ["2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13", "2026-11-14", "2026-11-15"]];
const TARGETS = [{ label: "Val", arg: "val-artist-id", count: 4 }, { label: "Garrett", arg: "garrett-artist-id", count: 6 }] as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLOT_STEP_MINUTES = 30;

type Planned = { key: string; artistId: string; artistLabel: string; artistName: string; serviceId: string; serviceName: string; priceCents: number | null; startsAt: Date; endsAt: Date; clientName: string };
type Interval = { startsAt: Date; endsAt: Date };

function fail(message: string): never { throw new Error(message); }

function parseArgs(argv: string[]) {
  const values = new Map<string, string>();
  const flags = new Set<string>();
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i]!;
    if (!token.startsWith("--")) fail(`Unexpected argument: ${token}`);
    const name = token.slice(2);
    if (name === "apply") { flags.add(name); continue; }
    const value = argv[++i];
    if (!value || value.startsWith("--")) fail(`--${name} requires a value.`);
    values.set(name, value);
  }
  const known = new Set(["organization-id", ...TARGETS.map(t => t.arg), "apply"]);
  for (const name of [...values.keys(), ...flags]) if (!known.has(name)) fail(`Unknown option --${name}.`);
  for (const name of ["organization-id", ...TARGETS.map(t => t.arg)]) {
    const value = values.get(name);
    if (!value) fail(`--${name} is required.`);
    if (!UUID.test(value)) fail(`--${name} must be a UUID.`);
  }
  return { organizationId: values.get("organization-id")!, artistIds: Object.fromEntries(TARGETS.map(t => [t.label, values.get(t.arg)!])), apply: flags.has("apply") };
}

const overlaps = (a: Interval, b: Interval) => a.startsAt < b.endsAt && b.startsAt < a.endsAt;
const pad = (n: number) => String(n).padStart(2, "0");
const clock = (minute: number) => `${pad(Math.floor(minute / 60))}:${pad(minute % 60)}`;

type Tx = Pick<typeof db, "select" | "insert">;

async function plan(tx: Tx, organizationId: string, artistIds: Record<string, string>) {
  const [organization] = await tx.select({ id: organizations.id, name: organizations.name, slug: organizations.slug, timezone: organizations.timezone }).from(organizations).where(eq(organizations.id, organizationId)).limit(1);
  if (!organization) fail("Organization not found.");
  if (!/embellished/i.test(`${organization.name} ${organization.slug}`)) fail(`Organization "${organization.name}" is not Embellished Studios; refusing to continue.`);
  try { new Intl.DateTimeFormat("en-US", { timeZone: organization.timezone }); } catch { fail(`Invalid studio timezone "${organization.timezone}".`); }

  const now = new Date();
  const earliest = localDateTimeToUtc(`${EARLIEST_DAY}T00:00`, organization.timezone);
  const rangeStart = earliest > now ? earliest : now;
  const rangeEnd = localDateTimeToUtc("2026-11-16T00:00", organization.timezone);
  if (!(rangeStart < rangeEnd)) fail("The Nov 5–15, 2026 window has already passed.");

  const result: Planned[] = [];
  const reserved: Interval[] = [];
  let alreadySeeded = 0;

  for (const target of TARGETS) {
    const artistId = artistIds[target.label]!;
    const [artist] = await tx.select({ id: artists.id, displayName: artists.displayName }).from(artists).where(and(eq(artists.id, artistId), eq(artists.organizationId, organizationId))).limit(1);
    if (!artist) fail(`${target.label}'s artist ${artistId} does not belong to this organization.`);

    const activeServices = await tx.select({ id: services.id, name: services.name, durationMinutes: services.durationMinutes, basePriceCents: services.basePriceCents }).from(services)
      .where(and(eq(services.organizationId, organizationId), eq(services.artistId, artistId), eq(services.active, true))).orderBy(services.sortOrder, services.name);
    if (!activeServices.length) fail(`${artist.displayName} has no active services.`);

    const rules = await tx.select().from(availabilityRules).where(and(eq(availabilityRules.organizationId, organizationId), eq(availabilityRules.artistId, artistId), eq(availabilityRules.active, true)));
    if (!rules.length) fail(`${artist.displayName} has no active availability rules; cannot choose safe slots.`);

    // Every appointment status counts as busy so fixtures can never collide with real or cancelled-then-restored bookings.
    const existing = await tx.select({ startsAt: appointments.startsAt, endsAt: appointments.endsAt, notes: appointments.notes }).from(appointments)
      .where(and(eq(appointments.organizationId, organizationId), eq(appointments.artistId, artistId), lt(appointments.startsAt, rangeEnd), gt(appointments.endsAt, earliest)));
    const timeOff = await tx.select({ startsAt: calendarTimeOff.startsAt, endsAt: calendarTimeOff.endsAt }).from(calendarTimeOff)
      .where(and(eq(calendarTimeOff.organizationId, organizationId), eq(calendarTimeOff.artistId, artistId), lt(calendarTimeOff.startsAt, rangeEnd), gt(calendarTimeOff.endsAt, earliest)));
    const busy: Interval[] = [...existing, ...timeOff, ...reserved];

    const seededKeys = new Set<string>();
    const seeded = await tx.select({ notes: appointments.notes }).from(appointments).where(and(eq(appointments.organizationId, organizationId), eq(appointments.artistId, artistId), like(appointments.notes, `${MARKER_PREFIX}:${artistId}:%`)));
    for (const row of seeded) { const n = row.notes?.match(new RegExp(`${MARKER_PREFIX}:${artistId}:(\\d+)`))?.[1]; if (n) seededKeys.add(n); }
    if (seededKeys.size > target.count) fail(`${artist.displayName} already has ${seededKeys.size} seeded appointments (expected at most ${target.count}).`);
    alreadySeeded += seededKeys.size;

    const missing = Array.from({ length: target.count }, (_, i) => String(i + 1)).filter(n => !seededKeys.has(n));
    const perWeek = [Math.ceil(target.count / 2), Math.floor(target.count / 2)];
    const weekOf = (n: number) => (n <= perWeek[0]! ? 0 : 1);
    let serviceCursor = 0;

    for (const n of missing) {
      const days = WEEKS[weekOf(Number(n))]!;
      let placed: Planned | null = null;
      // Spread appointments across days: start at a day derived from the sequence number, then fall through to the rest.
      for (let offset = 0; offset < days.length && !placed; offset++) {
        const day = days[(Number(n) + offset) % days.length]!;
        const service = activeServices[serviceCursor % activeServices.length]!;
        const [y, m, d] = day.split("-").map(Number) as [number, number, number];
        const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
        for (const rule of rules.filter(r => r.dayOfWeek === dow).sort((a, b) => a.startMinute - b.startMinute)) {
          for (let minute = rule.startMinute; minute + service.durationMinutes <= rule.endMinute && !placed; minute += SLOT_STEP_MINUTES) {
            const startsAt = localDateTimeToUtc(`${day}T${clock(minute)}`, organization.timezone);
            const endsAt = new Date(startsAt.getTime() + service.durationMinutes * 60_000);
            if (Number.isNaN(startsAt.getTime()) || startsAt < rangeStart || startsAt < now) continue;
            if (busy.some(slot => overlaps({ startsAt, endsAt }, slot))) continue;
            placed = { key: `${MARKER_PREFIX}:${artistId}:${n}`, artistId, artistLabel: target.label, artistName: artist.displayName, serviceId: service.id, serviceName: service.name, priceCents: service.basePriceCents ?? null, startsAt, endsAt, clientName: `MOCK Client ${target.label[0]}${n}` };
          }
        }
      }
      if (!placed) fail(`Could not find a safe open slot for ${artist.displayName} appointment ${n}; nothing will be written.`);
      busy.push(placed); reserved.push(placed); result.push(placed); serviceCursor++;
    }
  }
  return { organization, planned: result, alreadySeeded };
}

function describe(row: Planned, timeZone: string) {
  const fmt = (date: Date, options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-US", { timeZone, ...options }).format(date);
  return `${row.artistLabel.padEnd(8)} ${fmt(row.startsAt, { weekday: "short", year: "numeric", month: "short", day: "numeric" })}  ${fmt(row.startsAt, { hour: "numeric", minute: "2-digit" })}–${fmt(row.endsAt, { hour: "numeric", minute: "2-digit", timeZoneName: "short" })}  ${row.serviceName}  [${row.clientName}]`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!process.env.DATABASE_URL) fail("DATABASE_URL is not set.");
  const host = (() => { try { return new URL(process.env.DATABASE_URL!).host; } catch { return "unparseable"; } })();
  console.log(`${args.apply ? "APPLY" : "DRY RUN"} against database host: ${host}`);

  if (!args.apply) {
    const { organization, planned, alreadySeeded } = await plan(db, args.organizationId, args.artistIds);
    console.log(`Studio: ${organization.name} (${organization.timezone}); already seeded: ${alreadySeeded}; to create: ${planned.length}`);
    planned.forEach(row => console.log("  " + describe(row, organization.timezone)));
    console.log("No changes written. Re-run with --apply to insert.");
    return;
  }

  await db.transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`${MARKER_PREFIX}:${args.organizationId}`}))`);
    const { organization, planned, alreadySeeded } = await plan(tx as unknown as Tx, args.organizationId, args.artistIds);
    if (alreadySeeded + planned.length !== 10) fail("Cannot safely account for all ten appointments; rolling back.");
    for (const row of planned) {
      const [client] = await tx.insert(clients).values({
        organizationId: args.organizationId, firstName: "MOCK", lastName: row.clientName.replace("MOCK ", ""),
        email: null, phone: null, providerCustomerId: null, smsOptIn: false, smsConsentStatus: "NOT_REQUESTED", marketingOptIn: false,
        notes: `${row.key} — mock client for seeded test data; no real contact details.`,
      }).returning({ id: clients.id });
      await tx.insert(appointments).values({
        organizationId: args.organizationId, artistId: row.artistId, clientId: client!.id, serviceId: row.serviceId,
        startsAt: row.startsAt, endsAt: row.endsAt, status: "CONFIRMED", priceCents: row.priceCents,
        depositCents: null, depositStatus: "WAIVED", paymentProvider: null, holdExpiresAt: null,
        calendarEventId: null, schedulingProvider: null, providerBookingId: null, conversationId: null,
        notes: `${row.key} — mock appointment (seeded test data).`,
      });
      console.log("  created " + describe(row, organization.timezone));
    }
    console.log(`Committed ${planned.length} appointments (${alreadySeeded} were already seeded).`);
  });
}

main().then(() => pool.end()).catch(async error => { console.error(`Seed stopped: ${error instanceof Error ? error.message : error}`); await pool.end().catch(() => undefined); process.exit(1); });
