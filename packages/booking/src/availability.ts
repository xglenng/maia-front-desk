import type { AvailabilityRule, BusyInterval, Slot, AvailabilityOptions } from './types';
import { localDateString, localDateTimeToUtc } from './time';

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

function addCalendarDays(value: string, count: number) {
  const [year, month, day] = value.split('-').map(Number);
  const next = new Date(Date.UTC(year!, month! - 1, day! + count));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}-${String(next.getUTCDate()).padStart(2, '0')}`;
}

function getZonedAvailableSlots(rules: AvailabilityRule[], busy: BusyInterval[], options: AvailabilityOptions & { timeZone: string }): Slot[] {
  const interval = options.slotIntervalMinutes ?? 30;
  const before = options.bufferBeforeMinutes ?? 0;
  const after = options.bufferAfterMinutes ?? 0;
  const firstDate = localDateString(options.from, options.timeZone);
  const lastDate = localDateString(new Date(options.to.getTime() - 1), options.timeZone);
  const results: Slot[] = [];

  for (let date = firstDate; date <= lastDate; date = addCalendarDays(date, 1)) {
    const [year, month, day] = date.split('-').map(Number);
    const dayOfWeek = new Date(Date.UTC(year!, month! - 1, day!)).getUTCDay();
    const dayRules = rules.filter(rule => rule.active && rule.dayOfWeek === dayOfWeek);

    for (const rule of dayRules) {
      for (let minute = rule.startMinute; minute + options.durationMinutes <= rule.endMinute; minute += interval) {
        const hour = Math.floor(minute / 60);
        const localMinute = minute % 60;
        const localStart = `${date}T${String(hour).padStart(2, '0')}:${String(localMinute).padStart(2, '0')}:00`;
        const startsAt = localDateTimeToUtc(localStart, options.timeZone);
        if (!Number.isFinite(startsAt.getTime())) continue;
        const endsAt = new Date(startsAt.getTime() + options.durationMinutes * 60_000);
        const protectedStart = new Date(startsAt.getTime() - before * 60_000);
        const protectedEnd = new Date(endsAt.getTime() + after * 60_000);

        if (startsAt < options.from || endsAt > options.to || (options.now && startsAt < options.now)) continue;
        if (busy.some(item => overlaps(protectedStart, protectedEnd, item.startsAt, item.endsAt))) continue;
        results.push({ startsAt, endsAt });
      }
    }
  }
  return results;
}

export function getAvailableSlots(
  rules: AvailabilityRule[],
  busy: BusyInterval[],
  options: AvailabilityOptions,
): Slot[] {
  if (options.timeZone) return getZonedAvailableSlots(rules, busy, { ...options, timeZone: options.timeZone });
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
