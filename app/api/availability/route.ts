import { protectedRoute } from '@/packages/auth/server';
import { NextRequest, NextResponse } from 'next/server';
import { and, eq, gte, lt } from 'drizzle-orm';
import { db } from '@db/index';
import { appointments, availabilityRules, calendarConnections } from '@db/schema';
import { GoogleCalendarAdapter } from '@integrations/index';
import { getAvailableSlots } from '@booking/index';
import { z } from 'zod';

const querySchema = z.object({
  organizationId: z.string().uuid(),
  artistId: z.string().uuid(),
  from: z.coerce.date(),
  to: z.coerce.date(),
  durationMinutes: z.coerce.number().int().positive().max(1440),
  slotIntervalMinutes: z.coerce.number().int().positive().max(240).optional(),
});

async function handleGET(request: NextRequest) {
  const parsed = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { organizationId, artistId, from, to, durationMinutes, slotIntervalMinutes } = parsed.data;
  if (to <= from) return NextResponse.json({ error: 'to must be after from' }, { status: 400 });

  const rules = await db.select().from(availabilityRules).where(and(eq(availabilityRules.organizationId, organizationId), eq(availabilityRules.artistId, artistId), eq(availabilityRules.active, true)));
  const now = new Date();
  const busyRows = await db.select({ startsAt: appointments.startsAt, endsAt: appointments.endsAt })
    .from(appointments)
    .where(and(
      eq(appointments.organizationId, organizationId),
      eq(appointments.artistId, artistId),
      lt(appointments.startsAt, to),
      gte(appointments.endsAt, from),
    ));
  const localBusy = busyRows.filter(row => row.endsAt > now);

  let calendarBusy: Array<{ startsAt: Date; endsAt: Date }> = [];
  const [connection] = await db.select().from(calendarConnections).where(and(eq(calendarConnections.organizationId, organizationId), eq(calendarConnections.artistId, artistId), eq(calendarConnections.provider, 'google'), eq(calendarConnections.active, true))).limit(1);
  if (connection?.accessTokenEncrypted && connection.calendarId) {
    try {
      const events = await new GoogleCalendarAdapter().listEvents({ accessToken: connection.accessTokenEncrypted, calendarId: connection.calendarId, from, to });
      calendarBusy = events.map(e => ({ startsAt: e.start, endsAt: e.end }));
    } catch {
      // If Google is temporarily unavailable, do not silently claim external availability.
      return NextResponse.json({ error: 'Google Calendar is connected but unavailable; availability cannot be verified right now.' }, { status: 503 });
    }
  }

  const slots = getAvailableSlots(rules, [...localBusy, ...calendarBusy], { from, to, durationMinutes, slotIntervalMinutes });
  return NextResponse.json({ slots });
}

export const GET = protectedRoute(handleGET, false);
