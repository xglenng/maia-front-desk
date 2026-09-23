import { protectedRoute } from '@/packages/auth/server';
import { NextRequest, NextResponse } from 'next/server';
import { and, eq, gte, lt, or, isNull } from 'drizzle-orm';
import { db } from '@db/index';
import { appointments, artists, clients, services } from '@db/schema';
import { z } from 'zod';

const schema = z.object({
  organizationId: z.string().uuid(),
  artistId: z.string().uuid(),
  clientId: z.string().uuid(),
  serviceId: z.string().uuid(),
  startsAt: z.coerce.date(),
  depositCents: z.number().int().nonnegative().optional(),
  priceCents: z.number().int().nonnegative().optional(),
  holdMinutes: z.number().int().min(1).max(30).default(10),
});

async function handlePOST(request: NextRequest) {
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const input = parsed.data;

  const [artist] = await db.select().from(artists).where(and(eq(artists.id, input.artistId), eq(artists.organizationId, input.organizationId)));
  const [client] = await db.select().from(clients).where(and(eq(clients.id, input.clientId), eq(clients.organizationId, input.organizationId)));
  const [service] = await db.select().from(services).where(and(eq(services.id, input.serviceId), eq(services.artistId, input.artistId), eq(services.organizationId, input.organizationId), eq(services.active, true)));
  if (!artist || !client || !service) return NextResponse.json({ error: 'Invalid artist, client, or service' }, { status: 404 });
  if (!artist.bookingEnabled) return NextResponse.json({ error: 'Artist booking is disabled' }, { status: 409 });

  const endsAt = new Date(input.startsAt.getTime() + service.durationMinutes * 60_000);
  const now = new Date();
  const conflicts = await db.select({ id: appointments.id }).from(appointments).where(and(
    eq(appointments.organizationId, input.organizationId),
    eq(appointments.artistId, input.artistId),
    or(eq(appointments.status, 'CONFIRMED'), eq(appointments.status, 'COMPLETED'), and(eq(appointments.status, 'TENTATIVE'), or(isNull(appointments.holdExpiresAt), gte(appointments.holdExpiresAt, now))), and(eq(appointments.status, 'AI_HOLD'), or(isNull(appointments.holdExpiresAt), gte(appointments.holdExpiresAt, now)))),
    lt(appointments.startsAt, endsAt),
    gte(appointments.endsAt, input.startsAt),
  ));
  if (conflicts.length) return NextResponse.json({ error: 'That time is no longer available' }, { status: 409 });
  const holdExpiresAt = new Date(now.getTime() + input.holdMinutes * 60_000);
  const [appointment] = await db.insert(appointments).values({
    organizationId: input.organizationId,
    artistId: input.artistId,
    clientId: input.clientId,
    serviceId: input.serviceId,
    startsAt: input.startsAt,
    endsAt,
    status: 'TENTATIVE',
    priceCents: input.priceCents ?? service.basePriceCents ?? null,
    depositCents: input.depositCents ?? null,
    depositStatus: 'PENDING',
    holdExpiresAt,
  }).returning();

  return NextResponse.json({ appointment, holdExpiresAt }, { status: 201 });
}

export const POST = protectedRoute(handlePOST, false);
