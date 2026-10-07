import 'server-only';
import crypto from 'node:crypto';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@db/index';
import { appointments, artists, automationJobs, clients, conversations, externalWaiverAssignments, externalWaiverEvents, externalWaiverForms, messages, organizations, services, studioAftercare, studioLocations, waiverSubmissions, waiverTemplates } from '@db/schema';
import { sendStudioSms } from '@integrations/studio-sms';
import { ageOn, appendTrackingToken, selectWaiverForm } from '@waivers/selection';
import { signWaiver } from '@/packages/auth/waiver-token';
import { classifyAutomationFailure, retryDelaySeconds, retryState } from './policy';
import { isGoogleReviewUrl, selectAppointmentAftercare } from './lifecycle-policy';
import { findGeneratedMessage, updateClaimedJob, type ClaimedAutomationJob } from './queue.server';

function objectPayload(job: ClaimedAutomationJob) {
  return job.payload && typeof job.payload === 'object' && !Array.isArray(job.payload) ? job.payload as Record<string, unknown> : {};
}

async function cancel(job: ClaimedAutomationJob, code: string) {
  await updateClaimedJob(job, { status: 'CANCELLED', completedAt: new Date(), lastErrorCode: code, lockedAt: null, lockExpiresAt: null, lockToken: null });
  return { id: job.id, status: 'CANCELLED', code };
}

async function fail(job: ClaimedAutomationJob, error: unknown) {
  const failure = classifyAutomationFailure(error, job.status === 'SENDING');
  const status = failure.status === 'RETRY' ? retryState(job.attemptCount, job.maxAttempts) : failure.status;
  await updateClaimedJob(job, {
    status,
    runAt: status === 'RETRY' ? new Date(Date.now() + retryDelaySeconds(job.attemptCount) * 1000) : job.runAt,
    lastErrorCode: failure.code,
    completedAt: status === 'RETRY' ? null : new Date(),
    lockedAt: null,
    lockExpiresAt: null,
    lockToken: null,
  });
  if (job.resultMessageId) {
    await db.update(messages).set({ metadata: sql`COALESCE(${messages.metadata}, '{}'::jsonb) || jsonb_build_object('automationStatus'::text, ${status}::text, 'automationErrorCode'::text, ${failure.code}::text)` }).where(eq(messages.id, job.resultMessageId));
    if (job.type === 'APPOINTMENT_WAIVER_SEND') {
      const [resultMessage] = await db.select({ metadata: messages.metadata }).from(messages).where(eq(messages.id, job.resultMessageId)).limit(1);
      const metadata = resultMessage?.metadata && typeof resultMessage.metadata === 'object' ? resultMessage.metadata as Record<string, unknown> : {};
      const assignmentId = typeof metadata.waiverAssignmentId === 'string' ? metadata.waiverAssignmentId : null;
      if (assignmentId) {
        const assignmentStatus = status === 'DELIVERY_UNKNOWN' ? 'DELIVERY_UNKNOWN' : status === 'RETRY' ? 'PENDING' : 'DELIVERY_FAILED';
        await db.update(externalWaiverAssignments).set({ status: assignmentStatus, providerMetadata: { automationJobId: job.id, lastErrorCode: failure.code }, updatedAt: new Date() }).where(and(eq(externalWaiverAssignments.id, assignmentId), eq(externalWaiverAssignments.organizationId, job.organizationId)));
        if (assignmentStatus !== 'PENDING') await db.insert(externalWaiverEvents).values({ organizationId: job.organizationId, assignmentId, action: assignmentStatus, details: { automationJobId: job.id, errorCode: failure.code } });
      }
    }
  }
  return { id: job.id, status, code: failure.code };
}

async function smsConversation(appointment: typeof appointments.$inferSelect) {
  if (appointment.conversationId) {
    const [existing] = await db.select().from(conversations).where(and(
      eq(conversations.id, appointment.conversationId), eq(conversations.organizationId, appointment.organizationId),
      eq(conversations.artistId, appointment.artistId), eq(conversations.clientId, appointment.clientId), eq(conversations.channel, 'SMS'),
    )).limit(1);
    if (existing) return existing;
  }
  const [existing] = await db.select().from(conversations).where(and(
    eq(conversations.organizationId, appointment.organizationId), eq(conversations.artistId, appointment.artistId),
    eq(conversations.clientId, appointment.clientId), eq(conversations.channel, 'SMS'), eq(conversations.status, 'OPEN'),
  )).orderBy(asc(conversations.createdAt)).limit(1);
  if (existing) return existing;
  const [created] = await db.insert(conversations).values({ organizationId: appointment.organizationId, artistId: appointment.artistId, clientId: appointment.clientId, channel: 'SMS', status: 'OPEN', aiEnabled: true }).returning();
  return created;
}

async function sendAppointmentMessage(job: ClaimedAutomationJob, appointment: typeof appointments.$inferSelect, client: typeof clients.$inferSelect, body: string, metadata: Record<string, unknown>, guard: () => Promise<boolean>) {
  if (!await guard()) return cancel(job, 'APPOINTMENT_NO_LONGER_ELIGIBLE');
  let resultMessage = await findGeneratedMessage(job);
  const conversation = await smsConversation(appointment);
  if (resultMessage) {
    const status = resultMessage.metadata && typeof resultMessage.metadata === 'object' ? (resultMessage.metadata as Record<string, unknown>).status : null;
    if (status === 'sent') return { id: job.id, status: 'COMPLETED' };
    [resultMessage] = await db.update(messages).set({ content: body, metadata: { automationJobId: job.id, ...metadata, status: 'generated' } }).where(eq(messages.id, resultMessage.id)).returning();
  } else {
    [resultMessage] = await db.insert(messages).values({ conversationId: conversation.id, senderType: 'SYSTEM', role: 'assistant', content: body, metadata: { automationJobId: job.id, ...metadata, status: 'generated' } }).returning();
  }
  if (!resultMessage || !await updateClaimedJob(job, { conversationId: conversation.id, resultMessageId: resultMessage.id, status: 'SENDING', lockedAt: new Date(), lockExpiresAt: new Date(Date.now() + 300_000) })) return cancel(job, 'AUTOMATION_LEASE_LOST');
  job.status = 'SENDING';
  await db.update(messages).set({ metadata: { automationJobId: job.id, ...metadata, status: 'provider_send_started' } }).where(eq(messages.id, resultMessage.id));
  if (!await guard()) {
    await db.delete(messages).where(eq(messages.id, resultMessage.id));
    return cancel(job, 'APPOINTMENT_NO_LONGER_ELIGIBLE');
  }
  if (!client.phone) return cancel(job, 'CLIENT_PHONE_MISSING');
  const sent = await sendStudioSms({ organizationId: job.organizationId, artistId: job.artistId, to: client.phone, body });
  const now = new Date();
  await db.update(messages).set({ externalMessageId: sent.sid, metadata: { automationJobId: job.id, ...metadata, provider: 'twilio', studioPhone: sent.studioPhone, status: sent.status } }).where(eq(messages.id, resultMessage.id));
  await updateClaimedJob(job, { status: 'COMPLETED', sentAt: now, completedAt: now, lastErrorCode: null, lockedAt: null, lockExpiresAt: null, lockToken: null });
  return { id: job.id, status: 'COMPLETED' };
}

async function loadAppointment(job: ClaimedAutomationJob) {
  if (!job.appointmentId) return undefined;
  const [row] = await db.select({ appointment: appointments, artist: artists, client: clients, service: services, organization: organizations })
    .from(appointments)
    .innerJoin(artists, and(eq(appointments.artistId, artists.id), eq(artists.organizationId, appointments.organizationId)))
    .innerJoin(clients, and(eq(appointments.clientId, clients.id), eq(clients.organizationId, appointments.organizationId)))
    .innerJoin(organizations, eq(appointments.organizationId, organizations.id))
    .leftJoin(services, and(eq(appointments.serviceId, services.id), eq(services.organizationId, appointments.organizationId)))
    .where(and(eq(appointments.id, job.appointmentId), eq(appointments.organizationId, job.organizationId), eq(appointments.artistId, job.artistId), eq(appointments.clientId, job.clientId))).limit(1);
  if (!row) return undefined;
  const [location] = await db.select({ timezone: studioLocations.timezone }).from(studioLocations).where(and(eq(studioLocations.organizationId, job.organizationId), eq(studioLocations.isPrimary, true), eq(studioLocations.active, true))).limit(1);
  return { ...row, timezone: location?.timezone || row.organization.timezone };
}

function formatAppointmentTime(value: Date, timeZone: string) {
  return new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(value);
}

async function processAppointmentReminder(job: ClaimedAutomationJob, payload: Record<string, unknown>) {
  const row = await loadAppointment(job);
  if (!row || row.appointment.status !== 'CONFIRMED' || row.appointment.scheduleRevision !== payload.scheduleRevision) return cancel(job, 'APPOINTMENT_NOT_ELIGIBLE');
  if (row.appointment.startsAt.getTime() <= Date.now()) return cancel(job, 'APPOINTMENT_ALREADY_STARTED');
  if (row.appointment.depositCents && row.appointment.depositStatus !== 'PAID') return cancel(job, 'DEPOSIT_NOT_PAID');
  if (!row.artist.appointmentReminderEnabled) return cancel(job, 'REMINDER_DISABLED');
  if (!row.client.phone || !row.client.smsOptIn || row.client.smsConsentStatus === 'OPTED_OUT') return cancel(job, 'SMS_NOT_ELIGIBLE');
  const time = formatAppointmentTime(row.appointment.startsAt, row.timezone);
  const title = row.service?.name || 'appointment';
  const body = payload.reminderKind === 'UPCOMING'
    ? `${row.organization.name}: Your ${title} appointment is coming up on ${time}. Reply if you need help.`
    : `${row.organization.name}: Reminder: your ${title} appointment is on ${time}. Reply if you need help.`;
  const guard = async () => {
    const current = await loadAppointment(job);
    return Boolean(current && current.appointment.status === 'CONFIRMED' && current.appointment.startsAt.getTime() > Date.now() && current.appointment.scheduleRevision === payload.scheduleRevision && current.artist.appointmentReminderEnabled && (!current.appointment.depositCents || current.appointment.depositStatus === 'PAID') && current.client.phone && current.client.smsOptIn && current.client.smsConsentStatus !== 'OPTED_OUT');
  };
  return sendAppointmentMessage(job, row.appointment, row.client, body, { automationType: job.type, appointmentId: row.appointment.id, scheduleRevision: row.appointment.scheduleRevision }, guard);
}

async function processAppointmentWaiver(job: ClaimedAutomationJob, payload: Record<string, unknown>) {
  const row = await loadAppointment(job);
  if (!row || row.appointment.status !== 'CONFIRMED' || row.appointment.scheduleRevision !== payload.scheduleRevision) return cancel(job, 'APPOINTMENT_NOT_ELIGIBLE');
  if (row.appointment.startsAt.getTime() <= Date.now()) return cancel(job, 'APPOINTMENT_ALREADY_STARTED');
  if (row.appointment.depositCents && row.appointment.depositStatus !== 'PAID') return cancel(job, 'DEPOSIT_NOT_PAID');
  if (!row.artist.appointmentWaiverSendEnabled) return cancel(job, 'WAIVER_SEND_DISABLED');
  if (!row.client.phone || !row.client.smsOptIn || row.client.smsConsentStatus === 'OPTED_OUT') return cancel(job, 'SMS_NOT_ELIGIBLE');
  const completed = await db.select({ id: waiverSubmissions.id }).from(waiverSubmissions).where(and(eq(waiverSubmissions.organizationId, job.organizationId), eq(waiverSubmissions.appointmentId, row.appointment.id))).limit(1);
  if (completed.length) return cancel(job, 'WAIVER_ALREADY_COMPLETED');

  let resultMessage = await findGeneratedMessage(job);
  let assignmentId: string | null = resultMessage?.metadata && typeof resultMessage.metadata === 'object' ? String((resultMessage.metadata as Record<string, unknown>).waiverAssignmentId || '') || null : null;
  if (!resultMessage) {
    const existingAssignments = await db.select().from(externalWaiverAssignments).where(and(eq(externalWaiverAssignments.organizationId, job.organizationId), eq(externalWaiverAssignments.appointmentId, row.appointment.id))).orderBy(asc(externalWaiverAssignments.createdAt));
    if (existingAssignments.length) return cancel(job, existingAssignments.some(item => item.status === 'COMPLETED' || item.status === 'REVIEWED') ? 'WAIVER_ALREADY_COMPLETED' : 'WAIVER_ALREADY_ISSUED');
    const forms = await db.select().from(externalWaiverForms).where(and(eq(externalWaiverForms.organizationId, job.organizationId), eq(externalWaiverForms.active, true)));
    const age = ageOn(row.client.dateOfBirth, row.appointment.startsAt);
    const externalForm = selectWaiverForm(forms, { artistId: job.artistId, serviceId: row.appointment.serviceId, isMinor: age == null ? null : age < 18 });
    const [template] = externalForm ? [] : await db.select().from(waiverTemplates).where(and(eq(waiverTemplates.organizationId, job.organizationId), eq(waiverTemplates.active, true))).orderBy(sql`${waiverTemplates.version} DESC`).limit(1);
    if (!externalForm && !template) return cancel(job, 'WAIVER_NOT_CONFIGURED');
    const now = new Date();
    const externalToken = externalForm ? crypto.randomBytes(24).toString('hex') : null;
    const link = externalForm
      ? appendTrackingToken(externalForm.formUrl, externalToken!)
      : process.env.NEXT_PUBLIC_APP_URL
        ? `${process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, '')}/waiver?organizationId=${encodeURIComponent(job.organizationId)}&appointmentId=${encodeURIComponent(row.appointment.id)}&clientId=${encodeURIComponent(job.clientId)}&waiverTemplateId=${encodeURIComponent(template!.id)}&access=${encodeURIComponent(signWaiver({ organizationId: job.organizationId, appointmentId: row.appointment.id, clientId: job.clientId, waiverTemplateId: template!.id, expires: now.getTime() + 7 * 86_400_000 }))}`
        : '';
    if (!link) return cancel(job, 'WAIVER_PUBLIC_URL_MISSING');
    const formName = externalForm?.name || template!.name;
    const body = `${row.organization.name}: Please complete your ${formName} before your appointment: ${link} Reply STOP to opt out.`;
    const smsConv = await smsConversation(row.appointment);
    const created = await db.transaction(async tx => {
      await tx.execute(sql`SELECT id FROM appointments WHERE id = ${row.appointment.id} AND organization_id = ${job.organizationId} FOR UPDATE`);
      const [existing] = await tx.select({ id: externalWaiverAssignments.id }).from(externalWaiverAssignments).where(and(eq(externalWaiverAssignments.organizationId, job.organizationId), eq(externalWaiverAssignments.appointmentId, row.appointment.id))).limit(1);
      if (existing) return { duplicate: true as const };
      let createdAssignmentId: string | null = null;
      if (externalForm && externalToken) {
        const [assignment] = await tx.insert(externalWaiverAssignments).values({
          organizationId: job.organizationId, waiverFormId: externalForm.id, appointmentId: row.appointment.id, clientId: job.clientId,
          trackingTokenHash: crypto.createHash('sha256').update(externalToken).digest('hex'), status: 'PENDING', deliveryChannel: 'SMS', dueAt: row.appointment.startsAt,
        }).returning({ id: externalWaiverAssignments.id });
        createdAssignmentId = assignment.id;
      }
      const [message] = await tx.insert(messages).values({
        conversationId: smsConv.id,
        senderType: 'SYSTEM', role: 'assistant', content: body,
        metadata: { automationJobId: job.id, appointmentWaiverSend: true, waiverAssignmentId: createdAssignmentId, waiverTemplateId: template?.id ?? null, status: 'generated' },
      }).returning();
      if (createdAssignmentId) await tx.insert(externalWaiverEvents).values({ organizationId: job.organizationId, assignmentId: createdAssignmentId, action: 'SCHEDULED_SEND', details: { appointmentId: row.appointment.id, automationJobId: job.id } });
      return { duplicate: false as const, message, assignmentId: createdAssignmentId };
    });
    if (created.duplicate) return cancel(job, 'WAIVER_ALREADY_ISSUED');
    resultMessage = created.message;
    assignmentId = created.assignmentId;
  }
  if (!resultMessage) return cancel(job, 'WAIVER_MESSAGE_MISSING');
  const [sent] = await db.select().from(conversations).where(eq(conversations.id, resultMessage.conversationId)).limit(1);
  if (!sent) return cancel(job, 'SMS_CONVERSATION_MISSING');
  if (!await updateClaimedJob(job, { conversationId: sent.id, resultMessageId: resultMessage.id, status: 'SENDING', lockedAt: new Date(), lockExpiresAt: new Date(Date.now() + 300_000) })) return cancel(job, 'AUTOMATION_LEASE_LOST');
  job.status = 'SENDING';
  await db.update(messages).set({ metadata: { automationJobId: job.id, appointmentWaiverSend: true, waiverAssignmentId: assignmentId, status: 'provider_send_started' } }).where(eq(messages.id, resultMessage.id));
  const stillEligible = async () => {
    const current = await loadAppointment(job);
    if (!current || current.appointment.status !== 'CONFIRMED' || current.appointment.startsAt.getTime() <= Date.now() || current.appointment.scheduleRevision !== payload.scheduleRevision || !current.artist.appointmentWaiverSendEnabled || (current.appointment.depositCents && current.appointment.depositStatus !== 'PAID') || !current.client.phone || !current.client.smsOptIn || current.client.smsConsentStatus === 'OPTED_OUT') return false;
    if (assignmentId) {
      const [assignment] = await db.select({ status: externalWaiverAssignments.status, completedAt: externalWaiverAssignments.completedAt }).from(externalWaiverAssignments).where(and(eq(externalWaiverAssignments.id, assignmentId), eq(externalWaiverAssignments.organizationId, job.organizationId), eq(externalWaiverAssignments.appointmentId, current.appointment.id))).limit(1);
      return Boolean(assignment && assignment.status === 'PENDING' && !assignment.completedAt);
    }
    const [existingSubmission] = await db.select({ id: waiverSubmissions.id }).from(waiverSubmissions).where(and(eq(waiverSubmissions.organizationId, job.organizationId), eq(waiverSubmissions.appointmentId, current.appointment.id))).limit(1);
    return !existingSubmission;
  };
  if (!await stillEligible()) {
    await db.delete(messages).where(eq(messages.id, resultMessage.id));
    return cancel(job, 'WAIVER_NO_LONGER_ELIGIBLE');
  }
  const sentSms = await sendStudioSms({ organizationId: job.organizationId, artistId: job.artistId, to: row.client.phone, body: resultMessage.content });
  const now = new Date();
  await db.update(messages).set({ externalMessageId: sentSms.sid, metadata: { automationJobId: job.id, appointmentWaiverSend: true, waiverAssignmentId: assignmentId, provider: 'twilio', studioPhone: sentSms.studioPhone, status: sentSms.status } }).where(eq(messages.id, resultMessage.id));
  if (assignmentId) {
    await db.update(externalWaiverAssignments).set({ status: 'SENT', sentAt: now, updatedAt: now, providerMetadata: { messageSid: sentSms.sid, automationJobId: job.id } }).where(and(eq(externalWaiverAssignments.id, assignmentId), eq(externalWaiverAssignments.organizationId, job.organizationId)));
    await db.insert(externalWaiverEvents).values({ organizationId: job.organizationId, assignmentId, action: 'SENT', details: { channel: 'SMS', messageSid: sentSms.sid, automationJobId: job.id } });
  }
  await updateClaimedJob(job, { status: 'COMPLETED', sentAt: now, completedAt: now, lastErrorCode: null, lockedAt: null, lockExpiresAt: null, lockToken: null });
  return { id: job.id, status: 'COMPLETED' };
}

async function processCompletionFollowup(job: ClaimedAutomationJob, payload: Record<string, unknown>, type: 'AFTERCARE_FOLLOWUP' | 'REVIEW_FOLLOWUP') {
  const row = await loadAppointment(job);
  if (!row || row.appointment.status !== 'COMPLETED' || !row.appointment.completedAt || row.appointment.completedAt.toISOString() !== payload.completedAt) return cancel(job, 'APPOINTMENT_COMPLETION_STALE');
  if (!row.client.phone || !row.client.smsOptIn || row.client.smsConsentStatus === 'OPTED_OUT') return cancel(job, 'SMS_NOT_ELIGIBLE');
  let body: string;
  if (type === 'AFTERCARE_FOLLOWUP') {
    if (!row.artist.aftercareFollowupEnabled) return cancel(job, 'AFTERCARE_DISABLED');
    const [location] = await db.select({ id: studioLocations.id }).from(studioLocations).where(and(eq(studioLocations.organizationId, job.organizationId), eq(studioLocations.isPrimary, true), eq(studioLocations.active, true))).limit(1);
    const candidates = await db.select().from(studioAftercare).where(and(eq(studioAftercare.organizationId, job.organizationId), eq(studioAftercare.active, true)));
    const aftercare = selectAppointmentAftercare(candidates, { organizationId: job.organizationId, locationId: location?.id ?? null, serviceType: row.service?.serviceType ?? null, category: row.service?.category ?? null });
    if (!aftercare) return cancel(job, 'AFTERCARE_NOT_CONFIGURED');
    body = `${row.organization.name}: Aftercare for your ${row.service?.name || 'appointment'}\n\n${aftercare.instructions}`;
  } else {
    if (!row.artist.reviewFollowupEnabled || !isGoogleReviewUrl(row.artist.googleReviewUrl)) return cancel(job, 'REVIEW_CONFIGURATION_MISSING');
    const message = row.artist.reviewFollowupMessage?.trim();
    if (!message) return cancel(job, 'REVIEW_CONFIGURATION_MISSING');
    body = `${row.organization.name}: ${message}\n${row.artist.googleReviewUrl}`;
  }
  const expectedCompletedAt = row.appointment.completedAt.toISOString();
  const expectedReviewUrl = row.artist.googleReviewUrl;
  const expectedReviewMessage = row.artist.reviewFollowupMessage;
  const guard = async () => {
    const current = await loadAppointment(job);
    if (!current || current.appointment.status !== 'COMPLETED' || current.appointment.completedAt?.toISOString() !== expectedCompletedAt || !current.client.phone || !current.client.smsOptIn || current.client.smsConsentStatus === 'OPTED_OUT') return false;
    if (type === 'AFTERCARE_FOLLOWUP') return current.artist.aftercareFollowupEnabled;
    return current.artist.reviewFollowupEnabled && current.artist.googleReviewUrl === expectedReviewUrl && current.artist.reviewFollowupMessage === expectedReviewMessage && isGoogleReviewUrl(current.artist.googleReviewUrl);
  };
  return sendAppointmentMessage(job, row.appointment, row.client, body, { automationType: type, appointmentId: row.appointment.id, completedAt: expectedCompletedAt }, guard);
}

export async function processAppointmentAutomationJob(job: ClaimedAutomationJob) {
  const payload = objectPayload(job);
  try {
    if (job.type === 'APPOINTMENT_REMINDER') return await processAppointmentReminder(job, payload);
    if (job.type === 'APPOINTMENT_WAIVER_SEND') return await processAppointmentWaiver(job, payload);
    if (job.type === 'AFTERCARE_FOLLOWUP' || job.type === 'REVIEW_FOLLOWUP') return await processCompletionFollowup(job, payload, job.type);
    return cancel(job, 'UNSUPPORTED_APPOINTMENT_AUTOMATION');
  } catch (error) {
    return fail(job, error);
  }
}
