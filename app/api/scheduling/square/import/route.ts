import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { protectedRoute } from '@/packages/auth/server';
import { db } from '@db/index';
import { schedulingConnections, services, serviceProviderMappings } from '@db/schema';
import { squareClientForConnection } from '@/packages/scheduling/square/resources';
import { squareImportValues } from '@/packages/scheduling/square/import-policy';

async function handlePOST(request: NextRequest) {
  const parsed = z.object({ organizationId: z.string().uuid(), artistId: z.string().uuid(), variationIds: z.array(z.string().min(1)).min(1).max(500) }).safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: 'Select services to import.' }, { status: 400 });
  const { organizationId, artistId } = parsed.data;
  const scope = and(eq(schedulingConnections.organizationId, organizationId), eq(schedulingConnections.artistId, artistId));
  const [connection] = await db.select().from(schedulingConnections).where(scope).limit(1);
  if (!connection || connection.provider !== 'SQUARE' || connection.status !== 'CONNECTED' || !connection.locationId) return NextResponse.json({ error: 'Connect Square and save a location first.' }, { status: 409 });
  let catalog;
  try { catalog = await (await squareClientForConnection(connection)).listServiceVariations(); }
  catch { return NextResponse.json({ error: 'Square services are temporarily unavailable.' }, { status: 502 }); }
  const selected = [...new Set(parsed.data.variationIds)].map(id => catalog.find(service => service.id === id));
  if (selected.some(service => !service || !squareImportValues(service))) return NextResponse.json({ error: 'Selected services must have a valid duration and a USD fixed price or variable pricing.' }, { status: 400 });
  const result = await db.transaction(async tx => {
    const [locked] = await tx.select().from(schedulingConnections).where(scope).for('update');
    if (!locked || locked.status !== 'CONNECTED' || locked.locationId !== connection.locationId || locked.externalAccountId !== connection.externalAccountId) throw new Error('Square connection changed. Reload before importing.');
    const mappings = await tx.select().from(serviceProviderMappings).where(and(eq(serviceProviderMappings.organizationId, organizationId), eq(serviceProviderMappings.artistId, artistId), eq(serviceProviderMappings.schedulingConnectionId, connection.id)));
    let imported = 0, skipped = 0;
    for (const squareService of selected) {
      if (!squareService) continue;
      if (mappings.some(mapping => mapping.externalServiceVariationId === squareService.id)) { skipped++; continue; }
      const values = squareImportValues(squareService)!;
      const [service] = await tx.insert(services).values({ organizationId, artistId, ...values, depositType: 'NONE', paymentProvider: 'SQUARE' }).returning({ id: services.id });
      await tx.insert(serviceProviderMappings).values({ organizationId, artistId, schedulingConnectionId: connection.id, serviceId: service.id, locationId: connection.locationId!, externalServiceVariationId: squareService.id, externalServiceVariationVersion: squareService.version == null ? null : BigInt(squareService.version), externalTeamMemberId: connection.teamMemberId });
      imported++;
    }
    return { imported, skipped };
  });
  return NextResponse.json(result);
}

export const POST = protectedRoute(handlePOST, true);
