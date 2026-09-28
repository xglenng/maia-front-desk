import { SquareApiClient, squareSafeNumber, type SquareAvailability } from './client';
import { squareAccessToken } from './credentials';
import { buildSquareSearchWindows, inRequestedWindow, resolveSquareDateWindow } from './time';
import type { AvailabilityResult, AvailabilitySlot, BookingResult, ProviderAvailabilityInput, ProviderBookingInput, SchedulingProvider } from '../types';

export function translateSquareAvailability(
  availabilities: SquareAvailability[],
  selection: { locationId: string; serviceVariationId: string; teamMemberId?: string | null; durationMinutes: number },
  from: Date,
  to: Date,
): AvailabilitySlot[] {
  const slots = new Map<string, AvailabilitySlot>();
  for (const availability of availabilities) {
    if (availability.location_id !== selection.locationId || !availability.start_at) continue;
    const segment = availability.appointment_segments?.find(value => value.service_variation_id === selection.serviceVariationId);
    if (!segment || (selection.teamMemberId && segment.team_member_id !== selection.teamMemberId)) continue;
    const start = new Date(availability.start_at);
    if (!Number.isFinite(start.getTime()) || !inRequestedWindow(start, from, to)) continue;
    const durationMinutes = squareSafeNumber(segment.duration_minutes) || selection.durationMinutes;
    if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) continue;
    const end = new Date(start.getTime() + durationMinutes * 60_000);
    slots.set(start.toISOString(), { start: start.toISOString(), end: end.toISOString() });
  }
  return [...slots.values()].sort((a, b) => a.start.localeCompare(b.start)).slice(0, 20);
}

export class SquareSchedulingProvider implements SchedulingProvider {
  readonly key = 'SQUARE';

  async createBooking(input: ProviderBookingInput): Promise<BookingResult> {
    const teamMemberId = input.mapping.externalTeamMemberId || input.connection.teamMemberId;
    const version = input.mapping.externalServiceVariationVersion;
    if (!input.connection.locationId || !teamMemberId || version == null) {
      return { status: 'NOT_CONFIGURED', message: 'Square booking is not fully configured yet.' };
    }
    const start = new Date(input.start);
    if (!Number.isFinite(start.getTime()) || start <= new Date()) return { status: 'SLOT_UNAVAILABLE', message: 'That appointment time is no longer available.' };
    const client = new SquareApiClient(await squareAccessToken(input.connection));

const appointmentEnd = new Date(
  start.getTime() + input.service.durationMinutes * 60_000,
);

// Square requires availability searches to span at least one hour.
// This only widens the verification query; it does not change the
// requested appointment duration.
const availabilitySearchEnd = new Date(
  start.getTime() + Math.max(60, input.service.durationMinutes + 1) * 60_000,
);

const availability = await client.searchAvailability({
  locationId: input.mapping.locationId,
  serviceVariationId: input.mapping.externalServiceVariationId,
  teamMemberId,
  startAt: start.toISOString(),
  endAt: availabilitySearchEnd.toISOString(),
});

const exact = translateSquareAvailability(
  availability.availabilities || [],
  {
    locationId: input.mapping.locationId,
    serviceVariationId: input.mapping.externalServiceVariationId,
    teamMemberId,
    durationMinutes: input.service.durationMinutes,
  },
  start,
  availabilitySearchEnd,
).find(
  slot =>
    slot.start === start.toISOString() &&
    slot.end === appointmentEnd.toISOString(),
);
    if (!exact) return { status: 'SLOT_UNAVAILABLE', message: 'That appointment time is no longer available.' };

    const providerCustomerId = input.client.providerCustomerId || await client.createCustomer({
      idempotencyKey: `maia-customer-${input.client.id}`,
      givenName: input.client.firstName,
      familyName: input.client.lastName,
      email: input.client.email,
      phone: input.client.phone,
      referenceId: input.client.id,
    });
    const booking = await client.createBooking({
      idempotencyKey: input.idempotencyKey,
      locationId: input.mapping.locationId,
      customerId: providerCustomerId,
      startAt: exact.start,
      durationMinutes: input.service.durationMinutes,
      serviceVariationId: input.mapping.externalServiceVariationId,
      serviceVariationVersion: version.toString(),
      teamMemberId,
    });
    return { status: 'BOOKED', provider: 'SQUARE', providerBookingId: booking.id!, providerCustomerId, start: exact.start, end: exact.end };
  }

  async getAvailability(input: ProviderAvailabilityInput): Promise<AvailabilityResult> {
    if (!input.connection || !input.mapping || !input.service || !input.locationTimezone) {
      return { status: 'NOT_CONFIGURED', slots: [], message: 'Square scheduling is not fully configured yet.' };
    }
    const window = resolveSquareDateWindow(input.from, input.to, input.locationTimezone, input.now ?? new Date());
    if (window.status === 'PAST') return { status: 'PROVIDER_ERROR', slots: [], message: 'The requested date is in the past.' };
    const { from, to } = window;
    if (to <= from) return { status: 'PROVIDER_ERROR', slots: [], message: 'The requested availability window has elapsed.' };
    const windows = buildSquareSearchWindows(from, to, { preserveStart: true });
    const client = new SquareApiClient(await squareAccessToken(input.connection));
    const availabilities: SquareAvailability[] = [];
    for (const range of windows) {
      const result = await client.searchAvailability({
        locationId: input.mapping.locationId,
        serviceVariationId: input.mapping.externalServiceVariationId,
        teamMemberId: input.mapping.externalTeamMemberId || input.connection.teamMemberId,
        startAt: range.startAt.toISOString(),
        endAt: range.endAt.toISOString(),
      });
      availabilities.push(...(result.availabilities || []));
    }
    const slots = translateSquareAvailability(availabilities, {
      locationId: input.mapping.locationId,
      serviceVariationId: input.mapping.externalServiceVariationId,
      teamMemberId: input.mapping.externalTeamMemberId || input.connection.teamMemberId,
      durationMinutes: input.service.durationMinutes,
    }, from, to);
    return slots.length ? { status: 'AVAILABLE', slots } : { status: 'NO_AVAILABILITY', slots: [] };
  }
}