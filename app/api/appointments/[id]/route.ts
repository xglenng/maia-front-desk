import { googleAccessToken } from "@/packages/integrations/google-credentials";
import { identity, protectedRoute } from '@/packages/auth/server';
import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@db/index';
import { appointments, artists, calendarConnections, clients, externalWaiverAssignments, externalWaiverForms, payments, services, waiverSubmissions, waiverTemplates } from '@db/schema';
import { GoogleCalendarAdapter } from '@integrations/index';
import { canAccessArtist } from '@/packages/inbox/state';
import { cancelAppointmentLifecycleJobs, cancelAppointmentPreCompletionJobs, scheduleAppointmentCompletionFollowups } from '@/packages/automations/lifecycle.server';
import { z } from 'zod';

async function handleGET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const organizationId = request.nextUrl.searchParams.get('organizationId');
  if (!organizationId) return NextResponse.json({ error: 'organizationId is required' }, { status: 400 });
  const user = await identity(request);
  if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  const [row] = await db.select({ appointment: appointments, client: clients, service: services, artistUserId: artists.userId }).from(appointments)
    .innerJoin(artists, and(eq(appointments.artistId, artists.id), eq(artists.organizationId, appointments.organizationId)))
    .innerJoin(clients, and(eq(appointments.clientId, clients.id), eq(clients.organizationId, appointments.organizationId)))
    .leftJoin(services, and(eq(appointments.serviceId, services.id), eq(services.organizationId, appointments.organizationId)))
    .where(and(eq(appointments.id, id), eq(appointments.organizationId, organizationId)));
  if (!row || !canAccessArtist(user.role, user.id, row.artistUserId)) return NextResponse.json({ error: 'Appointment not found' }, { status: 404 });
  const paymentRows = await db.select().from(payments).where(and(eq(payments.appointmentId, id), eq(payments.organizationId, organizationId)));
  const [externalWaivers, signedWaivers] = await Promise.all([
    db.select({ id: externalWaiverAssignments.id, status: externalWaiverAssignments.status, sentAt: externalWaiverAssignments.sentAt, completedAt: externalWaiverAssignments.completedAt, formName: externalWaiverForms.name })
      .from(externalWaiverAssignments).innerJoin(externalWaiverForms, eq(externalWaiverAssignments.waiverFormId, externalWaiverForms.id))
      .where(and(eq(externalWaiverAssignments.organizationId, organizationId), eq(externalWaiverAssignments.appointmentId, id))),
    db.select({ id: waiverSubmissions.id, signedAt: waiverSubmissions.signedAt, templateName: waiverTemplates.name })
      .from(waiverSubmissions).innerJoin(waiverTemplates, eq(waiverSubmissions.waiverTemplateId, waiverTemplates.id))
      .where(and(eq(waiverSubmissions.organizationId, organizationId), eq(waiverSubmissions.appointmentId, id))),
  ]);
  return NextResponse.json({ appointment: row.appointment, client: row.client, service: row.service, payments: paymentRows, externalWaivers, signedWaivers });
}

async function handleDELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const organizationId = request.nextUrl.searchParams.get('organizationId');
  if (!organizationId) return NextResponse.json({ error: 'organizationId is required' }, { status: 400 });
  const [appointment] = await db.select().from(appointments).where(and(eq(appointments.id, id), eq(appointments.organizationId, organizationId)));
  if (!appointment) return NextResponse.json({ error: 'Appointment not found' }, { status: 404 });
  const user = await identity(request);
  if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  const [artist] = await db.select({ userId: artists.userId }).from(artists).where(and(eq(artists.id, appointment.artistId), eq(artists.organizationId, organizationId))).limit(1);
  if (!artist || !canAccessArtist(user.role, user.id, artist.userId)) return NextResponse.json({ error: 'Appointment not found' }, { status: 404 });
  const [updated] = await db.update(appointments).set({ status: 'CANCELLED', holdExpiresAt: null, updatedAt: new Date() }).where(eq(appointments.id, id)).returning();
  await cancelAppointmentLifecycleJobs(id);
  return NextResponse.json({ appointment: updated });
}

async function handlePATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = z.object({ organizationId: z.string().uuid(), action: z.literal('MARK_COMPLETE') }).strict().safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const user = await identity(request);
  if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  const [row] = await db.select({ appointment: appointments, artistUserId: artists.userId }).from(appointments)
    .innerJoin(artists, and(eq(appointments.artistId, artists.id), eq(artists.organizationId, appointments.organizationId)))
    .where(and(eq(appointments.id, id), eq(appointments.organizationId, parsed.data.organizationId))).limit(1);
  if (!row || !canAccessArtist(user.role, user.id, row.artistUserId)) return NextResponse.json({ error: 'Appointment not found' }, { status: 404 });
  if (row.appointment.status === 'COMPLETED' && row.appointment.completedAt) {
    const followups = await scheduleAppointmentCompletionFollowups(id, row.appointment.completedAt);
    return NextResponse.json({ appointment: row.appointment, followups: followups.scheduled, duplicate: true });
  }
  if (row.appointment.status !== 'CONFIRMED') return NextResponse.json({ error: 'Only confirmed appointments can be marked complete.' }, { status: 409 });
  const completedAt = new Date();
  const [appointment] = await db.update(appointments).set({ status: 'COMPLETED', completedAt, updatedAt: completedAt })
    .where(and(eq(appointments.id, id), eq(appointments.organizationId, parsed.data.organizationId), eq(appointments.status, 'CONFIRMED'))).returning();
  if (!appointment) return NextResponse.json({ error: 'Appointment state changed before completion.' }, { status: 409 });
  await cancelAppointmentPreCompletionJobs(id);
  const followups = await scheduleAppointmentCompletionFollowups(id, completedAt);
  return NextResponse.json({ appointment, followups: followups.scheduled });
}

async function handlePOST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const organizationId = body.organizationId ?? request.nextUrl.searchParams.get('organizationId');
  if (!organizationId) return NextResponse.json({ error: 'organizationId is required' }, { status: 400 });
  const [appointment] = await db.select().from(appointments).where(and(eq(appointments.id, id), eq(appointments.organizationId, organizationId)));
  if (!appointment) return NextResponse.json({ error: 'Appointment not found' }, { status: 404 });
  if (appointment.status !== 'CONFIRMED') return NextResponse.json({ error: 'Only confirmed appointments can be synced to calendar' }, { status: 409 });
  const connections = await db.select().from(calendarConnections).where(and(eq(calendarConnections.organizationId, organizationId), eq(calendarConnections.artistId, appointment.artistId), eq(calendarConnections.provider, 'google'), eq(calendarConnections.active, true))).limit(2);
  if (connections.length > 1) return NextResponse.json({ error: 'Google Calendar connection is ambiguous. Contact support.' }, { status: 503 });
  const connection = connections[0];
  if (!connection?.accessTokenEncrypted || !connection.calendarId) return NextResponse.json({ error: 'Google Calendar is not connected' }, { status: 409 });
  if (appointment.calendarEventId) return NextResponse.json({ appointment, synced: true });
  try {
    const accessToken = await googleAccessToken({ organizationId, artistId: appointment.artistId, calendarId: connection.calendarId });
    const event = await new GoogleCalendarAdapter().createEvent({ accessToken, calendarId: connection.calendarId, summary: 'Tattoo Appointment', start: appointment.startsAt, end: appointment.endsAt, description: appointment.notes ?? undefined });
    const [updated] = await db.update(appointments).set({ calendarEventId: event.id, updatedAt: new Date() }).where(eq(appointments.id, id)).returning();
    return NextResponse.json({ appointment: updated, synced: true });
  } catch { return NextResponse.json({ error: 'Google Calendar is unavailable. Synchronization could not be verified.' }, { status: 503 }); }
}

export const GET = protectedRoute(handleGET, false);
export const DELETE = protectedRoute(handleDELETE, false);
export const PATCH = protectedRoute(handlePATCH, false);
export const POST = protectedRoute(handlePOST, false);
