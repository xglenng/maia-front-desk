import { protectedRoute } from '@/packages/auth/server';
import { NextRequest, NextResponse } from 'next/server';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@db/index';
import { studioBusinessHours, studioLocations } from '@db/schema';
import { isValidIanaTimezone, validBusinessHours } from '@/packages/studio/config-policy';

const hoursSchema = z.array(z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  startMinute: z.number().int().min(0).max(1439),
  endMinute: z.number().int().min(1).max(1440),
}).strict()).max(14).superRefine((hours, context) => {
  if (!validBusinessHours(hours)) context.addIssue({ code: 'custom', message: 'Hours must be valid, non-overlapping intervals.' });
});

const locationSchema = z.object({
  name: z.string().trim().min(1).max(120),
  addressLine1: z.string().trim().max(160).nullable(),
  addressLine2: z.string().trim().max(160).nullable(),
  city: z.string().trim().max(100).nullable(),
  region: z.string().trim().max(100).nullable(),
  postalCode: z.string().trim().max(24).nullable(),
  country: z.string().trim().max(80).nullable(),
  phone: z.string().trim().max(32).nullable(),
  email: z.string().trim().email().max(254).nullable().or(z.literal('')),
  timezone: z.string().trim().min(1).max(80).refine(isValidIanaTimezone, 'Must be a valid IANA timezone.'),
  isPrimary: z.boolean(),
  active: z.boolean(),
  hours: hoursSchema,
}).strict();

const createSchema = z.object({ organizationId: z.string().uuid(), ...locationSchema.shape }).strict();
const updateSchema = z.object({ organizationId: z.string().uuid(), locationId: z.string().uuid(), ...locationSchema.shape }).strict();

async function handleGET(request: NextRequest) {
  const organizationId = request.nextUrl.searchParams.get('organizationId');
  if (!organizationId || !z.string().uuid().safeParse(organizationId).success) return NextResponse.json({ error: 'A valid organizationId is required.' }, { status: 400 });
  const locations = await db.select().from(studioLocations).where(eq(studioLocations.organizationId, organizationId)).orderBy(sql`${studioLocations.isPrimary} DESC`, asc(studioLocations.name));
  const ids = locations.map(location => location.id);
  const hours = ids.length ? await db.select({ id: studioBusinessHours.id, locationId: studioBusinessHours.locationId, dayOfWeek: studioBusinessHours.dayOfWeek, startMinute: studioBusinessHours.startMinute, endMinute: studioBusinessHours.endMinute })
    .from(studioBusinessHours).where(and(eq(studioBusinessHours.organizationId, organizationId), inArray(studioBusinessHours.locationId, ids)))
    .orderBy(asc(studioBusinessHours.locationId), asc(studioBusinessHours.dayOfWeek), asc(studioBusinessHours.startMinute)) : [];
  return NextResponse.json({ locations: locations.map(location => ({ ...location, hours: hours.filter(hour => hour.locationId === location.id).map(({ id: _id, locationId: _locationId, ...hour }) => hour) })) });
}

async function handlePOST(request: NextRequest) {
  const parsed = createSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { organizationId, hours, ...values } = parsed.data;
  if (values.isPrimary && !values.active) return NextResponse.json({ error: 'An inactive location cannot be primary.' }, { status: 400 });

  try {
    const location = await db.transaction(async tx => {
      const [existingPrimary] = await tx.select({ id: studioLocations.id }).from(studioLocations).where(and(eq(studioLocations.organizationId, organizationId), eq(studioLocations.isPrimary, true), eq(studioLocations.active, true))).limit(1);
      const isPrimary = values.active && (values.isPrimary || !existingPrimary);
      if (isPrimary) await tx.update(studioLocations).set({ isPrimary: false, updatedAt: new Date() }).where(eq(studioLocations.organizationId, organizationId));
      const [created] = await tx.insert(studioLocations).values({ ...values, email: values.email || null, isPrimary, businessHoursConfigured: true, organizationId }).returning();
      if (hours.length) await tx.insert(studioBusinessHours).values(hours.map(hour => ({ organizationId, locationId: created.id, ...hour })));
      return created;
    });
    return NextResponse.json({ location: { ...location, hours } }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Unable to create studio location.' }, { status: 500 });
  }
}

async function handlePATCH(request: NextRequest) {
  const parsed = updateSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { organizationId, locationId, hours, ...values } = parsed.data;
  const [current] = await db.select({ id: studioLocations.id, isPrimary: studioLocations.isPrimary }).from(studioLocations)
    .where(and(eq(studioLocations.id, locationId), eq(studioLocations.organizationId, organizationId))).limit(1);
  if (!current) return NextResponse.json({ error: 'Location not found.' }, { status: 404 });
  if (values.isPrimary && !values.active) return NextResponse.json({ error: 'An inactive location cannot be primary.' }, { status: 400 });

  try {
    const location = await db.transaction(async tx => {
      const [otherActive] = await tx.select({ id: studioLocations.id }).from(studioLocations).where(and(
        eq(studioLocations.organizationId, organizationId),
        eq(studioLocations.active, true),
        sql`${studioLocations.id} <> ${locationId}`,
      )).limit(1);
      const makePrimary = values.active && (values.isPrimary || (!otherActive && (current.isPrimary || !values.isPrimary)));
      const finalValues = { ...values, email: values.email || null, isPrimary: makePrimary, businessHoursConfigured: true, updatedAt: new Date() };
      if (makePrimary) await tx.update(studioLocations).set({ isPrimary: false, updatedAt: new Date() }).where(eq(studioLocations.organizationId, organizationId));
      const [updated] = await tx.update(studioLocations).set(finalValues).where(and(
        eq(studioLocations.id, locationId),
        eq(studioLocations.organizationId, organizationId),
      )).returning();
      await tx.delete(studioBusinessHours).where(and(eq(studioBusinessHours.organizationId, organizationId), eq(studioBusinessHours.locationId, locationId)));
      if (hours.length) await tx.insert(studioBusinessHours).values(hours.map(hour => ({ organizationId, locationId, ...hour })));

      if (current.isPrimary && !updated.isPrimary && otherActive) await tx.update(studioLocations).set({ isPrimary: true, updatedAt: new Date() }).where(eq(studioLocations.id, otherActive.id));
      return updated;
    });
    return NextResponse.json({ location: { ...location, hours } });
  } catch {
    return NextResponse.json({ error: 'Unable to update studio location.' }, { status: 500 });
  }
}

export const GET = protectedRoute(handleGET, true);
export const POST = protectedRoute(handlePOST, true);
export const PATCH = protectedRoute(handlePATCH, true);
