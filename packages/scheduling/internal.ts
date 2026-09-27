import { and, eq, gte, lt, or, isNull } from 'drizzle-orm';
import { db } from '@db/index';
import { appointments, availabilityRules } from '@db/schema';
import { getAvailableSlots } from '@booking/index';
import type { AvailabilityRequest, AvailabilityResult, ProviderAvailabilityInput, SchedulingProvider } from './types';

export async function getInternalAvailability(
  organizationId: string,
  artistId: string,
  input: AvailabilityRequest,
): Promise<AvailabilityResult> {
  const from = new Date(input.from);
  const to = new Date(input.to);
  if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime()) || to <= from) {
    return { status: 'PROVIDER_ERROR', slots: [], message: 'Availability could not be verified right now.' };
  }

  const rules = await db.select().from(availabilityRules).where(and(
    eq(availabilityRules.organizationId, organizationId),
    eq(availabilityRules.artistId, artistId),
    eq(availabilityRules.active, true),
  ));
  const now = new Date();
  const busyRows = await db.select({ startsAt: appointments.startsAt, endsAt: appointments.endsAt }).from(appointments).where(and(
    eq(appointments.organizationId, organizationId),
    eq(appointments.artistId, artistId),
    lt(appointments.startsAt, to),
    gte(appointments.endsAt, from),
    or(
      eq(appointments.status, 'CONFIRMED'),
      eq(appointments.status, 'COMPLETED'),
      and(or(eq(appointments.status, 'TENTATIVE'), eq(appointments.status, 'AI_HOLD')), or(isNull(appointments.holdExpiresAt), gte(appointments.holdExpiresAt, now))),
    ),
  ));
  const slots = getAvailableSlots(rules, busyRows, { from, to, durationMinutes: input.durationMinutes, slotIntervalMinutes: 30 })
    .slice(0, 20)
    .map(slot => ({ start: slot.startsAt.toISOString(), end: slot.endsAt.toISOString() }));
  return slots.length ? { status: 'AVAILABLE', slots } : { status: 'NO_AVAILABILITY', slots: [] };
}

export class InternalSchedulingProvider implements SchedulingProvider {
  readonly key = 'INTERNAL';

  getAvailability(input: ProviderAvailabilityInput) {
    return getInternalAvailability(input.organizationId, input.artistId, input);
  }
}