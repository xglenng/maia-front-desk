import { protectedRoute } from '@/packages/auth/server';
import { NextRequest, NextResponse } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { db } from '@db/index';
import { services } from '@db/schema';
import { z } from 'zod';

const createServiceSchema = z.object({
  organizationId: z.string().uuid(),
  artistId: z.string().uuid(),
  name: z.string().min(1).max(120),
  durationMinutes: z.number().int().positive().max(1440),
  pricingType: z.enum(['FLAT', 'HOURLY', 'QUOTE']),
  basePriceCents: z.number().int().nonnegative().nullable().optional(),
  hourlyRateCents: z.number().int().nonnegative().nullable().optional(),
  requiresConsultation: z.boolean().optional(),
  requiresArtistApproval: z.boolean().optional(),
});

async function handleGET(request: NextRequest) {
  const organizationId = request.nextUrl.searchParams.get('organizationId');
  const artistId = request.nextUrl.searchParams.get('artistId');
  if (!organizationId || !artistId) return NextResponse.json({ error: 'organizationId and artistId are required' }, { status: 400 });

  const rows = await db.select().from(services).where(and(eq(services.organizationId, organizationId), eq(services.artistId, artistId), eq(services.active, true)));
  return NextResponse.json({ services: rows });
}

async function handlePOST(request: NextRequest) {
  const parsed = createServiceSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const [service] = await db.insert(services).values(parsed.data).returning();
  return NextResponse.json({ service }, { status: 201 });
}

export const GET = protectedRoute(handleGET, false);
export const POST = protectedRoute(handlePOST, false);
