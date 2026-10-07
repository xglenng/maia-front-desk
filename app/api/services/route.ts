import { protectedRoute } from '@/packages/auth/server';
import { NextRequest, NextResponse } from 'next/server';
import { eq, and, asc } from 'drizzle-orm';
import { db } from '@db/index';
import { services } from '@db/schema';
import { z } from 'zod';
import { normalizeServicePricing } from './pricing';
import { normalizeServiceDeposit, validServiceDeposit } from '@/packages/studio/deposit-policy';

const serviceFields = {
  serviceType: z.string().trim().min(1).max(40).transform(value => value.toUpperCase()),
  category: z.string().trim().max(80).nullable().optional().transform(value => value === '' ? null : value),
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).nullable().optional().transform(value => value === '' ? null : value),
  durationMinutes: z.number().int().positive().max(1440),
  pricingType: z.enum(['FLAT', 'HOURLY', 'QUOTE']),
  basePriceCents: z.number().int().nonnegative().nullable().optional(),
  hourlyRateCents: z.number().int().nonnegative().nullable().optional(),
  startingAt: z.boolean(),
  depositType: z.enum(['NONE', 'FIXED', 'PERCENT']),
  depositAmountCents: z.number().int().positive().nullable().optional(),
  depositPercent: z.number().int().min(1).max(100).nullable().optional(),
  paymentProvider: z.enum(['SQUARE', 'STRIPE', 'VENMO_MANUAL']),
  requiresConsultation: z.boolean(),
  requiresArtistApproval: z.boolean(),
  active: z.boolean(),
  sortOrder: z.number().int(),
};

const createServiceSchema = z.object({
  organizationId: z.string().uuid(),
  artistId: z.string().uuid(),
  ...serviceFields,
  startingAt: serviceFields.startingAt.optional(),
  paymentProvider: serviceFields.paymentProvider.optional(),
  depositType: serviceFields.depositType.optional(),
  requiresConsultation: serviceFields.requiresConsultation.optional(),
  requiresArtistApproval: serviceFields.requiresArtistApproval.optional(),
  active: serviceFields.active.optional(),
  sortOrder: serviceFields.sortOrder.optional(),
});

async function handleGET(request: NextRequest) {
  const parsed = z.object({ organizationId: z.string().uuid(), artistId: z.string().uuid(), includeInactive: z.enum(['true', 'false']).optional() })
    .safeParse(Object.fromEntries(request.nextUrl.searchParams.entries()));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { organizationId, artistId, includeInactive } = parsed.data;
  const conditions = [eq(services.organizationId, organizationId), eq(services.artistId, artistId)];
  if (includeInactive !== 'true') conditions.push(eq(services.active, true));
  const rows = await db.select().from(services).where(and(...conditions)).orderBy(asc(services.sortOrder), asc(services.name));
  return NextResponse.json({ services: rows });
}

async function handlePOST(request: NextRequest) {
  const parsed = createServiceSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const deposit = normalizeServiceDeposit(parsed.data);
  if (!validServiceDeposit(deposit)) return NextResponse.json({ error: 'Configure no deposit, a positive fixed amount, or a percentage from 1 to 100.' }, { status: 400 });
  const [service] = await db.insert(services).values({ ...parsed.data, ...normalizeServicePricing(parsed.data), ...deposit }).returning();
  return NextResponse.json({ service }, { status: 201 });
}

export const GET = protectedRoute(handleGET, true);
export const POST = protectedRoute(handlePOST, true);
