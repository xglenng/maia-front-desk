import { protectedRoute } from '@/packages/auth/server';
import { NextRequest, NextResponse } from 'next/server';
import { and, asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@db/index';
import { artists, schedulingConnections, serviceProviderMappings, services } from '@db/schema';
import { getSquareSetupResources } from '@/packages/scheduling/square/resources';
import { SquareApiClient, SquareApiError } from '@/packages/scheduling/square/client';
import { squareBookingWriteScopes } from '@/packages/scheduling/square/config';
import { squareAccessToken } from '@/packages/scheduling/square/credentials';

const scope = { organizationId: z.string().uuid(), artistId: z.string().uuid() };
const commandSchema = z.discriminatedUnion('action', [
  z.object({ ...scope, action: z.literal('UPDATE_SETTINGS'), locationId: z.string().min(1).nullable(), teamMemberId: z.string().min(1).nullable() }),
  z.object({ ...scope, action: z.literal('SAVE_MAPPING'), serviceId: z.string().uuid(), locationId: z.string().min(1), serviceVariationId: z.string().min(1), teamMemberId: z.string().min(1).nullable() }),
  z.object({ ...scope, action: z.literal('REMOVE_MAPPING'), serviceId: z.string().uuid(), locationId: z.string().min(1) }),
  z.object({ ...scope, action: z.literal('DISCONNECT') }),
]);

async function handleGET(request: NextRequest) {
  const parsed = z.object(scope).safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { organizationId, artistId } = parsed.data;
  const [[artist], [connection], serviceRows] = await Promise.all([
    db.select({ id: artists.id }).from(artists).where(and(eq(artists.id, artistId), eq(artists.organizationId, organizationId))).limit(1),
    db.select({ id: schedulingConnections.id, organizationId: schedulingConnections.organizationId, artistId: schedulingConnections.artistId, provider: schedulingConnections.provider, externalAccountId: schedulingConnections.externalAccountId, accountName: schedulingConnections.accountName, locationId: schedulingConnections.locationId, locationTimezone: schedulingConnections.locationTimezone, teamMemberId: schedulingConnections.teamMemberId, status: schedulingConnections.status, lastError: schedulingConnections.lastError, updatedAt: schedulingConnections.updatedAt }).from(schedulingConnections).where(and(eq(schedulingConnections.organizationId, organizationId), eq(schedulingConnections.artistId, artistId))).limit(1),
    db.select({ id: services.id, serviceType: services.serviceType, category: services.category, name: services.name, durationMinutes: services.durationMinutes, active: services.active }).from(services).where(and(eq(services.organizationId, organizationId), eq(services.artistId, artistId), eq(services.active, true))).orderBy(asc(services.sortOrder), asc(services.name)),
  ]);
  if (!artist) return NextResponse.json({ error: 'Artist not found.' }, { status: 404 });
  const mappingRows = connection ? await db.select({ id: serviceProviderMappings.id, serviceId: serviceProviderMappings.serviceId, locationId: serviceProviderMappings.locationId, serviceVariationId: serviceProviderMappings.externalServiceVariationId, serviceVariationVersion: serviceProviderMappings.externalServiceVariationVersion, teamMemberId: serviceProviderMappings.externalTeamMemberId }).from(serviceProviderMappings).where(and(
    eq(serviceProviderMappings.organizationId, organizationId),
    eq(serviceProviderMappings.artistId, artistId),
    eq(serviceProviderMappings.schedulingConnectionId, connection.id),
  )) : [];
  const mappings = mappingRows.map(mapping => ({ ...mapping, serviceVariationVersion: mapping.serviceVariationVersion?.toString() ?? null }));

  let bookingPermissions: {
    enabled: boolean;
    status: 'ENABLED' | 'READ_ONLY' | 'UNKNOWN';
    missingScopes: string[];
  } | null = null;

  if (connection?.provider === 'SQUARE' && connection.status === 'CONNECTED') {
    try {
      const [secureConnection] = await db.select()
        .from(schedulingConnections)
        .where(and(
          eq(schedulingConnections.id, connection.id),
          eq(schedulingConnections.organizationId, organizationId),
          eq(schedulingConnections.artistId, artistId),
        ))
        .limit(1);

      if (!secureConnection) throw new Error('Square connection not found.');

      const tokenStatus = await new SquareApiClient(
        await squareAccessToken(secureConnection),
      ).retrieveTokenStatus();

      const granted = new Set(tokenStatus.scopes ?? []);
      const missingScopes = squareBookingWriteScopes.filter(
        (scope: (typeof squareBookingWriteScopes)[number]) => !granted.has(scope),
      );

      bookingPermissions = {
        enabled: missingScopes.length === 0,
        status: missingScopes.length === 0 ? 'ENABLED' : 'READ_ONLY',
        missingScopes: [...missingScopes],
      };
    } catch (error) {
      console.error(JSON.stringify({
        event: 'square_token_status_failed',
        organizationId,
        artistId,
        status: error instanceof SquareApiError ? error.status : undefined,
        codes: error instanceof SquareApiError ? error.codes : undefined,
      }));

      bookingPermissions = {
        enabled: false,
        status: 'UNKNOWN',
        missingScopes: [],
      };
    }
  }

  return NextResponse.json({
    provider: !connection || connection.status === 'DISCONNECTED' ? 'MAIA' : connection.provider,
    connection: connection ?? null,
    services: serviceRows,
    mappings,
    bookingPermissions,
  });
}

async function findConnection(organizationId: string, artistId: string) {
  const [connection] = await db.select().from(schedulingConnections).where(and(
    eq(schedulingConnections.organizationId, organizationId),
    eq(schedulingConnections.artistId, artistId),
  )).limit(1);
  if (!connection || connection.provider !== 'SQUARE') return null;
  return connection;
}

async function handlePATCH(request: NextRequest) {
  const parsed = commandSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const input = parsed.data;
  const [artist] = await db.select({ id: artists.id }).from(artists).where(and(eq(artists.id, input.artistId), eq(artists.organizationId, input.organizationId))).limit(1);
  if (!artist) return NextResponse.json({ error: 'Artist not found.' }, { status: 404 });
  const connection = await findConnection(input.organizationId, input.artistId);
  if (!connection) return NextResponse.json({ error: 'Square is not connected for this provider.' }, { status: 409 });

  if (input.action === 'DISCONNECT') {
    await db.update(schedulingConnections).set({ status: 'DISCONNECTED', locationId: null, locationTimezone: null, teamMemberId: null, lastError: null, updatedAt: new Date() }).where(and(
      eq(schedulingConnections.id, connection.id), eq(schedulingConnections.organizationId, input.organizationId), eq(schedulingConnections.artistId, input.artistId),
    ));
    return NextResponse.json({ disconnected: true, provider: 'MAIA' });
  }
  if (connection.status !== 'CONNECTED') return NextResponse.json({ error: 'Reconnect Square before changing scheduling settings.' }, { status: 409 });

  let resources;
  try {
    resources = await getSquareSetupResources(connection);
  } catch (error) {
    console.error(JSON.stringify({ event: 'square_settings_validation_failed', organizationId: input.organizationId, artistId: input.artistId, status: error instanceof SquareApiError ? error.status : undefined, codes: error instanceof SquareApiError ? error.codes : undefined }));
    return NextResponse.json({ error: 'Square setup information is temporarily unavailable.' }, { status: 502 });
  }

  if (input.action === 'UPDATE_SETTINGS') {
    const location = input.locationId ? resources.locations.find(value => value.id === input.locationId) : null;
    if (input.locationId && !location) return NextResponse.json({ error: 'Select a location available in the connected Square account.' }, { status: 400 });
    if (input.teamMemberId && !resources.teamMembers.some(value => value.id === input.teamMemberId)) return NextResponse.json({ error: 'Select an active team member from the connected Square account.' }, { status: 400 });
    const [updated] = await db.update(schedulingConnections).set({
      locationId: location?.id ?? null,
      locationTimezone: location?.timezone ?? null,
      teamMemberId: location ? input.teamMemberId : null,
      updatedAt: new Date(),
    }).where(and(eq(schedulingConnections.id, connection.id), eq(schedulingConnections.organizationId, input.organizationId), eq(schedulingConnections.artistId, input.artistId)))
      .returning({ id: schedulingConnections.id, provider: schedulingConnections.provider, externalAccountId: schedulingConnections.externalAccountId, accountName: schedulingConnections.accountName, locationId: schedulingConnections.locationId, locationTimezone: schedulingConnections.locationTimezone, teamMemberId: schedulingConnections.teamMemberId, status: schedulingConnections.status });
    return NextResponse.json({ connection: updated });
  }

  if (input.action === 'SAVE_MAPPING') {
    if (!connection.locationId || input.locationId !== connection.locationId) return NextResponse.json({ error: 'Select this Square location before mapping services.' }, { status: 409 });
    const [[service], squareService] = await Promise.all([
      db.select({ id: services.id }).from(services).where(and(eq(services.id, input.serviceId), eq(services.organizationId, input.organizationId), eq(services.artistId, input.artistId), eq(services.active, true))).limit(1),
      Promise.resolve(resources.services.find(value => value.id === input.serviceVariationId)),
    ]);
    if (!service) return NextResponse.json({ error: 'Active Maia service not found.' }, { status: 404 });
    if (!squareService) return NextResponse.json({ error: 'Select a bookable service variation from the connected Square account.' }, { status: 400 });
    if (input.teamMemberId && !resources.teamMembers.some(value => value.id === input.teamMemberId)) return NextResponse.json({ error: 'Select an active team member from the connected Square account.' }, { status: 400 });
    const externalServiceVariationVersion = squareService.version == null ? null : BigInt(squareService.version);
    const [mapping] = await db.insert(serviceProviderMappings).values({
      organizationId: input.organizationId,
      artistId: input.artistId,
      schedulingConnectionId: connection.id,
      serviceId: service.id,
      locationId: connection.locationId,
      externalServiceVariationId: squareService.id,
      externalServiceVariationVersion,
      externalTeamMemberId: input.teamMemberId,
    }).onConflictDoUpdate({
      target: [serviceProviderMappings.schedulingConnectionId, serviceProviderMappings.serviceId, serviceProviderMappings.locationId],
      set: { externalServiceVariationId: squareService.id, externalServiceVariationVersion, externalTeamMemberId: input.teamMemberId, updatedAt: new Date() },
    }).returning({ id: serviceProviderMappings.id, serviceId: serviceProviderMappings.serviceId, locationId: serviceProviderMappings.locationId, serviceVariationId: serviceProviderMappings.externalServiceVariationId, serviceVariationVersion: serviceProviderMappings.externalServiceVariationVersion, teamMemberId: serviceProviderMappings.externalTeamMemberId });
    return NextResponse.json({ mapping: { ...mapping, serviceVariationVersion: mapping.serviceVariationVersion?.toString() ?? null } });
  }

  await db.delete(serviceProviderMappings).where(and(
    eq(serviceProviderMappings.organizationId, input.organizationId),
    eq(serviceProviderMappings.artistId, input.artistId),
    eq(serviceProviderMappings.schedulingConnectionId, connection.id),
    eq(serviceProviderMappings.serviceId, input.serviceId),
    eq(serviceProviderMappings.locationId, input.locationId),
  ));
  return NextResponse.json({ removed: true });
}

export const GET = protectedRoute(handleGET, true);
export const PATCH = protectedRoute(handlePATCH, true);