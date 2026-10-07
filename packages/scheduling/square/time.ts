import { localDateParts, localDateString, localDateTimeToUtc } from '@booking/time';
export { localDateString, localDateTimeToUtc };

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const MAX_RANGE_MS = 31 * DAY_MS;

const MONTHS = new Map([
  ['january', 1], ['jan', 1], ['february', 2], ['feb', 2], ['march', 3], ['mar', 3],
  ['april', 4], ['apr', 4], ['may', 5], ['june', 6], ['jun', 6], ['july', 7], ['jul', 7],
  ['august', 8], ['aug', 8], ['september', 9], ['sep', 9], ['sept', 9], ['october', 10], ['oct', 10],
  ['november', 11], ['nov', 11], ['december', 12], ['dec', 12],
]);

function dateOnlyValue(value: string, timeZone: string, referenceDate: Date) {
  const normalized = value.trim().replace(/(\d)(st|nd|rd|th)\b/gi, '$1').replace(/,/g, '');
  const iso = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return normalized;
  const natural = normalized.match(/^([A-Za-z]+)\s+(\d{1,2})(?:\s+(\d{4}))?$/);
  if (!natural) return null;
  const month = MONTHS.get(natural[1].toLowerCase());
  if (!month) return null;
  const year = natural[3] || localDateParts(referenceDate, timeZone).year;
  return `${year}-${String(month).padStart(2, '0')}-${String(Number(natural[2])).padStart(2, '0')}`;
}

export function parseSchedulingDate(value: string, timeZone: string, referenceDate = new Date()) {
  if (/(?:Z|[+-]\d{2}:?\d{2})$/i.test(value)) return new Date(value);
  const dateOnly = dateOnlyValue(value, timeZone, referenceDate);
  return localDateTimeToUtc(dateOnly || value, timeZone);
}

export function isSchedulingDateOnly(value: string) {
  return !/[T ]\d{2}:\d{2}/.test(value) && !/(?:Z|[+-]\d{2}:?\d{2})$/i.test(value);
}

export function sameLocalCalendarDate(first: Date, second: Date, timeZone: string) {
  return localDateString(first, timeZone) === localDateString(second, timeZone);
}

export function addLocalDays(value: Date, days: number, timeZone: string) {
  const parts = localDateParts(value, timeZone);
  const calendar = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day) + days));
  return parseSchedulingDate(localDateString(calendar, 'UTC'), timeZone, value);
}

export type SquareDateWindow = {
  status: 'PAST' | 'TODAY' | 'FUTURE';
  from: Date;
  to: Date;
};

export function resolveSquareDateWindow(fromValue: string, toValue: string, timeZone: string, now: Date): SquareDateWindow {
  let from = parseSchedulingDate(fromValue, timeZone, now);
  let to = parseSchedulingDate(toValue, timeZone, now);
  if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime())) throw new RangeError('Invalid availability range.');
  if (isSchedulingDateOnly(fromValue) && isSchedulingDateOnly(toValue) && sameLocalCalendarDate(from, to, timeZone)) {
    to = addLocalDays(from, 1, timeZone);
  }
  const requestedDate = localDateString(from, timeZone);
  const currentDate = localDateString(now, timeZone);
  if (requestedDate < currentDate) return { status: 'PAST', from, to };
  if (requestedDate === currentDate) {
    from = new Date(Math.max(from.getTime(), now.getTime()));
    return { status: 'TODAY', from, to };
  }
  return { status: 'FUTURE', from, to };
}

export function buildSquareSearchWindows(from: Date, to: Date, options: { preserveStart?: boolean } = {}) {
  if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime()) || to <= from) throw new RangeError('Invalid availability range.');
  const ranges: Array<{ startAt: Date; endAt: Date }> = [];
  if (to.getTime() - from.getTime() < DAY_MS) {
    return [{ startAt: options.preserveStart ? new Date(from) : new Date(to.getTime() - DAY_MS), endAt: new Date(options.preserveStart ? Math.max(to.getTime(), from.getTime() + DAY_MS) : to.getTime()) }];
  }
  let cursor = from.getTime();
  const finish = to.getTime();
  while (cursor < finish) {
    const remaining = finish - cursor;
    if (remaining < DAY_MS && ranges.length) {
      const previous = ranges.pop()!;
      const finalStart = finish - DAY_MS;
      ranges.push({ startAt: previous.startAt, endAt: new Date(finalStart) });
      ranges.push({ startAt: new Date(finalStart), endAt: new Date(finish) });
      break;
    }
    const end = Math.min(cursor + MAX_RANGE_MS, finish);
    ranges.push({ startAt: new Date(cursor), endAt: new Date(end) });
    cursor = end;
  }
  return ranges;
}

export function inRequestedWindow(value: Date, from: Date, to: Date) {
  return value >= from && value < to;
}