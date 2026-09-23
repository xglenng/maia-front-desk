export type CalendarEvent = { id: string; start: Date; end: Date; summary?: string };

export interface CalendarAdapter {
  listEvents(input: { accessToken: string; calendarId: string; from: Date; to: Date }): Promise<CalendarEvent[]>;
  createEvent(input: { accessToken: string; calendarId: string; summary: string; start: Date; end: Date; description?: string }): Promise<CalendarEvent>;
}

export class GoogleCalendarAdapter implements CalendarAdapter {
  async listEvents(input: { accessToken: string; calendarId: string; from: Date; to: Date }) {
    const url = new URL('https://www.googleapis.com/calendar/v3/calendars/' + encodeURIComponent(input.calendarId) + '/events');
    url.searchParams.set('timeMin', input.from.toISOString());
    url.searchParams.set('timeMax', input.to.toISOString());
    url.searchParams.set('singleEvents', 'true');
    url.searchParams.set('orderBy', 'startTime');
    const res = await fetch(url, { headers: { Authorization: `Bearer ${input.accessToken}` } });
    if (!res.ok) throw new Error(`Google Calendar list failed: ${res.status}`);
    const data = await res.json() as {
      items?: Array<{
        id?: string;
        summary?: string;
        start?: { dateTime?: string };
        end?: { dateTime?: string };
      }>;
    };
    return (data.items ?? []).filter(e => e.id && e.start?.dateTime && e.end?.dateTime).map(e => ({ id: e.id!, summary: e.summary, start: new Date(e.start!.dateTime!), end: new Date(e.end!.dateTime!) }));
  }

  async createEvent(input: { accessToken: string; calendarId: string; summary: string; start: Date; end: Date; description?: string }) {
    const res = await fetch('https://www.googleapis.com/calendar/v3/calendars/' + encodeURIComponent(input.calendarId) + '/events', {
      method: 'POST', headers: { Authorization: `Bearer ${input.accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ summary: input.summary, description: input.description, start: { dateTime: input.start.toISOString() }, end: { dateTime: input.end.toISOString() } })
    });
    if (!res.ok) throw new Error(`Google Calendar create failed: ${res.status}`);
    const e = await res.json() as { id: string; summary?: string; start: { dateTime: string }; end: { dateTime: string } };
    return { id: e.id, summary: e.summary, start: new Date(e.start.dateTime), end: new Date(e.end.dateTime) };
  }
}
