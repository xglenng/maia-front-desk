import { SquareApiClient, type SquareAvailability } from './client';
import { squareAccessToken } from './credentials';
import { buildSquareSearchWindows, inRequestedWindow, resolveSquareDateWindow } from './time';
import type { AvailabilityResult, AvailabilitySlot, ProviderAvailabilityInput, SchedulingProvider } from '../types';

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
    const durationMinutes = segment.duration_minutes || selection.durationMinutes;
    if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) continue;
    const end = new Date(start.getTime() + durationMinutes * 60_000);
    slots.set(start.toISOString(), { start: start.toISOString(), end: end.toISOString() });
  }
  return [...slots.values()].sort((a, b) => a.start.localeCompare(b.start)).slice(0, 20);
}

export class SquareSchedulingProvider implements SchedulingProvider {
  readonly key = 'SQUARE';

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