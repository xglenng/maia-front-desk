import { protectedRoute } from '@/packages/auth/server';
import { NextRequest, NextResponse } from 'next/server';
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@db/index';
import { artists, businessRules, organizations, studioAftercare, studioFaqs, studioLocations } from '@db/schema';
import { isValidIanaTimezone } from '@/packages/studio/config-policy';

const nullableText = (max: number) => z.string().trim().max(max).nullable().optional();
const timezone = z.string().trim().min(1).max(80).refine(isValidIanaTimezone, 'Must be a valid IANA timezone.');
const profileSchema = z.object({
  publicName: nullableText(120),
  publicPhone: nullableText(32),
  publicEmail: z.string().trim().email().max(254).nullable().optional(),
  website: z.string().trim().url().max(240).nullable().optional().refine(value => {
    if (!value) return true;
    try { return ['https:', 'http:'].includes(new URL(value).protocol); }
    catch { return false; }
  }, 'Website must use HTTP or HTTPS.'),
  timezone,
}).strict();

const ruleSchema = z.object({
  id: z.string().uuid().optional(),
  artistId: z.string().uuid(),
  category: z.string().trim().min(1).max(80),
  rule: z.string().trim().min(1).max(1200),
  visibility: z.enum(['CLIENT_VISIBLE', 'AI_INTERNAL']),
  priority: z.number().int().min(0).max(10000),
  active: z.boolean(),
}).strict();

const faqSchema = z.object({
  id: z.string().uuid().optional(),
  locationId: z.string().uuid().nullable().optional(),
  category: nullableText(80),
  question: z.string().trim().min(3).max(240),
  answer: z.string().trim().min(1).max(1200),
  active: z.boolean(),
  sortOrder: z.number().int().min(-10000).max(10000),
}).strict();

const aftercareSchema = z.object({
  id: z.string().uuid().optional(),
  locationId: z.string().uuid().nullable().optional(),
  serviceType: nullableText(80),
  category: nullableText(80),
  title: z.string().trim().min(2).max(160),
  instructions: z.string().trim().min(1).max(2000),
  active: z.boolean(),
  sortOrder: z.number().int().min(-10000).max(10000),
}).strict();

const artistSettingsSchema = z.object({
  artistId: z.string().uuid(),
  displayName: z.string().trim().min(2).max(120),
  bio: nullableText(1200),
  bookingEnabled: z.boolean(),
  receptionistEnabled: z.boolean(),
  receptionistTone: z.enum(['WARM', 'PROFESSIONAL', 'FRIENDLY']),
  receptionistGreeting: nullableText(240),
  receptionistInstructions: nullableText(1200),
  responseLength: z.enum(['SHORT', 'STANDARD', 'DETAILED']),
}).strict();

const updateSchema = z.object({
  organizationId: z.string().uuid(),
  profile: profileSchema,
  rules: z.array(ruleSchema).max(80).optional(),
  faqs: z.array(faqSchema).max(60).optional(),
  aftercare: z.array(aftercareSchema).max(40).optional(),
  artists: z.array(artistSettingsSchema).max(40).optional(),
}).strict();

function uniqueIds(values: Array<{ id?: string }>) {
  const ids = values.flatMap(value => value.id ? [value.id] : []);
  return new Set(ids).size === ids.length;
}

async function ownedIds(table: typeof artists | typeof studioLocations, ids: string[], organizationId: string) {
  if (!ids.length) return new Set<string>();
  const rows = await db.select({ id: table.id }).from(table).where(and(eq(table.organizationId, organizationId), inArray(table.id, ids)));
  return new Set(rows.map(row => row.id));
}

async function handleGET(request: NextRequest) {
  const organizationId = request.nextUrl.searchParams.get('organizationId');
  if (!organizationId || !z.string().uuid().safeParse(organizationId).success) return NextResponse.json({ error: 'A valid organizationId is required.' }, { status: 400 });
  const [[profile], locations, rules, faqs, aftercare, artistRows] = await Promise.all([
    db.select({ publicName: organizations.publicName, publicPhone: organizations.publicPhone, publicEmail: organizations.publicEmail, website: organizations.website, timezone: organizations.timezone })
      .from(organizations).where(eq(organizations.id, organizationId)).limit(1),
    db.select({ id: studioLocations.id, name: studioLocations.name, isPrimary: studioLocations.isPrimary, active: studioLocations.active })
      .from(studioLocations).where(eq(studioLocations.organizationId, organizationId)).orderBy(desc(studioLocations.isPrimary), asc(studioLocations.name)),
    db.select({ id: businessRules.id, artistId: businessRules.artistId, category: businessRules.category, rule: businessRules.rule, visibility: businessRules.visibility, priority: businessRules.priority, active: businessRules.active })
      .from(businessRules).where(eq(businessRules.organizationId, organizationId)).orderBy(asc(businessRules.priority)),
    db.select({ id: studioFaqs.id, locationId: studioFaqs.locationId, category: studioFaqs.category, question: studioFaqs.question, answer: studioFaqs.answer, active: studioFaqs.active, sortOrder: studioFaqs.sortOrder })
      .from(studioFaqs).where(eq(studioFaqs.organizationId, organizationId)).orderBy(asc(studioFaqs.sortOrder)),
    db.select({ id: studioAftercare.id, locationId: studioAftercare.locationId, serviceType: studioAftercare.serviceType, category: studioAftercare.category, title: studioAftercare.title, instructions: studioAftercare.instructions, active: studioAftercare.active, sortOrder: studioAftercare.sortOrder })
      .from(studioAftercare).where(eq(studioAftercare.organizationId, organizationId)).orderBy(asc(studioAftercare.sortOrder)),
    db.select({ artistId: artists.id, displayName: artists.displayName, bio: artists.bio, bookingEnabled: artists.bookingEnabled, receptionistEnabled: artists.receptionistEnabled, receptionistTone: artists.receptionistTone, receptionistGreeting: artists.receptionistGreeting, receptionistInstructions: artists.receptionistInstructions, responseLength: artists.responseLength })
      .from(artists).where(eq(artists.organizationId, organizationId)).orderBy(asc(artists.displayName)),
  ]);
  if (!profile) return NextResponse.json({ error: 'Studio not found.' }, { status: 404 });
  return NextResponse.json({ profile, locations, rules, faqs, aftercare, artists: artistRows });
}

async function handlePUT(request: NextRequest) {
  const parsed = updateSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const input = parsed.data;
  if (input.rules && !uniqueIds(input.rules)) return NextResponse.json({ error: 'Duplicate business rule IDs.' }, { status: 400 });
  if (input.faqs && !uniqueIds(input.faqs)) return NextResponse.json({ error: 'Duplicate FAQ IDs.' }, { status: 400 });
  if (input.aftercare && !uniqueIds(input.aftercare)) return NextResponse.json({ error: 'Duplicate aftercare IDs.' }, { status: 400 });
  if (input.artists && new Set(input.artists.map(item => item.artistId)).size !== input.artists.length) return NextResponse.json({ error: 'Duplicate artist settings.' }, { status: 400 });

  const ruleArtistIds = [...new Set((input.rules ?? []).map(rule => rule.artistId))];
  const locationIds = [...new Set([...(input.faqs ?? []).flatMap(faq => faq.locationId ? [faq.locationId] : []), ...(input.aftercare ?? []).flatMap(item => item.locationId ? [item.locationId] : [])])];
  const artistIds = [...new Set([...(input.artists ?? []).map(item => item.artistId), ...ruleArtistIds])];
  const [ownedArtists, ownedLocations] = await Promise.all([
    ownedIds(artists, artistIds, input.organizationId),
    ownedIds(studioLocations, locationIds, input.organizationId),
  ]);
  if (ownedArtists.size !== artistIds.length) return NextResponse.json({ error: 'An artist does not belong to this studio.' }, { status: 404 });
  if (ownedLocations.size !== locationIds.length) return NextResponse.json({ error: 'A location does not belong to this studio.' }, { status: 404 });

  const ruleIds = (input.rules ?? []).flatMap(rule => rule.id ? [rule.id] : []);
  const faqIds = (input.faqs ?? []).flatMap(faq => faq.id ? [faq.id] : []);
  const aftercareIds = (input.aftercare ?? []).flatMap(item => item.id ? [item.id] : []);
  const [ownedRules, ownedFaqs, ownedAftercare] = await Promise.all([
    ruleIds.length ? db.select({ id: businessRules.id }).from(businessRules).where(and(eq(businessRules.organizationId, input.organizationId), inArray(businessRules.id, ruleIds))) : [],
    faqIds.length ? db.select({ id: studioFaqs.id }).from(studioFaqs).where(and(eq(studioFaqs.organizationId, input.organizationId), inArray(studioFaqs.id, faqIds))) : [],
    aftercareIds.length ? db.select({ id: studioAftercare.id }).from(studioAftercare).where(and(eq(studioAftercare.organizationId, input.organizationId), inArray(studioAftercare.id, aftercareIds))) : [],
  ]);
  if (ownedRules.length !== ruleIds.length || ownedFaqs.length !== faqIds.length || ownedAftercare.length !== aftercareIds.length) return NextResponse.json({ error: 'A configuration record does not belong to this studio.' }, { status: 404 });

  try {
    await db.transaction(async tx => {
      await tx.update(organizations).set({ ...input.profile, updatedAt: new Date() }).where(eq(organizations.id, input.organizationId));
      for (const rule of input.rules ?? []) {
        const { id, ...values } = rule;
        if (id) await tx.update(businessRules).set(values).where(and(eq(businessRules.id, id), eq(businessRules.organizationId, input.organizationId)));
        else await tx.insert(businessRules).values({ ...values, organizationId: input.organizationId });
      }
      for (const faq of input.faqs ?? []) {
        const { id, ...values } = faq;
        if (id) await tx.update(studioFaqs).set({ ...values, updatedAt: new Date() }).where(and(eq(studioFaqs.id, id), eq(studioFaqs.organizationId, input.organizationId)));
        else await tx.insert(studioFaqs).values({ ...values, organizationId: input.organizationId });
      }
      for (const item of input.aftercare ?? []) {
        const { id, ...values } = item;
        if (id) await tx.update(studioAftercare).set({ ...values, updatedAt: new Date() }).where(and(eq(studioAftercare.id, id), eq(studioAftercare.organizationId, input.organizationId)));
        else await tx.insert(studioAftercare).values({ ...values, organizationId: input.organizationId });
      }
      for (const settings of input.artists ?? []) {
        const { artistId, ...values } = settings;
        await tx.update(artists).set(values).where(and(eq(artists.id, artistId), eq(artists.organizationId, input.organizationId)));
      }
    });
  } catch {
    return NextResponse.json({ error: 'Unable to save studio configuration.' }, { status: 500 });
  }
  return NextResponse.json({ saved: true });
}

export const GET = protectedRoute(handleGET, true);
export const PUT = protectedRoute(handlePUT, true);
