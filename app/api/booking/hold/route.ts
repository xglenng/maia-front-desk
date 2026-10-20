import { nativeDeposit } from '@/packages/studio/native-calendar-policy';
import { lockArtistCalendar,nativeSlotAvailable } from '@/packages/booking/src/native-calendar.server';
import { protectedRoute } from '@/packages/auth/server';
import { NextRequest, NextResponse } from 'next/server';
import { and, eq, gte, lt, or, isNull } from 'drizzle-orm';
import { db } from '@db/index';
import { appointments, artists, clients, services } from '@db/schema';
import { z } from 'zod';
import { usesInternalScheduling } from '@/packages/scheduling/service';

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
  if (!await usesInternalScheduling(input.organizationId, input.artistId)) {
    return NextResponse.json({ error: 'Booking through the connected scheduling provider is not enabled yet.' }, { status: 409 });
  }

  const priceCents=input.priceCents??service.basePriceCents;
  if(priceCents==null)return NextResponse.json({error:'An approved price is required before booking.'},{status:409});
  let depositCents:number;
  try{depositCents=nativeDeposit(service,priceCents);}catch{return NextResponse.json({error:'Check the service deposit configuration.'},{status:409});}
  if(input.depositCents!=null&&input.depositCents!==depositCents)return NextResponse.json({error:'The deposit must match the configured service policy.'},{status:400});
  const endsAt = new Date(input.startsAt.getTime() + service.durationMinutes * 60_000);
  const now = new Date();
  const result = await db.transaction(async tx => {
    await lockArtistCalendar(tx,input.organizationId,input.artistId);
    if(!await nativeSlotAvailable(tx,input.organizationId,input.artistId,input.startsAt,endsAt))return null;
  const holdExpiresAt = new Date(now.getTime() + input.holdMinutes * 60_000);
  const [appointment] = await tx.insert(appointments).values({
    organizationId: input.organizationId,
    artistId: input.artistId,
    clientId: input.clientId,
    serviceId: input.serviceId,
    startsAt: input.startsAt,
    endsAt,
    status: 'TENTATIVE',
    priceCents,
    depositCents: depositCents||null,
    depositStatus: 'PENDING',
    paymentProvider: service.paymentProvider,
    holdExpiresAt,
  }).returning();

  return {appointment,holdExpiresAt};
  });
  if(!result)return NextResponse.json({error:'That time is outside bookable hours or is no longer available'},{status:409});
  return NextResponse.json(result, { status: 201 });
}

export const POST = protectedRoute(handlePOST, false);
