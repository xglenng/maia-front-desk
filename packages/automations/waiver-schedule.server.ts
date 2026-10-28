import 'server-only';
import { and, eq, gt, inArray, or } from 'drizzle-orm';
import { db } from '@db/index';
import { appointments, automationJobs, clients } from '@db/schema';
import { appointmentLifecycleDedupeKey, appointmentReminderPlan } from './lifecycle-policy';

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function syncArtistWaiverJobs(tx: Transaction, input: {
  organizationId: string; artistId: string; enabled: boolean; leadMinutes: number;
}, now = new Date()) {
  if (!input.enabled) {
    await tx.update(automationJobs).set({
      status: 'CANCELLED', lastErrorCode: 'WAIVER_SEND_DISABLED', completedAt: now, updatedAt: now,
    }).where(and(
      eq(automationJobs.organizationId, input.organizationId), eq(automationJobs.artistId, input.artistId),
      eq(automationJobs.type, 'APPOINTMENT_WAIVER_SEND'), inArray(automationJobs.status, ['PENDING', 'RETRY']),
    ));
    return;
  }
  const upcoming = await tx.select({ appointment: appointments, phone: clients.phone, optedIn: clients.smsOptIn })
    .from(appointments).innerJoin(clients, and(eq(clients.id, appointments.clientId), eq(clients.organizationId, appointments.organizationId)))
    .where(and(eq(appointments.organizationId, input.organizationId), eq(appointments.artistId, input.artistId), eq(appointments.status, 'CONFIRMED'), gt(appointments.startsAt, now)));
  for (const { appointment, phone, optedIn } of upcoming) {
    if (!phone || !optedIn) continue;
    const plan = appointmentReminderPlan({ now, startsAt: appointment.startsAt, leadMinutes: input.leadMinutes, shortNoticeMode: 'SEND_AFTER_DELAY' });
    if (plan.kind === 'SKIP') continue;
    await tx.insert(automationJobs).values({
      organizationId: input.organizationId, artistId: input.artistId, clientId: appointment.clientId, appointmentId: appointment.id,
      type: 'APPOINTMENT_WAIVER_SEND', channel: 'SMS',
      dedupeKey: appointmentLifecycleDedupeKey('APPOINTMENT_WAIVER_SEND', appointment.id, appointment.scheduleRevision),
      runAt: plan.runAt, status: 'PENDING', payload: { scheduleRevision: appointment.scheduleRevision },
    }).onConflictDoUpdate({
      target: [automationJobs.organizationId, automationJobs.dedupeKey],
      set: { runAt: plan.runAt, status: 'PENDING', completedAt: null, lastErrorCode: null, updatedAt: now },
      // A timing edit must not replay completed or in-flight sends.
      setWhere: or(inArray(automationJobs.status, ['PENDING', 'RETRY']), and(eq(automationJobs.status, 'CANCELLED'), eq(automationJobs.lastErrorCode, 'WAIVER_SEND_DISABLED'))),
    });
  }
}
