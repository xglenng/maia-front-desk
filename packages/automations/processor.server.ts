import 'server-only';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '@db/index';
import { appointments, artists, channelConnections, clients, conversations, externalWaiverAssignments, messages } from '@db/schema';
import { resolveVerifiedChannelMaiaAgentContext } from '@ai/context.server';
import { runMaiaAgent } from '@ai/agent.server';
import { decryptComplianceSecret } from '@/packages/compliance/secrets';
import { isMetaAuthError, sendMetaMessage, withinSocialReplyWindow } from '@channels/meta';
import { sendStudioSms } from '@integrations/studio-sms';
import { shouldRunAi } from '@/packages/inbox/state';
import { classifyAutomationFailure, retryDelaySeconds, retryState } from './policy';
import { findGeneratedMessage, finishAiResponse, renewAutomationJobLease, updateClaimedJob, type ClaimedAutomationJob } from './queue.server';

function payloadRecord(job: ClaimedAutomationJob) {
  return job.payload && typeof job.payload === 'object' && !Array.isArray(job.payload) ? job.payload as Record<string, unknown> : {};
}

async function completeJob(job: ClaimedAutomationJob, status: 'COMPLETED' | 'CANCELLED', errorCode?: string) {
  await updateClaimedJob(job, { status, completedAt: new Date(), lastErrorCode: errorCode ?? null, lockedAt: null, lockExpiresAt: null, lockToken: null, ...(status === 'COMPLETED' ? { sentAt: new Date() } : {}) });
}

async function failJob(job: ClaimedAutomationJob, error: unknown, providerSendStarted: boolean) {
  const failure = classifyAutomationFailure(error, providerSendStarted);
  const status = failure.status === 'RETRY' ? retryState(job.attemptCount, job.maxAttempts) : failure.status;
  const runAt = status === 'RETRY' ? new Date(Date.now() + retryDelaySeconds(job.attemptCount) * 1000) : job.runAt;
  await updateClaimedJob(job, {
    status,
    runAt,
    lastErrorCode: failure.code,
    completedAt: status === 'RETRY' ? null : new Date(),
    lockedAt: null,
    lockExpiresAt: null,
    lockToken: null,
  });
  if (job.resultMessageId) {
    await db.update(messages).set({ metadata: sql`COALESCE(${messages.metadata}, '{}'::jsonb) || jsonb_build_object('automationStatus'::text, ${status}::text, 'automationErrorCode'::text, ${failure.code}::text)` })
      .where(eq(messages.id, job.resultMessageId));
  }
  return { id: job.id, status, code: failure.code };
}

async function processWaiverReminder(job: ClaimedAutomationJob, payload: Record<string, unknown>) {
  if (typeof payload.waiverAssignmentId !== 'string') {
    await completeJob(job, 'CANCELLED', 'INVALID_JOB_REFERENCE');
    return { id: job.id, status: 'CANCELLED' };
  }
  const [assignment] = await db.select({ assignment: externalWaiverAssignments, appointment: appointments })
    .from(externalWaiverAssignments)
    .innerJoin(appointments, eq(externalWaiverAssignments.appointmentId, appointments.id))
    .where(and(
      eq(externalWaiverAssignments.id, payload.waiverAssignmentId),
      eq(externalWaiverAssignments.organizationId, job.organizationId),
      eq(appointments.artistId, job.artistId),
      eq(externalWaiverAssignments.clientId, job.clientId),
    )).limit(1);
  if (!assignment || assignment.assignment.status !== 'SENT' || assignment.appointment.status === 'CANCELLED' || assignment.assignment.completedAt) {
    await completeJob(job, 'CANCELLED', 'WAIVER_NO_LONGER_ELIGIBLE');
    return { id: job.id, status: 'CANCELLED' };
  }
  if (!job.conversationId) {
    await completeJob(job, 'CANCELLED', 'WAIVER_CONVERSATION_MISSING');
    return { id: job.id, status: 'CANCELLED' };
  }
  const [sourceMessage] = await db.select().from(messages).where(and(
    eq(messages.conversationId, job.conversationId!),
    sql`${messages.metadata}->>'waiverAssignmentId' = ${assignment.assignment.id}`,
  )).limit(1);
  const [client] = await db.select().from(clients).where(and(eq(clients.id, job.clientId), eq(clients.organizationId, job.organizationId))).limit(1);
  if (!sourceMessage || !client?.phone || !client.smsOptIn || client.smsConsentStatus === 'OPTED_OUT') {
    await completeJob(job, 'CANCELLED', 'WAIVER_DELIVERY_NOT_ELIGIBLE');
    return { id: job.id, status: 'CANCELLED' };
  }
  const now = new Date();
  let reminderMessage = await findGeneratedMessage(job);
  if (!reminderMessage) {
    [reminderMessage] = await db.insert(messages).values({
      conversationId: job.conversationId, senderType: 'SYSTEM', role: 'assistant', content: sourceMessage.content,
      metadata: { automationJobId: job.id, waiverAssignmentId: assignment.assignment.id, provider: 'twilio', status: 'generated' },
    }).returning();
  }
  if (!await updateClaimedJob(job, { status: 'SENDING', resultMessageId: reminderMessage.id, lockedAt: now, lockExpiresAt: new Date(now.getTime() + 300_000) })) {
    await db.delete(messages).where(eq(messages.id, reminderMessage.id));
    return { id: job.id, status: 'CANCELLED' };
  }
  job.status = 'SENDING';
  await db.update(messages).set({ metadata: { automationJobId: job.id, waiverAssignmentId: assignment.assignment.id, provider: 'twilio', status: 'provider_send_started' } }).where(eq(messages.id, reminderMessage.id));
  const sent = await sendStudioSms({ organizationId: job.organizationId, artistId: job.artistId, to: client.phone, body: sourceMessage.content });
  await db.update(messages).set({ externalMessageId: sent.sid, metadata: { automationJobId: job.id, waiverAssignmentId: assignment.assignment.id, provider: 'twilio', studioPhone: sent.studioPhone, status: sent.status } }).where(eq(messages.id, reminderMessage.id));
  await db.update(externalWaiverAssignments).set({ lastReminderAt: now, updatedAt: now }).where(eq(externalWaiverAssignments.id, assignment.assignment.id));
  await updateClaimedJob(job, { status: 'COMPLETED', resultMessageId: reminderMessage.id, sentAt: now, completedAt: now, lastErrorCode: null, lockedAt: null, lockExpiresAt: null, lockToken: null });
  return { id: job.id, status: 'COMPLETED' };
}

async function currentAiEligibility(job: ClaimedAutomationJob, expectedVersion: number, renewLease: boolean) {
  if (!job.conversationId || !job.lockToken) return false;
  if (renewLease && !await renewAutomationJobLease(job.id, job.lockToken)) return false;
  const [conversation] = await db.select().from(conversations).where(and(
    eq(conversations.id, job.conversationId),
    eq(conversations.organizationId, job.organizationId),
    eq(conversations.artistId, job.artistId),
    eq(conversations.clientId, job.clientId),
  )).limit(1);
  const [artist] = await db.select({ receptionistEnabled: artists.receptionistEnabled }).from(artists).where(and(eq(artists.id, job.artistId), eq(artists.organizationId, job.organizationId))).limit(1);
  return Boolean(conversation && artist?.receptionistEnabled && conversation.inboundVersion === expectedVersion && shouldRunAi(conversation));
}

async function processAiResponse(job: ClaimedAutomationJob, payload: Record<string, unknown>) {
  if (!job.conversationId || typeof payload.latestInboundMessageId !== 'string' || typeof payload.latestInboundVersion !== 'number') {
    await completeJob(job, 'CANCELLED', 'INVALID_JOB_REFERENCE');
    return { id: job.id, status: 'CANCELLED' };
  }
  const latestInboundVersion = payload.latestInboundVersion;
  const [conversation] = await db.select().from(conversations).where(and(
    eq(conversations.id, job.conversationId), eq(conversations.organizationId, job.organizationId),
    eq(conversations.artistId, job.artistId), eq(conversations.clientId, job.clientId),
  )).limit(1);
  const [client] = await db.select().from(clients).where(and(eq(clients.id, job.clientId), eq(clients.organizationId, job.organizationId))).limit(1);
  const [inboundMessage] = await db.select().from(messages).where(and(eq(messages.id, payload.latestInboundMessageId), eq(messages.conversationId, job.conversationId))).limit(1);
  if (!conversation || !client || !inboundMessage || conversation.inboundVersion !== latestInboundVersion || !shouldRunAi(conversation)) {
    await completeJob(job, 'CANCELLED', 'AI_RESPONSE_STALE_OR_PAUSED');
    return { id: job.id, status: 'CANCELLED' };
  }
  if (job.channel === 'SMS' && (!client.phone || !client.smsOptIn || client.smsConsentStatus === 'OPTED_OUT')) {
    await completeJob(job, 'CANCELLED', 'SMS_NOT_ELIGIBLE');
    return { id: job.id, status: 'CANCELLED' };
  }
  if ((job.channel === 'FACEBOOK' || job.channel === 'INSTAGRAM') && !withinSocialReplyWindow(conversation.lastInboundAt)) {
    await completeJob(job, 'CANCELLED', 'META_REPLY_WINDOW_EXPIRED');
    return { id: job.id, status: 'CANCELLED' };
  }
  const generated = await findGeneratedMessage(job);
  let resultMessage = generated;
  if (!resultMessage) {
    const { context } = await resolveVerifiedChannelMaiaAgentContext({ organizationId: job.organizationId, artistId: job.artistId, clientId: job.clientId, conversationId: conversation.id }, job.channel as 'SMS' | 'FACEBOOK' | 'INSTAGRAM');
    let ai: Awaited<ReturnType<typeof runMaiaAgent>>;
    try {
      ai = await runMaiaAgent(context, {
        message: inboundMessage.content,
        messageAlreadyStored: true,
        automationGuard: () => currentAiEligibility(job, latestInboundVersion, true),
        automationJobId: job.id,
        automationInboundVersion: latestInboundVersion,
      });
    } catch (error) {
      if (!await currentAiEligibility(job, latestInboundVersion, false)) {
        await completeJob(job, 'CANCELLED', 'AI_RESPONSE_SUPPRESSED');
        return { id: job.id, status: 'CANCELLED' };
      }
      throw error;
    }
    if ('error' in ai || !ai.reply) {
      await completeJob(job, 'CANCELLED', 'AI_RESPONSE_SUPPRESSED');
      return { id: job.id, status: 'CANCELLED' };
    }
    const [saved] = await db.update(messages).set({ metadata: { automationJobId: job.id, automationInboundVersion: latestInboundVersion, channel: job.channel.toLowerCase(), source: 'ai-receptionist', status: 'generated' } })
      .where(and(eq(messages.id, ai.messageId), eq(messages.conversationId, conversation.id))).returning();
    resultMessage = saved;
    if (!resultMessage || !await updateClaimedJob(job, { resultMessageId: resultMessage.id })) {
      if (resultMessage) await db.delete(messages).where(eq(messages.id, resultMessage.id));
      return { id: job.id, status: 'CANCELLED' };
    }
  }
  if (!resultMessage || !await currentAiEligibility(job, latestInboundVersion, true)) {
    if (resultMessage && resultMessage.metadata && typeof resultMessage.metadata === 'object' && (resultMessage.metadata as Record<string, unknown>).status !== 'sent') await db.delete(messages).where(eq(messages.id, resultMessage.id));
    await completeJob(job, 'CANCELLED', 'AI_RESPONSE_SUPPRESSED');
    return { id: job.id, status: 'CANCELLED' };
  }
  const movedToSending = await updateClaimedJob(job, { status: 'SENDING', lockedAt: new Date(), lockExpiresAt: new Date(Date.now() + 300_000) });
  if (movedToSending) job.status = 'SENDING';
  if (!movedToSending || !await currentAiEligibility(job, latestInboundVersion, true)) {
    if (resultMessage && resultMessage.metadata && typeof resultMessage.metadata === 'object' && (resultMessage.metadata as Record<string, unknown>).status !== 'sent') await db.delete(messages).where(eq(messages.id, resultMessage.id));
    await completeJob(job, 'CANCELLED', 'AI_RESPONSE_SUPPRESSED');
    return { id: job.id, status: 'CANCELLED' };
  }
  await db.update(messages).set({ metadata: { automationJobId: job.id, automationInboundVersion: latestInboundVersion, channel: job.channel.toLowerCase(), source: 'ai-receptionist', status: 'provider_send_started' } }).where(eq(messages.id, resultMessage.id));
  if (!await currentAiEligibility(job, latestInboundVersion, true)) {
    await db.delete(messages).where(eq(messages.id, resultMessage.id));
    await completeJob(job, 'CANCELLED', 'AI_RESPONSE_SUPPRESSED');
    return { id: job.id, status: 'CANCELLED' };
  }
  if (job.channel === 'SMS') {
    if (!client.phone) throw new Error('Client is not opted in to SMS for this artist.');
    const sent = await sendStudioSms({ organizationId: job.organizationId, artistId: job.artistId, to: client.phone, body: resultMessage.content });
    await db.update(messages).set({ externalMessageId: sent.sid, metadata: { automationJobId: job.id, channel: 'sms', source: 'ai-receptionist', provider: 'twilio', studioPhone: sent.studioPhone, status: sent.status } }).where(eq(messages.id, resultMessage.id));
  } else if (job.channel === 'FACEBOOK' || job.channel === 'INSTAGRAM') {
    if (!conversation.channelConnectionId || !conversation.externalParticipantId || !withinSocialReplyWindow(conversation.lastInboundAt)) throw new Error('Meta reply window or conversation mapping is no longer valid.');
    const [connection] = await db.select().from(channelConnections).where(and(eq(channelConnections.id, conversation.channelConnectionId), eq(channelConnections.organizationId, job.organizationId), eq(channelConnections.artistId, job.artistId), eq(channelConnections.status, 'ACTIVE'))).limit(1);
    if (!connection?.accessTokenEncrypted) throw new Error('Meta channel connection is no longer active.');
    const accessToken = decryptComplianceSecret(connection.accessTokenEncrypted);
    try {
      const sent = await sendMetaMessage({ externalAccountId: connection.externalAccountId, recipientId: conversation.externalParticipantId, accessToken, text: resultMessage.content });
      await db.update(messages).set({ externalMessageId: sent.message_id ?? sent.id ?? null, metadata: { automationJobId: job.id, channel: job.channel.toLowerCase(), source: 'ai-receptionist', provider: job.channel.toLowerCase(), status: 'sent' } }).where(eq(messages.id, resultMessage.id));
    } catch (error) {
      await db.update(channelConnections).set({ ...(isMetaAuthError(error) ? { status: 'ACTION_REQUIRED' } : {}), lastError: 'AUTOMATED_REPLY_FAILED', lastCheckedAt: new Date(), updatedAt: new Date() }).where(eq(channelConnections.id, connection.id));
      throw error;
    }
  } else {
    throw new Error('Unsupported automated response channel.');
  }
  const status = await finishAiResponse(job, latestInboundVersion);
  return { id: job.id, status: status ?? 'DELIVERY_UNKNOWN' };
}

export async function processClaimedAutomationJob(job: ClaimedAutomationJob) {
  const payload = payloadRecord(job);
  try {
    if (job.type === 'WAIVER_REMINDER') return await processWaiverReminder(job, payload);
    if (job.type === 'AI_RESPONSE') return await processAiResponse(job, payload);
    await completeJob(job, 'CANCELLED', 'UNSUPPORTED_JOB_TYPE');
    return { id: job.id, status: 'CANCELLED' };
  } catch (error) {
    return failJob(job, error, job.status === 'SENDING');
  }
}
