import type { AvailabilitySlot } from './types';

export type PresentedAvailabilitySlot = AvailabilitySlot & {
  localStart: string;
  localEnd: string;
  timezone: string;
};

export function presentAvailabilitySlot(slot: AvailabilitySlot, timeZone: string): PresentedAvailabilitySlot {
  return {
    ...slot,
    localStart: formatAvailabilityDateTime(slot.start, timeZone),
    localEnd: formatAvailabilityDateTime(slot.end, timeZone),
    timezone: timeZone,
  };
}

function formatAvailabilityDateTime(value: string, timeZone: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
    timeZone,
  }).format(date);
}