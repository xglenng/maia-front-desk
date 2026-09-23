import { protectedRoute } from '@/packages/auth/server';
import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@db/index';
import { appointments, calendarConnections, clients } from '@db/schema';
import { GoogleCalendarAdapter } from '@integrations/index';

async function handleGET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const organizationId = request.nextUrl.searchParams.get('organizationId');
  if (!organizationId) return NextResponse.json({ error: 'organizationId is required' }, { status: 400 });
  const [row] = await db.select({ appointment: appointments, client: clients }).from(appointments).innerJoin(clients, eq(appointments.clientId, clients.id)).where(and(eq(appointments.id, id), eq(appointments.organizationId, organizationId)));
  if (!row) return NextResponse.json({ error: 'Appointment not found' }, { status: 404 });
  return NextResponse.json(row);
}

async function handleDELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const organizationId = request.nextUrl.searchParams.get('organizationId');
  if (!organizationId) return NextResponse.json({ error: 'organizationId is required' }, { status: 400 });
  const [appointment] = await db.select().from(appointments).where(and(eq(appointments.id, id), eq(appointments.organizationId, organizationId)));
  if (!appointment) return NextResponse.json({ error: 'Appointment not found' }, { status: 404 });
  const [updated] = await db.update(appointments).set({ status: 'CANCELLED', holdExpiresAt: null, updatedAt: new Date() }).where(eq(appointments.id, id)).returning();
  return NextResponse.json({ appointment: updated });
}

async function handlePOST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const organizationId = body.organizationId ?? request.nextUrl.searchParams.get('organizationId');
  if (!organizationId) return NextResponse.json({ error: 'organizationId is required' }, { status: 400 });
  const [appointment] = await db.select().from(appointments).where(and(eq(appointments.id, id), eq(appointments.organizationId, organizationId)));
  if (!appointment) return NextResponse.json({ error: 'Appointment not found' }, { status: 404 });
  if (appointment.status !== 'CONFIRMED') return NextResponse.json({ error: 'Only confirmed appointments can be synced to calendar' }, { status: 409 });
  const [connection] = await db.select().from(calendarConnections).where(and(eq(calendarConnections.organizationId, organizationId), eq(calendarConnections.artistId, appointment.artistId), eq(calendarConnections.provider, 'google'), eq(calendarConnections.active, true))).limit(1);
  if (!connection?.accessTokenEncrypted || !connection.calendarId) return NextResponse.json({ error: 'Google Calendar is not connected' }, { status: 409 });
  if (appointment.calendarEventId) return NextResponse.json({ appointment, synced: true });
  const event = await new GoogleCalendarAdapter().createEvent({ accessToken: connection.accessTokenEncrypted, calendarId: connection.calendarId, summary: 'Tattoo Appointment', start: appointment.startsAt, end: appointment.endsAt, description: appointment.notes ?? undefined });
  const [updated] = await db.update(appointments).set({ calendarEventId: event.id, updatedAt: new Date() }).where(eq(appointments.id, id)).returning();
  return NextResponse.json({ appointment: updated, synced: true });
}

export const GET = protectedRoute(handleGET, false);
export const DELETE = protectedRoute(handleDELETE, false);
export const POST = protectedRoute(handlePOST, false);
