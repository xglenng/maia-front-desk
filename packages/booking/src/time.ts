export function localDateParts(value: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
  return Object.fromEntries(formatter.formatToParts(value).map(part => [part.type, part.value]));
}

export function localDateString(value: Date, timeZone: string) {
  const parts = localDateParts(value, timeZone);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function localDateTimeToUtc(value: string, timeZone: string) {
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
  const finalParts = Object.fromEntries(formatter.formatToParts(new Date(candidate)).map(part => [part.type, part.value]));
  if (Number(finalParts.year) !== Number(year) || Number(finalParts.month) !== Number(month) || Number(finalParts.day) !== Number(day) || Number(finalParts.hour) !== Number(hour) || Number(finalParts.minute) !== Number(minute)) {
    return new Date(Number.NaN);
  }
  return new Date(candidate);
}
