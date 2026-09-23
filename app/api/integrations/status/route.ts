import { protectedRoute } from '@/packages/auth/server';
import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@db/index';
import { calendarConnections } from '@db/schema';

async function handleGET(request: NextRequest) {
  const organizationId = request.nextUrl.searchParams.get('organizationId');
  const artistId = request.nextUrl.searchParams.get('artistId');
  if (!organizationId || !artistId) return NextResponse.json({ error: 'organizationId and artistId are required' }, { status: 400 });
  const [calendar] = await db.select({ id: calendarConnections.id, provider: calendarConnections.provider, calendarId: calendarConnections.calendarId, active: calendarConnections.active, expiresAt: calendarConnections.expiresAt }).from(calendarConnections).where(and(eq(calendarConnections.organizationId, organizationId), eq(calendarConnections.artistId, artistId), eq(calendarConnections.active, true))).limit(1);
  return NextResponse.json({ googleCalendar: calendar ?? null, stripeConfigured: Boolean(process.env.STRIPE_SECRET_KEY) });
}

export const GET = protectedRoute(handleGET, false);
