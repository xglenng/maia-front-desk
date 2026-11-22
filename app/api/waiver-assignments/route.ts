import crypto from "node:crypto";
import { protectedRoute, identity } from "@/packages/auth/server";
import { canAccessArtist } from "@/packages/inbox/state";
import { ageOn, assignedFormUrl, selectWaiverForm } from "@waivers/selection";
import { sendStudioSms } from "@integrations/studio-sms";
import { NextRequest, NextResponse } from "next/server";
import { and, asc, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@db/index";
import { appointments, artists, automationJobs, clients, conversations, externalWaiverAssignments, externalWaiverEvents, externalWaiverForms, messages, organizations, services, waiverIdentityDocuments } from "@db/schema";

const sendSchema = z.object({ action:z.enum(["SEND","CREATE_LINK"]).default("SEND"), appointmentId: z.string().uuid(), externalWaiverFormId: z.string().uuid().optional() });

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
    .leftJoin(clients, and(eq(appointments.clientId, clients.id), eq(appointments.organizationId, clients.organizationId)))
    .innerJoin(artists, and(eq(appointments.artistId, artists.id), eq(appointments.organizationId, artists.organizationId)))
    .leftJoin(services, and(eq(appointments.serviceId, services.id), eq(appointments.organizationId, services.organizationId)))
    .where(and(...conditions)).orderBy(asc(appointments.startsAt));
  const appointmentIds = rows.map(row => row.appointment.id);
  const assignmentRows = appointmentIds.length ? await db.select({ assignment: externalWaiverAssignments, formName: externalWaiverForms.name, provider: externalWaiverForms.provider, hasPhotoId:sql<boolean>`EXISTS (SELECT 1 FROM ${waiverIdentityDocuments} WHERE ${waiverIdentityDocuments.assignmentId} = ${externalWaiverAssignments.id} AND ${waiverIdentityDocuments.organizationId} = ${externalWaiverAssignments.organizationId})` }).from(externalWaiverAssignments).innerJoin(externalWaiverForms, and(eq(externalWaiverAssignments.waiverFormId, externalWaiverForms.id),eq(externalWaiverAssignments.organizationId,externalWaiverForms.organizationId))).where(and(eq(externalWaiverAssignments.organizationId,user.organization_id),inArray(externalWaiverAssignments.appointmentId, appointmentIds))).orderBy(desc(externalWaiverAssignments.createdAt)) : [];
  const byAppointment = new Map<string, typeof assignmentRows>();
  for (const assignment of assignmentRows) byAppointment.set(assignment.assignment.appointmentId, [...(byAppointment.get(assignment.assignment.appointmentId) ?? []), assignment]);
  return NextResponse.json({ appointments: rows.map(row => ({ ...row, clientName: row.clientName && row.clientLastName ? `${row.clientName} ${row.clientLastName}` : row.clientName || "", assignments: byAppointment.get(row.appointment.id) ?? [] })) });
}

async function handlePOST(request: NextRequest) {
  const user = await identity(request);
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const parsed = sendSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  
  const [appointment] = await db.select().from(appointments).where(and(eq(appointments.id, parsed.data.appointmentId), eq(appointments.organizationId, user.organization_id)));
  if (!appointment) return NextResponse.json({ error: "Appointment not found" }, { status: 404 });
  
  const [artist] = await db.select().from(artists).where(and(eq(artists.id, appointment.artistId), eq(artists.organizationId, user.organization_id)));
  if (!artist || !canAccessArtist(user.role, user.id, artist.userId)) return NextResponse.json({ error: "Appointment not found" }, { status: 404 });
  
  const [organization] = await db.select().from(organizations).where(eq(organizations.id, appointment.organizationId));
  
  let client = appointment.clientId ? (await db.select().from(clients).where(and(eq(clients.id, appointment.clientId), eq(clients.organizationId, user.organization_id))))[0] : null;
  
  if (parsed.data.action !== "CREATE_LINK" && client && (!client.phone || !client.smsOptIn)) {
    return NextResponse.json({ error: "Client is not opted in to SMS or has no phone number." }, { status: 409 });
  }
  
  const forms = await db.select().from(externalWaiverForms).where(and(eq(externalWaiverForms.organizationId, user.organization_id), eq(externalWaiverForms.active, true)));
  
  const age = client ? ageOn(client.dateOfBirth, appointment.startsAt) : null;
  const selected = parsed.data.externalWaiverFormId ? forms.find(form => form.id === parsed.data.externalWaiverFormId) : selectWaiverForm(forms, { artistId: appointment.artistId, serviceId: appointment.serviceId, isMinor: age == null ? null : age < 18 });
  if (selected && selected.artistId && selected.artistId !== appointment.artistId) return NextResponse.json({error:"This form belongs to another artist."},{status:403});
  if (selected?.serviceId && selected.serviceId !== appointment.serviceId) return NextResponse.json({error:"This form is assigned to a different service."},{status:409});
  if (!selected) return NextResponse.json({ error: age == null ? "No universal waiver matches this appointment. Add the client's birth date or choose a form manually." : "No active waiver form matches this appointment." }, { status: 409 });
  
  const rawToken = crypto.randomBytes(24).toString("hex");
  const trackingTokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
  const waiverUrl=assignedFormUrl(selected,rawToken,new URL(process.env.NEXT_PUBLIC_APP_URL||request.url).origin);
  const dueAt = new Date(Math.max(Date.now(), appointment.startsAt.getTime() - 24 * 60 * 60 * 1000));
  const [assignment] = await db.insert(externalWaiverAssignments).values({ organizationId: user.organization_id, waiverFormId: selected.id, appointmentId: appointment.id, clientId: client?.id || null, trackingTokenHash, dueAt, status: "PENDING" }).returning();
  if(parsed.data.action==='CREATE_LINK'){
    await db.insert(externalWaiverEvents).values({organizationId:user.organization_id,assignmentId:assignment.id,userId:user.id,action:'LINK_CREATED'});
    return NextResponse.json({assignment,url:waiverUrl},{status:201});
  }
  
  if (!client || !client.phone) return NextResponse.json({ error: "Cannot send SMS to a walk-in without contact details. Use CREATE_LINK to generate a shareable waiver link." }, { status: 409 });
  
  const body = `${organization?.name}: Please complete your ${selected.name} before your appointment: ${waiverUrl} Reply STOP to opt out.`;
  try {
    const sent = await sendStudioSms({ organizationId: user.organization_id, artistId: appointment.artistId, to: client.phone!, body });
    const now = new Date();
    await db.update(externalWaiverAssignments).set({ status: "SENT", sentAt: now, updatedAt: now, providerMetadata: { messageSid: sent.sid } }).where(eq(externalWaiverAssignments.id, assignment.id));
    await db.insert(externalWaiverEvents).values({ organizationId: user.organization_id, assignmentId: assignment.id, userId: user.id, action: "SENT", details: { channel: "SMS", messageSid: sent.sid } });
    let [conversation] = await db.select().from(conversations).where(and(eq(conversations.organizationId, user.organization_id), eq(conversations.artistId, appointment.artistId), eq(conversations.clientId, client.id), eq(conversations.channel, "SMS"), eq(conversations.status, "OPEN"))).limit(1);
    if (!conversation) conversation = (await db.insert(conversations).values({ organizationId: user.organization_id, artistId: appointment.artistId, clientId: client.id, channel: "SMS", status: "OPEN", aiEnabled: true, lastMessageAt: now }).returning())[0];
    await db.insert(messages).values({ conversationId: conversation.id, senderType: "SYSTEM", role: "assistant", content: body, externalMessageId: sent.sid, metadata: { waiverAssignmentId: assignment.id, provider: "twilio", studioPhone: sent.studioPhone } });
    await db.update(conversations).set({ lastMessageAt: now, updatedAt: now }).where(eq(conversations.id, conversation.id));
    if (dueAt.getTime() > Date.now() + 60_000) await db.insert(automationJobs).values({
      organizationId: user.organization_id,
      artistId: appointment.artistId,
      clientId: client.id,
      appointmentId: appointment.id,
      conversationId: conversation.id,
      dedupeKey: `WAIVER_REMINDER:${assignment.id}`,
      type: "WAIVER_REMINDER",
      channel: "SMS",
      runAt: dueAt,
      payload: { waiverAssignmentId: assignment.id },
    }).onConflictDoNothing({ target: [automationJobs.organizationId, automationJobs.dedupeKey] });
    return NextResponse.json({ assignment: { ...assignment, status: "SENT", sentAt: now }, form: selected, provider: { sid: sent.sid, status: sent.status } }, { status: 201 });
  } catch (error) {
    await db.update(externalWaiverAssignments).set({ status: "DELIVERY_FAILED", updatedAt: new Date(), providerMetadata: { error: error instanceof Error ? error.message : "SMS delivery failed" } }).where(eq(externalWaiverAssignments.id, assignment.id));
    await db.insert(externalWaiverEvents).values({ organizationId: user.organization_id, assignmentId: assignment.id, userId: user.id, action: "DELIVERY_FAILED" });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to send waiver" }, { status: 409 });
  }
}

export const GET = protectedRoute(handleGET, false);
export const POST = protectedRoute(handlePOST, false);
