export function calendarMinute(value: string, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(value));
  return Number(parts.find(part => part.type === 'hour')?.value) * 60 + Number(parts.find(part => part.type === 'minute')?.value);
}
export function calendarBlock(startsAt: string, endsAt: string, timeZone: string, firstHour = 9) {
  const start = calendarMinute(startsAt, timeZone);
  const duration = Math.max(1, (new Date(endsAt).getTime() - new Date(startsAt).getTime()) / 60000);
  return { top: start - firstHour * 60, height: duration };
}
