import type { AvailabilityRule, BusyInterval, Slot, AvailabilityOptions } from './types';

const MINUTES_PER_DAY = 24 * 60;

function startOfDay(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60_000);
}

function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date) {
  return aStart < bEnd && aEnd > bStart;
}

export function getAvailableSlots(
  rules: AvailabilityRule[],
  busy: BusyInterval[],
  options: AvailabilityOptions,
): Slot[] {
  const interval = options.slotIntervalMinutes ?? 30;
  const before = options.bufferBeforeMinutes ?? 0;
  const after = options.bufferAfterMinutes ?? 0;
  const results: Slot[] = [];

  for (let day = startOfDay(options.from); day < options.to; day = addMinutes(day, MINUTES_PER_DAY)) {
    const dayOfWeek = day.getDay();
    const dayRules = rules.filter((rule) => rule.active && rule.dayOfWeek === dayOfWeek);

    for (const rule of dayRules) {
      for (let minute = rule.startMinute; minute + options.durationMinutes <= rule.endMinute; minute += interval) {
        const startsAt = addMinutes(day, minute);
        const endsAt = addMinutes(startsAt, options.durationMinutes);
        const protectedStart = addMinutes(startsAt, -before);
        const protectedEnd = addMinutes(endsAt, after);

        if (startsAt < options.from || endsAt > options.to) continue;

        const isBusy = busy.some((item) =>
          overlaps(protectedStart, protectedEnd, item.startsAt, item.endsAt),
        );
        if (!isBusy) results.push({ startsAt, endsAt });
      }
    }
  }

  return results;
}
