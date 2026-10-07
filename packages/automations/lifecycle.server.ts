import 'server-only';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@db/index';
import { appointments, artists, automationJobs, clients, services } from '@db/schema';
import { appointmentCompletionDedupeKey, appointmentLifecycleDedupeKey, appointmentReminderPlan } from './lifecycle-policy';

const APPOINTMENT_JOB_TYPES = ['APPOINTMENT_REMINDER', 'APPOINTMENT_WAIVER_SEND', 'WAIVER_REMINDER', 'AFTERCARE_FOLLOWUP', 'REVIEW_FOLLOWUP'];

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
  await db.insert(automationJobs).values({
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
  }).onConflictDoNothing({ target: [automationJobs.organizationId, automationJobs.dedupeKey] });
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
