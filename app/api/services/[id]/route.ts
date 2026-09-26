import { protectedRoute } from '@/packages/auth/server';
import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@db/index';
import { services } from '@db/schema';
import { normalizeServicePricing } from '../pricing';

const updateSchema = z.object({
  organizationId: z.string().uuid(),
  serviceType: z.string().trim().min(1).max(40).transform(value => value.toUpperCase()).optional(),
  category: z.string().trim().max(80).nullable().optional().transform(value => value === '' ? null : value),
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(500).nullable().optional().transform(value => value === '' ? null : value),
  durationMinutes: z.number().int().positive().max(1440).optional(),
  pricingType: z.enum(['FLAT', 'HOURLY', 'QUOTE']).optional(),
  basePriceCents: z.number().int().nonnegative().nullable().optional(),
  hourlyRateCents: z.number().int().nonnegative().nullable().optional(),
  startingAt: z.boolean().optional(),
  requiresConsultation: z.boolean().optional(),
  requiresArtistApproval: z.boolean().optional(),
  active: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
}).strict().refine(value => Object.keys(value).some(key => key !== 'organizationId'), {
  message: 'At least one service field must be provided.',
});

type Context = { params: Promise<{ id: string }> };

async function handlePATCH(request: NextRequest, { params }: Context) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: 'Invalid service ID' }, { status: 400 });

  const parsed = updateSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { organizationId, ...changes } = parsed.data;
  const [current] = await db.select({ pricingType: services.pricingType, basePriceCents: services.basePriceCents, hourlyRateCents: services.hourlyRateCents, startingAt: services.startingAt })
    .from(services)
    .where(and(eq(services.id, id), eq(services.organizationId, organizationId)))
    .limit(1);
  if (!current) return NextResponse.json({ error: 'Service not found' }, { status: 404 });
  const pricingType = changes.pricingType ?? current.pricingType;
  const pricing = normalizeServicePricing({ ...changes, pricingType }, current);
  const [service] = await db.update(services)
    .set({ ...changes, ...pricing, updatedAt: new Date() })
    .where(and(eq(services.id, id), eq(services.organizationId, organizationId)))
    .returning();
  if (!service) return NextResponse.json({ error: 'Service not found' }, { status: 404 });
  return NextResponse.json({ service });
}

export const PATCH = protectedRoute(handlePATCH, true);