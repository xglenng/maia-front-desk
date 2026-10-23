import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { protectedRoute } from '@/packages/auth/server';
import { db } from '@db/index';
import { artists, services } from '@db/schema';
import { parseServiceCsv, serviceImportKey } from '@/packages/studio/service-import';

async function handlePOST(request: NextRequest) {
  const input = z.object({ organizationId: z.string().uuid(), artistId: z.string().uuid(), csv: z.string().min(1).max(1_000_000), action: z.enum(['PREVIEW', 'IMPORT']) }).safeParse(await request.json());
  if (!input.success) return NextResponse.json({ error: 'Choose an artist and a CSV file smaller than 1 MB.' }, { status: 400 });
  const { organizationId, artistId, csv, action } = input.data;
  let rows;
  try { rows = parseServiceCsv(csv); } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid CSV.' }, { status: 400 }); }
  const existing = await db.select({ name: services.name, serviceType: services.serviceType }).from(services).where(and(eq(services.organizationId, organizationId), eq(services.artistId, artistId)));
  const keys = new Set(existing.map(serviceImportKey));
  if (action === 'PREVIEW') return NextResponse.json({ rows: rows.map(row => ({ ...row, exists: keys.has(serviceImportKey(row.service)) })) });
  if (rows.some(row => row.errors.length)) return NextResponse.json({ error: 'Correct the invalid CSV rows before importing.' }, { status: 400 });
  const result = await db.transaction(async tx => {
    // Serialize imports for the same artist; a retry cannot create duplicate services.
    const [artist] = await tx.select({ id: artists.id }).from(artists).where(and(eq(artists.organizationId, organizationId), eq(artists.id, artistId))).for('update');
    if (!artist) return null;
    const saved = await tx.select({ name: services.name, serviceType: services.serviceType }).from(services).where(and(eq(services.organizationId, organizationId), eq(services.artistId, artistId)));
    const savedKeys = new Set(saved.map(serviceImportKey));
    let imported = 0, skipped = 0;
    for (const row of rows) {
      const key = serviceImportKey(row.service);
      if (savedKeys.has(key)) { skipped++; continue; }
      await tx.insert(services).values({ organizationId, artistId, ...row.service, active: true, depositType: 'NONE', depositAmountCents: null, depositPercent: null, paymentProvider: 'VENMO_MANUAL' });
      savedKeys.add(key); imported++;
    }
    return { imported, skipped };
  });
  return result ? NextResponse.json(result) : NextResponse.json({ error: 'Artist not found.' }, { status: 404 });
}
export const POST = protectedRoute(handlePOST, true);
