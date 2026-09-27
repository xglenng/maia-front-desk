const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const MAX_RANGE_MS = 31 * DAY_MS;

function localDateTimeToUtc(value: string, timeZone: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?)?$/);
  if (!match) return new Date(Number.NaN);
  const [, year, month, day, hour = '0', minute = '0', second = '0', millis = '0'] = match;
  const wanted = Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second), Number(millis.padEnd(3, '0')));
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  });
  let candidate = wanted;
  for (let attempt = 0; attempt < 4; attempt++) {
    const parts = Object.fromEntries(formatter.formatToParts(new Date(candidate)).map(part => [part.type, part.value]));
    const represented = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second));
    const adjustment = wanted - represented;
    candidate += adjustment;
    if (adjustment === 0) break;
  }
  return new Date(candidate);
}

export function parseSchedulingDate(value: string, timeZone: string) {
  if (/(?:Z|[+-]\d{2}:?\d{2})$/i.test(value)) return new Date(value);
  return localDateTimeToUtc(value, timeZone);
}

export function buildSquareSearchWindows(from: Date, to: Date) {
  if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime()) || to <= from) throw new RangeError('Invalid availability range.');
  const ranges: Array<{ startAt: Date; endAt: Date }> = [];
  if (to.getTime() - from.getTime() < DAY_MS) {
    return [{ startAt: new Date(to.getTime() - DAY_MS), endAt: new Date(to) }];
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