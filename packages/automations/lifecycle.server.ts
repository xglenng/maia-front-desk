import 'server-only';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@db/index';
import { appointments, artists, automationJobs, clients, services } from '@db/schema';
import { appointmentCompletionDedupeKey, appointmentLifecycleDedupeKey, appointmentReminderPlan } from './lifecycle-policy';
import { assertStudioSmsReady, StudioSmsUnavailableError } from '@integrations/studio-sms';

const APPOINTMENT_JOB_TYPES = ['APPOINTMENT_CONFIRMATION', 'APPOINTMENT_REMINDER', 'APPOINTMENT_WAIVER_SEND', 'WAIVER_REMINDER', 'AFTERCARE_FOLLOWUP', 'REVIEW_FOLLOWUP'];

async function enqueue(input: {
  organizationId: string;
  artistId: string;
  clientId: string;
  appointmentId: string;
  dedupeKey: string;
  type: string;
  runAt: Date;
  payload: Record<string, unknown>;
}) {
  const inserted = await db.insert(automationJobs).values({
    organizationId: input.organizationId,
    artistId: input.artistId,
    clientId: input.clientId,
    appointmentId: input.appointmentId,
    dedupeKey: input.dedupeKey,
    type: input.type,
    channel: 'SMS',
    runAt: input.runAt,
    status: 'PENDING',
    attemptCount: 0,
    maxAttempts: 5,
    payload: input.payload,
  }).onConflictDoNothing({ target: [automationJobs.organizationId, automationJobs.dedupeKey] }).returning({ id: automationJobs.id });
  return inserted.length > 0;
}

export async function scheduleConfirmedAppointmentAutomations(appointmentId: string, now = new Date()) {
  const [row] = await db.select({
    appointment: appointments,
    artist: artists,
    client: clients,
    service: services,
  }).from(appointments)
    .innerJoin(artists, and(eq(appointments.artistId, artists.id), eq(artists.organizationId, appointments.organizationId)))
    .innerJoin(clients, and(eq(appointments.clientId, clients.id), eq(clients.organizationId, appointments.organizationId)))
    .leftJoin(services, and(eq(appointments.serviceId, services.id), eq(services.organizationId, appointments.organizationId)))
    .where(eq(appointments.id, appointmentId)).limit(1);
  if (!row || row.appointment.status !== 'CONFIRMED' || !row.client.phone || !row.client.smsOptIn) return { scheduled: [] as string[] };
  const scheduled: string[] = [];
  const revision = row.appointment.scheduleRevision;

  if (row.artist.appointmentReminderEnabled) {
    const plan = appointmentReminderPlan({
      now,
      startsAt: row.appointment.startsAt,
      leadMinutes: row.artist.appointmentReminderMinutes,
      shortNoticeMode: row.artist.appointmentReminderShortNoticeMode as 'SKIP' | 'SEND_AFTER_DELAY',
    });
    if (plan.kind !== 'SKIP') {
      await enqueue({
        organizationId: row.appointment.organizationId, artistId: row.appointment.artistId, clientId: row.appointment.clientId,
        appointmentId, dedupeKey: appointmentLifecycleDedupeKey('APPOINTMENT_REMINDER', appointmentId, revision),
        type: 'APPOINTMENT_REMINDER', runAt: plan.runAt,
        payload: { scheduleRevision: revision, reminderKind: plan.kind },
      });
      scheduled.push('APPOINTMENT_REMINDER');
    }
  }

  if (row.artist.appointmentWaiverSendEnabled) {
    const plan = appointmentReminderPlan({
      now,
      startsAt: row.appointment.startsAt,
      leadMinutes: row.artist.appointmentWaiverSendMinutes,
      shortNoticeMode: 'SEND_AFTER_DELAY',
    });
    if (plan.kind !== 'SKIP') {
      await enqueue({
        organizationId: row.appointment.organizationId, artistId: row.appointment.artistId, clientId: row.appointment.clientId,
        appointmentId, dedupeKey: appointmentLifecycleDedupeKey('APPOINTMENT_WAIVER_SEND', appointmentId, revision),
        type: 'APPOINTMENT_WAIVER_SEND', runAt: plan.runAt,
        payload: { scheduleRevision: revision },
      });
      scheduled.push('APPOINTMENT_WAIVER_SEND');
    }
  }
  return { scheduled };
}

export async function scheduleAppointmentCompletionFollowups(appointmentId: string, completedAt: Date) {
  const [row] = await db.select({ appointment: appointments, artist: artists, client: clients })
    .from(appointments)
    .innerJoin(artists, and(eq(appointments.artistId, artists.id), eq(artists.organizationId, appointments.organizationId)))
    .innerJoin(clients, and(eq(appointments.clientId, clients.id), eq(clients.organizationId, appointments.organizationId)))
    .where(eq(appointments.id, appointmentId)).limit(1);
  if (!row || row.appointment.status !== 'COMPLETED' || !row.client.phone || !row.client.smsOptIn || !row.appointment.completedAt) return { scheduled: [] as string[] };
  const scheduled: string[] = [];
  if (row.artist.aftercareFollowupEnabled) {
    await enqueue({
      organizationId: row.appointment.organizationId, artistId: row.appointment.artistId, clientId: row.appointment.clientId,
      appointmentId, dedupeKey: appointmentCompletionDedupeKey('AFTERCARE_FOLLOWUP', appointmentId, row.appointment.completedAt),
      type: 'AFTERCARE_FOLLOWUP', runAt: new Date(completedAt.getTime() + row.artist.aftercareFollowupHours * 3_600_000),
      payload: { completedAt: row.appointment.completedAt.toISOString(), scheduleRevision: row.appointment.scheduleRevision },
    });
    scheduled.push('AFTERCARE_FOLLOWUP');
  }
  if (row.artist.reviewFollowupEnabled) {
    await enqueue({
      organizationId: row.appointment.organizationId, artistId: row.appointment.artistId, clientId: row.appointment.clientId,
      appointmentId, dedupeKey: appointmentCompletionDedupeKey('REVIEW_FOLLOWUP', appointmentId, row.appointment.completedAt),
      type: 'REVIEW_FOLLOWUP', runAt: new Date(completedAt.getTime() + row.artist.reviewFollowupHours * 3_600_000),
      payload: { completedAt: row.appointment.completedAt.toISOString(), scheduleRevision: row.appointment.scheduleRevision },
    });
    scheduled.push('REVIEW_FOLLOWUP');
  }
  return { scheduled };
}

export async function cancelAppointmentLifecycleJobs(appointmentId: string, reason = 'APPOINTMENT_CANCELLED') {
  const now = new Date();
  return db.update(automationJobs).set({ status: 'CANCELLED', completedAt: now, lastErrorCode: reason, lockedAt: null, lockExpiresAt: null, lockToken: null, updatedAt: now })
    .where(and(eq(automationJobs.appointmentId, appointmentId), inArray(automationJobs.type, APPOINTMENT_JOB_TYPES), inArray(automationJobs.status, ['PENDING', 'RETRY', 'PROCESSING'])))
    .returning({ id: automationJobs.id });
}

export async function cancelAppointmentPreCompletionJobs(appointmentId: string, reason = 'APPOINTMENT_COMPLETED') {
  const now = new Date();
  return db.update(automationJobs).set({ status: 'CANCELLED', completedAt: now, lastErrorCode: reason, lockedAt: null, lockExpiresAt: null, lockToken: null, updatedAt: now })
    .where(and(eq(automationJobs.appointmentId, appointmentId), inArray(automationJobs.type, ['APPOINTMENT_REMINDER', 'APPOINTMENT_WAIVER_SEND', 'WAIVER_REMINDER']), inArray(automationJobs.status, ['PENDING', 'RETRY', 'PROCESSING'])))
    .returning({ id: automationJobs.id });
}

export async function schedulePaymentConfirmation(appointmentId:string){
 const [row]=await db.select().from(appointments).where(and(eq(appointments.id,appointmentId),eq(appointments.status,'CONFIRMED'),eq(appointments.depositStatus,'PAID')));
 if(!row)return;
 await enqueue({organizationId:row.organizationId,artistId:row.artistId,clientId:row.clientId,appointmentId:row.id,type:'APPOINTMENT_CONFIRMATION',dedupeKey:`payment-confirmation:${row.id}`,runAt:new Date(),payload:{scheduleRevision:row.scheduleRevision}});
}

export async function scheduleManualAppointmentConfirmation(appointmentId: string): Promise<{ status: 'QUEUED' | 'SENDING' | 'SUBMITTED' } | { status: 'UNAVAILABLE'; reason: string }> {
  const [row] = await db.select({ appointment: appointments, client: clients }).from(appointments)
    .innerJoin(clients, and(eq(clients.id, appointments.clientId), eq(clients.organizationId, appointments.organizationId)))
    .where(eq(appointments.id, appointmentId)).limit(1);
  if (!row || row.appointment.status !== 'CONFIRMED') return { status: 'UNAVAILABLE' as const, reason: 'The appointment is not confirmed.' };
  const { appointment, client } = row;
  const dedupeKey = `payment-confirmation:${appointment.id}`;
  const [existing] = await db.select({ status: automationJobs.status, payload: automationJobs.payload }).from(automationJobs)
    .where(and(eq(automationJobs.organizationId, appointment.organizationId), eq(automationJobs.dedupeKey, dedupeKey))).limit(1);
  if (existing) {
    if (['PENDING', 'RETRY', 'PROCESSING'].includes(existing.status)) {
      const payload = existing.payload && typeof existing.payload === 'object' && !Array.isArray(existing.payload) ? existing.payload as Record<string, unknown> : {};
      if (payload.scheduleRevision !== appointment.scheduleRevision) return { status: 'UNAVAILABLE' as const, reason: 'The appointment changed before the confirmation was sent.' };
      return { status: 'QUEUED' as const };
    }
    if (existing.status === 'SENDING') return { status: 'SENDING' as const };
    if (existing.status === 'COMPLETED') return { status: 'SUBMITTED' as const };
    return { status: 'UNAVAILABLE' as const, reason: 'A previous confirmation could not be sent. Check the appointment messages for its status.' };
  }
  if (!client.phone) return { status: 'UNAVAILABLE' as const, reason: 'The client has no phone number.' };
  if (client.smsConsentStatus === 'OPTED_OUT') return { status: 'UNAVAILABLE' as const, reason: 'The client has opted out of SMS.' };
  if (appointment.startsAt <= new Date()) return { status: 'UNAVAILABLE' as const, reason: 'The appointment has already started.' };
  try {
    await assertStudioSmsReady({ organizationId: appointment.organizationId, artistId: appointment.artistId, clientId: appointment.clientId, phone: client.phone });
  } catch (error) {
    if (error instanceof StudioSmsUnavailableError) return { status: 'UNAVAILABLE' as const, reason: error.message };
    throw error;
  }
  const inserted = await enqueue({ organizationId: appointment.organizationId, artistId: appointment.artistId, clientId: appointment.clientId, appointmentId: appointment.id, type: 'APPOINTMENT_CONFIRMATION', dedupeKey, runAt: new Date(), payload: { scheduleRevision: appointment.scheduleRevision } });
  if (!inserted) return scheduleManualAppointmentConfirmation(appointmentId);
  return { status: 'QUEUED' as const };
}

export async function scheduleManualConfirmationSafely(appointmentId: string) {
  try {
    return await scheduleManualAppointmentConfirmation(appointmentId);
  } catch {
    console.error('Unable to queue appointment confirmation.');
    return { status: 'UNAVAILABLE' as const, reason: 'Maia could not queue the confirmation. Check SMS setup and try again.' };
  }
}
