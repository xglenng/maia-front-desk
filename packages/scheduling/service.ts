import { and, eq } from 'drizzle-orm';
import { db } from '@db/index';
import { clients, organizations, schedulingConnections, services, serviceProviderMappings } from '@db/schema';
import { InternalSchedulingProvider } from './internal';
import { SquareSchedulingProvider } from './square/provider';
import { SquareApiError, type SquareErrorDetail } from './square/client';
import type { AvailabilityRequest, AvailabilityResult, ProviderAvailabilityInput, SchedulingProvider } from './types';

const providers = new Map<string, SchedulingProvider>([
  ['SQUARE', new SquareSchedulingProvider()],
]);
const internalProvider = new InternalSchedulingProvider();

export function resolveSchedulingProvider(provider: string | null, status: string | null) {
  if (!provider || status === 'DISCONNECTED') return { kind: 'INTERNAL' as const, implementation: internalProvider };
  if (status !== 'CONNECTED') return { kind: 'ERROR' as const };
  const implementation = providers.get(provider);
  return implementation ? { kind: 'EXTERNAL' as const, implementation } : { kind: 'ERROR' as const };
}

export function providerMappingMatches(
  mapping: { organizationId: string; artistId: string; schedulingConnectionId: string; serviceId: string; locationId: string },
  scope: { organizationId: string; artistId: string; schedulingConnectionId: string; serviceId: string; locationId: string },
) {
  return mapping.organizationId === scope.organizationId
    && mapping.artistId === scope.artistId
    && mapping.schedulingConnectionId === scope.schedulingConnectionId
    && mapping.serviceId === scope.serviceId
    && mapping.locationId === scope.locationId;
}

export async function invokeSchedulingProvider(provider: SchedulingProvider, input: ProviderAvailabilityInput) {
  try {
    return { result: await provider.getAvailability(input), error: null as unknown };
  } catch (error) {
    return {
      result: { status: 'PROVIDER_ERROR', slots: [], message: 'Scheduling could not be verified right now. The studio will follow up.' } as AvailabilityResult,
      error,
    };
  }
}

function logResolution(input: { organizationId: string; artistId: string; serviceId?: string; provider: string; queried: boolean; mappingFound: boolean; status: AvailabilityResult['status']; slotCount: number }) {
  console.info(JSON.stringify({ event: 'scheduling_availability', ...input }));
}

export function sanitizeSquareErrorDetails(errors: SquareErrorDetail[]) {
  return errors.map(error => ({
    ...(error.category ? { category: error.category } : {}),
    ...(error.code ? { code: error.code } : {}),
    ...(error.field ? { field: error.field } : {}),
    ...(error.detail ? { detail: redactSquareSecrets(error.detail) } : {}),
  }));
}

function redactSquareSecrets(value: string) {
  return value
    .replace(/\bBearer\s+[A-Za-z0-9._~+\/-]+=*/gi, 'Bearer [REDACTED]')
    .replace(/\b(access[_-]?token|refresh[_-]?token|authorization|oauth[_-]?code)\s*[:=]\s*[^,\s;]+/gi, '$1=[REDACTED]');
}

export async function getSchedulingAvailability(
  organizationId: string,
  artistId: string,
  input: AvailabilityRequest,
): Promise<AvailabilityResult> {
  try {
    return await resolveSchedulingAvailability(organizationId, artistId, input);
  } catch {
    console.error(JSON.stringify({ event: 'scheduling_resolution_failure', organizationId, artistId, serviceId: input.serviceId }));
    return { status: 'PROVIDER_ERROR', slots: [], message: 'Scheduling could not be verified right now. The studio will follow up.' };
  }
}

async function resolveSchedulingAvailability(
  organizationId: string,
  artistId: string,
  input: AvailabilityRequest,
): Promise<AvailabilityResult> {
  const [connection] = await db.select().from(schedulingConnections).where(and(
    eq(schedulingConnections.organizationId, organizationId),
    eq(schedulingConnections.artistId, artistId),
  )).limit(1);
  const resolution = resolveSchedulingProvider(connection?.provider ?? null, connection?.status ?? null);

  if (resolution.kind === 'INTERNAL') {
    const result = await resolution.implementation.getAvailability({ ...input, organizationId, artistId });
    logResolution({ organizationId, artistId, serviceId: input.serviceId, provider: 'INTERNAL', queried: true, mappingFound: false, status: result.status, slotCount: result.slots.length });
    return result;
  }
  if (resolution.kind === 'ERROR' || !connection) {
    const result: AvailabilityResult = { status: 'PROVIDER_ERROR', slots: [], message: 'Scheduling could not be verified right now. The studio will follow up.' };
    logResolution({ organizationId, artistId, serviceId: input.serviceId, provider: connection?.provider ?? 'UNKNOWN', queried: false, mappingFound: false, status: result.status, slotCount: 0 });
    return result;
  }
  if (!connection.locationId) {
    const result: AvailabilityResult = { status: 'NOT_CONFIGURED', slots: [], message: 'Scheduling for this provider is not fully configured yet.' };
    logResolution({ organizationId, artistId, serviceId: input.serviceId, provider: connection.provider, queried: false, mappingFound: false, status: result.status, slotCount: 0 });
    return result;
  }
  if (!input.serviceId) {
    const result: AvailabilityResult = { status: 'SERVICE_NOT_MAPPED', slots: [], message: 'This service is not configured for online availability yet.' };
    logResolution({ organizationId, artistId, provider: connection.provider, queried: false, mappingFound: false, status: result.status, slotCount: 0 });
    return result;
  }

  const [[service], [mapping], [organization]] = await Promise.all([
    db.select().from(services).where(and(eq(services.id, input.serviceId), eq(services.organizationId, organizationId), eq(services.artistId, artistId), eq(services.active, true))).limit(1),
    db.select().from(serviceProviderMappings).where(and(
      eq(serviceProviderMappings.organizationId, organizationId),
      eq(serviceProviderMappings.artistId, artistId),
      eq(serviceProviderMappings.schedulingConnectionId, connection.id),
      eq(serviceProviderMappings.serviceId, input.serviceId),
      eq(serviceProviderMappings.locationId, connection.locationId),
    )).limit(1),
    db.select({ timezone: organizations.timezone }).from(organizations).where(eq(organizations.id, organizationId)).limit(1),
  ]);
  const mappingScope = { organizationId, artistId, schedulingConnectionId: connection.id, serviceId: input.serviceId, locationId: connection.locationId };
  if (!service || !mapping || !providerMappingMatches(mapping, mappingScope)) {
    const result: AvailabilityResult = { status: 'SERVICE_NOT_MAPPED', slots: [], message: 'This service is not configured for online availability yet.' };
    logResolution({ organizationId, artistId, serviceId: input.serviceId, provider: connection.provider, queried: false, mappingFound: false, status: result.status, slotCount: 0 });
    return result;
  }

  const execution = await invokeSchedulingProvider(resolution.implementation, {
      ...input,
      organizationId,
      artistId,
      connection,
      mapping,
      service,
      locationTimezone: connection.locationTimezone || organization?.timezone || 'UTC',
  });
  if (execution.error) {
    const error = execution.error;
    const providerCode = error instanceof Error && 'codes' in error ? String((error as Error & { codes: string[] }).codes.join(',')) : 'UNKNOWN';
    console.error(JSON.stringify({
      event: 'scheduling_provider_failure',
      provider: connection.provider,
      organizationId,
      artistId,
      serviceId: input.serviceId,
      providerCode,
      ...(error instanceof SquareApiError ? {
        squareStatus: error.status,
        squareErrors: sanitizeSquareErrorDetails(error.errors),
      } : {}),
    }));
  }
  logResolution({ organizationId, artistId, serviceId: input.serviceId, provider: connection.provider, queried: true, mappingFound: true, status: execution.result.status, slotCount: execution.result.slots.length });
  return execution.result;
}

export async function usesInternalScheduling(organizationId: string, artistId: string) {
  const [connection] = await db.select({ provider: schedulingConnections.provider, status: schedulingConnections.status })
    .from(schedulingConnections)
    .where(and(eq(schedulingConnections.organizationId, organizationId), eq(schedulingConnections.artistId, artistId)))
    .limit(1);
  return resolveSchedulingProvider(connection?.provider ?? null, connection?.status ?? null).kind === 'INTERNAL';
}
export async function createSchedulingBooking(
  organizationId: string,
  artistId: string,
  input: import('./types').BookingRequest,
): Promise<import('./types').BookingResult> {
  const [connection] = await db.select().from(schedulingConnections).where(and(
    eq(schedulingConnections.organizationId, organizationId),
    eq(schedulingConnections.artistId, artistId),
  )).limit(1);
  const resolution = resolveSchedulingProvider(connection?.provider ?? null, connection?.status ?? null);
  if (resolution.kind !== 'EXTERNAL' || !connection || !resolution.implementation.createBooking || !connection.locationId) {
    return { status: 'NOT_CONFIGURED', message: 'External booking is not configured.' };
  }
  const [[service], [mapping], [client]] = await Promise.all([
    db.select().from(services).where(and(eq(services.id, input.serviceId), eq(services.organizationId, organizationId), eq(services.artistId, artistId), eq(services.active, true))).limit(1),
    db.select().from(serviceProviderMappings).where(and(
      eq(serviceProviderMappings.organizationId, organizationId), eq(serviceProviderMappings.artistId, artistId),
      eq(serviceProviderMappings.schedulingConnectionId, connection.id), eq(serviceProviderMappings.serviceId, input.serviceId),
      eq(serviceProviderMappings.locationId, connection.locationId),
    )).limit(1),
    db.select().from(clients).where(and(eq(clients.id, input.clientId), eq(clients.organizationId, organizationId))).limit(1),
  ]);
  if (!service || !mapping) return { status: 'SERVICE_NOT_MAPPED', message: 'This service is not configured for online booking.' };
  if (!client) return { status: 'CUSTOMER_ERROR', message: 'The client profile could not be loaded.' };
  try {
    return await resolution.implementation.createBooking({ ...input, organizationId, artistId, connection, mapping, service, client });
  } catch (error) {
    const providerCode = error instanceof Error && 'codes' in error ? String((error as Error & { codes: string[] }).codes.join(',')) : 'UNKNOWN';
    console.error(JSON.stringify({ event: 'scheduling_booking_provider_failure', provider: connection.provider, organizationId, artistId, serviceId: input.serviceId, providerCode,
      ...(error instanceof SquareApiError ? { squareStatus: error.status, squareErrors: sanitizeSquareErrorDetails(error.errors) } : {}) }));
    if (error instanceof SquareApiError && error.codes.some(code => ['BOOKING_INVALID', 'INVALID_VALUE', 'CONFLICTING_REQUEST'].includes(code))) {
      return { status: 'SLOT_UNAVAILABLE', message: 'That appointment time is no longer available.' };
    }
    return { status: 'PROVIDER_ERROR', message: 'The scheduling provider could not create the appointment.' };
  }
}
