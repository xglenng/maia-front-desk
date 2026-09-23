import crypto from "node:crypto";
import { protectedRoute, identity } from "@/packages/auth/server";
import { canAccessArtist } from "@/packages/inbox/state";
import { ageOn, appendTrackingToken, selectWaiverForm } from "@waivers/selection";
import { sendStudioSms } from "@integrations/studio-sms";
import { NextRequest, NextResponse } from "next/server";
import { and, asc, desc, eq, gte, inArray, lte } from "drizzle-orm";
import { z } from "zod";
import { db } from "@db/index";
import { appointments, artists, automationJobs, clients, conversations, externalWaiverAssignments, externalWaiverEvents, externalWaiverForms, messages, organizations, services } from "@db/schema";

const sendSchema = z.object({ appointmentId: z.string().uuid(), externalWaiverFormId: z.string().uuid().optional() });

async function handleGET(request: NextRequest) {
  const user = await identity(request);
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const now = new Date();
  const end = new Date(now.getTime() + 60 * 86_400_000);
  const conditions = [eq(appointments.organizationId, user.organization_id), gte(appointments.startsAt, new Date(now.getTime() - 86_400_000)), lte(appointments.startsAt, end)];
  if (user.role === "ARTIST") conditions.push(eq(artists.userId, user.id));
  const rows = await db.select({
    appointment: appointments,
    clientName: clients.firstName,
    clientLastName: clients.lastName,
    clientPhone: clients.phone,
    clientSmsOptIn: clients.smsOptIn,
    clientDateOfBirth: clients.dateOfBirth,
    artistName: artists.displayName,
    serviceName: services.name,
  }).from(appointments)
    .innerJoin(clients, eq(appointments.clientId, clients.id))
    .innerJoin(artists, eq(appointments.artistId, artists.id))
    .leftJoin(services, eq(appointments.serviceId, services.id))
    .where(and(...conditions)).orderBy(asc(appointments.startsAt));
  const appointmentIds = rows.map(row => row.appointment.id);
  const assignmentRows = appointmentIds.length ? await db.select({ assignment: externalWaiverAssignments, formName: externalWaiverForms.name, provider: externalWaiverForms.provider }).from(externalWaiverAssignments).innerJoin(externalWaiverForms, eq(externalWaiverAssignments.waiverFormId, externalWaiverForms.id)).where(inArray(externalWaiverAssignments.appointmentId, appointmentIds)).orderBy(desc(externalWaiverAssignments.createdAt)) : [];
  const byAppointment = new Map<string, typeof assignmentRows>();
  for (const assignment of assignmentRows) byAppointment.set(assignment.assignment.appointmentId, [...(byAppointment.get(assignment.assignment.appointmentId) ?? []), assignment]);
  return NextResponse.json({ appointments: rows.map(row => ({ ...row, clientName: `${row.clientName}${row.clientLastName ? ` ${row.clientLastName}` : ""}`, assignments: byAppointment.get(row.appointment.id) ?? [] })) });
}

async function handlePOST(request: NextRequest) {
  const user = await identity(request);
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const parsed = sendSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const [row] = await db.select({ appointment: appointments, client: clients, artist: artists, organization: organizations })
    .from(appointments).innerJoin(clients, eq(appointments.clientId, clients.id)).innerJoin(artists, eq(appointments.artistId, artists.id)).innerJoin(organizations, eq(appointments.organizationId, organizations.id))
    .where(and(eq(appointments.id, parsed.data.appointmentId), eq(appointments.organizationId, user.organization_id)));
  if (!row || !canAccessArtist(user.role, user.id, row.artist.userId)) return NextResponse.json({ error: "Appointment not found" }, { status: 404 });
  if (!row.client.phone || !row.client.smsOptIn) return NextResponse.json({ error: "Client is not opted in to SMS or has no phone number." }, { status: 409 });
  const forms = await db.select().from(externalWaiverForms).where(and(eq(externalWaiverForms.organizationId, user.organization_id), eq(externalWaiverForms.active, true)));
  const age = ageOn(row.client.dateOfBirth, row.appointment.startsAt);
  const selected = parsed.data.externalWaiverFormId ? forms.find(form => form.id === parsed.data.externalWaiverFormId) : selectWaiverForm(forms, { artistId: row.artist.id, serviceId: row.appointment.serviceId, isMinor: age == null ? null : age < 18 });
  if (!selected) return NextResponse.json({ error: age == null ? "No universal waiver matches this appointment. Add the client's birth date or choose a form manually." : "No active waiver form matches this appointment." }, { status: 409 });
  const rawToken = crypto.randomBytes(24).toString("hex");
  const trackingTokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
  const waiverUrl = appendTrackingToken(selected.formUrl, rawToken);
  const dueAt = new Date(Math.max(Date.now(), row.appointment.startsAt.getTime() - 24 * 60 * 60 * 1000));
  const [assignment] = await db.insert(externalWaiverAssignments).values({ organizationId: user.organization_id, waiverFormId: selected.id, appointmentId: row.appointment.id, clientId: row.client.id, trackingTokenHash, dueAt, status: "PENDING" }).returning();
  const body = `${row.organization.name}: Please complete your ${selected.name} before your appointment: ${waiverUrl} Reply STOP to opt out.`;
  try {
    const sent = await sendStudioSms({ organizationId: user.organization_id, artistId: row.artist.id, to: row.client.phone, body });
    const now = new Date();
    await db.update(externalWaiverAssignments).set({ status: "SENT", sentAt: now, updatedAt: now, providerMetadata: { messageSid: sent.sid } }).where(eq(externalWaiverAssignments.id, assignment.id));
    await db.insert(externalWaiverEvents).values({ organizationId: user.organization_id, assignmentId: assignment.id, userId: user.id, action: "SENT", details: { channel: "SMS", messageSid: sent.sid } });
    let [conversation] = await db.select().from(conversations).where(and(eq(conversations.organizationId, user.organization_id), eq(conversations.artistId, row.artist.id), eq(conversations.clientId, row.client.id), eq(conversations.channel, "SMS"), eq(conversations.status, "OPEN"))).limit(1);
    if (!conversation) conversation = (await db.insert(conversations).values({ organizationId: user.organization_id, artistId: row.artist.id, clientId: row.client.id, channel: "SMS", status: "OPEN", aiEnabled: true, lastMessageAt: now }).returning())[0];
    await db.insert(messages).values({ conversationId: conversation.id, senderType: "SYSTEM", role: "assistant", content: body, externalMessageId: sent.sid, metadata: { waiverAssignmentId: assignment.id, provider: "twilio", studioPhone: sent.studioPhone } });
    await db.update(conversations).set({ lastMessageAt: now, updatedAt: now }).where(eq(conversations.id, conversation.id));
    if (dueAt.getTime() > Date.now() + 60_000) await db.insert(automationJobs).values({ organizationId: user.organization_id, artistId: row.artist.id, clientId: row.client.id, appointmentId: row.appointment.id, type: "WAIVER_REMINDER", channel: "SMS", runAt: dueAt, payload: { body: `${row.organization.name}: Reminder to complete your ${selected.name} before your appointment: ${waiverUrl} Reply STOP to opt out.`, waiverAssignmentId: assignment.id } });
    return NextResponse.json({ assignment: { ...assignment, status: "SENT", sentAt: now }, form: selected, provider: { sid: sent.sid, status: sent.status } }, { status: 201 });
  } catch (error) {
    await db.update(externalWaiverAssignments).set({ status: "DELIVERY_FAILED", updatedAt: new Date(), providerMetadata: { error: error instanceof Error ? error.message : "SMS delivery failed" } }).where(eq(externalWaiverAssignments.id, assignment.id));
    await db.insert(externalWaiverEvents).values({ organizationId: user.organization_id, assignmentId: assignment.id, userId: user.id, action: "DELIVERY_FAILED" });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to send waiver" }, { status: 409 });
  }
}

export const GET = protectedRoute(handleGET, false);
export const POST = protectedRoute(handlePOST, false);
