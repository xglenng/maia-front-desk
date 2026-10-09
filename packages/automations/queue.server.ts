import 'server-only';
import { pool, db } from '@db/index';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { automationJobs, messages } from '@db/schema';
import { mapClaimedAutomationJob } from './claimed-job';
import { aiResponseDedupeKey, aiResponseRunAt } from './policy';

export type ClaimedAutomationJob = typeof automationJobs.$inferSelect;
export const AUTOMATION_BATCH_SIZE = 10;
export const AUTOMATION_LEASE_SECONDS = 300;

export async function enqueueAiResponse(input: {
  organizationId: string;
  artistId: string;
  clientId: string;
  conversationId: string;
  channel: 'SMS' | 'FACEBOOK' | 'INSTAGRAM';
  latestInboundMessageId: string;
  latestInboundVersion: number;
  delaySeconds: number;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const runAt = aiResponseRunAt(now, input.delaySeconds);
  const [job] = await db.insert(automationJobs).values({
    organizationId: input.organizationId,
    artistId: input.artistId,
    clientId: input.clientId,
    conversationId: input.conversationId,
    dedupeKey: aiResponseDedupeKey(input.conversationId),
    type: 'AI_RESPONSE',
    channel: input.channel,
    runAt,
    status: 'PENDING',
    attemptCount: 0,
    maxAttempts: 5,
    payload: { latestInboundMessageId: input.latestInboundMessageId, latestInboundVersion: input.latestInboundVersion },
  }).onConflictDoUpdate({
    target: [automationJobs.organizationId, automationJobs.dedupeKey],
    set: {
      artistId: input.artistId,
      clientId: input.clientId,
      conversationId: input.conversationId,
      channel: input.channel,
      runAt,
      payload: { latestInboundMessageId: input.latestInboundMessageId, latestInboundVersion: input.latestInboundVersion },
      status: sql`CASE WHEN ${automationJobs.status} = 'SENDING' THEN 'SENDING' ELSE 'PENDING' END`,
      attemptCount: sql`CASE WHEN ${automationJobs.status} = 'SENDING' THEN ${automationJobs.attemptCount} ELSE 0 END`,
      lockedAt: sql`CASE WHEN ${automationJobs.status} = 'SENDING' THEN ${automationJobs.lockedAt} ELSE NULL END`,
      lockExpiresAt: sql`CASE WHEN ${automationJobs.status} = 'SENDING' THEN ${automationJobs.lockExpiresAt} ELSE NULL END`,
      lockToken: sql`CASE WHEN ${automationJobs.status} = 'SENDING' THEN ${automationJobs.lockToken} ELSE NULL END`,
      lastErrorCode: null,
      resultMessageId: sql`CASE WHEN ${automationJobs.status} = 'SENDING' THEN ${automationJobs.resultMessageId} ELSE NULL END`,
      completedAt: null,
      sentAt: null,
      updatedAt: now,
    },
    where: sql`COALESCE((${automationJobs.payload}->>'latestInboundVersion')::integer, 0) <= ${input.latestInboundVersion}`,
  }).returning();
  return job;
}

export async function claimDueAutomationJobs(limit = AUTOMATION_BATCH_SIZE, now = new Date()): Promise<ClaimedAutomationJob[]> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`
      UPDATE automation_jobs
      SET status = CASE
        WHEN type = 'AI_RESPONSE' AND attempt_count >= max_attempts THEN 'FAILED'
        WHEN type = 'AI_RESPONSE' AND EXISTS (
              SELECT 1 FROM messages
              WHERE messages.conversation_id = automation_jobs.conversation_id
                AND messages.metadata->>'automationJobId' = automation_jobs.id::text
                    AND messages.metadata->>'automationInboundVersion' = automation_jobs.payload->>'latestInboundVersion'
            ) THEN 'RETRY'
            WHEN type = 'AI_RESPONSE' THEN 'FAILED'
            WHEN attempt_count >= max_attempts THEN 'FAILED'
            ELSE 'RETRY'
          END,
          run_at = CASE WHEN type = 'AI_RESPONSE' AND (attempt_count >= max_attempts OR NOT EXISTS (
              SELECT 1 FROM messages
              WHERE messages.conversation_id = automation_jobs.conversation_id
                AND messages.metadata->>'automationJobId' = automation_jobs.id::text
                AND messages.metadata->>'automationInboundVersion' = automation_jobs.payload->>'latestInboundVersion'
            )) OR (type <> 'AI_RESPONSE' AND attempt_count >= max_attempts) THEN run_at ELSE $1 END,
          last_error_code = CASE WHEN type = 'AI_RESPONSE' THEN 'AGENT_LEASE_EXPIRED' ELSE 'WORKER_LEASE_EXPIRED' END,
          locked_at = NULL, lock_expires_at = NULL, lock_token = NULL,
          completed_at = CASE WHEN type = 'AI_RESPONSE' AND (attempt_count >= max_attempts OR NOT EXISTS (
              SELECT 1 FROM messages
              WHERE messages.conversation_id = automation_jobs.conversation_id
                AND messages.metadata->>'automationJobId' = automation_jobs.id::text
                AND messages.metadata->>'automationInboundVersion' = automation_jobs.payload->>'latestInboundVersion'
            )) OR (type <> 'AI_RESPONSE' AND attempt_count >= max_attempts) THEN $1 ELSE NULL END,
          updated_at = $1
      WHERE status = 'PROCESSING' AND lock_expires_at <= $1
    `, [now]);
    await client.query(`
      UPDATE automation_jobs
      SET status = 'DELIVERY_UNKNOWN', last_error_code = 'DELIVERY_LEASE_EXPIRED',
          locked_at = NULL, lock_expires_at = NULL, lock_token = NULL,
          completed_at = $1, updated_at = $1
      WHERE status = 'SENDING' AND lock_expires_at <= $1
    `, [now]);
    const result = await client.query(`
      WITH due AS (
        SELECT id
        FROM automation_jobs
        WHERE status IN ('PENDING', 'RETRY') AND run_at <= $1
        ORDER BY run_at, created_at, id
        FOR UPDATE SKIP LOCKED
        LIMIT $2
      )
      UPDATE automation_jobs AS job
      SET status = 'PROCESSING',
          attempt_count = job.attempt_count + 1,
          locked_at = $1,
          lock_expires_at = $1 + ($3 * interval '1 second'),
          lock_token = gen_random_uuid(),
          updated_at = $1
      FROM due
      WHERE job.id = due.id
      RETURNING job.*
    `, [now, Math.max(1, Math.min(50, limit)), AUTOMATION_LEASE_SECONDS]);
    const jobs = result.rows.map(mapClaimedAutomationJob);
    await client.query('COMMIT');
    return jobs;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function renewAutomationJobLease(jobId: string, lockToken: string) {
  const now = new Date();
  const rows = await db.update(automationJobs).set({ lockExpiresAt: new Date(now.getTime() + AUTOMATION_LEASE_SECONDS * 1000), updatedAt: now })
    .where(and(eq(automationJobs.id, jobId), eq(automationJobs.lockToken, lockToken), sql`${automationJobs.status} IN ('PROCESSING', 'SENDING')`))
    .returning({ id: automationJobs.id });
  return rows.length === 1;
}

export async function cancelUndeliveredAiResponses(conversationId: string, code: string) {
  const now = new Date();
  return db.update(automationJobs).set({ status: 'CANCELLED', lastErrorCode: code, completedAt: now, lockedAt: null, lockExpiresAt: null, lockToken: null, updatedAt: now })
    .where(and(eq(automationJobs.conversationId, conversationId), eq(automationJobs.type, 'AI_RESPONSE'), inArray(automationJobs.status, ['PENDING', 'RETRY', 'PROCESSING'])))
    .returning({ id: automationJobs.id });
}

export async function findGeneratedMessage(job: ClaimedAutomationJob) {
  if (job.resultMessageId) {
    const [message] = await db.select().from(messages).where(and(eq(messages.id, job.resultMessageId), eq(messages.conversationId, job.conversationId!))).limit(1);
    if (message) return message;
  }
  if (!job.conversationId) return undefined;
  const [message] = await db.select().from(messages).where(and(
    eq(messages.conversationId, job.conversationId),
    sql`${messages.metadata}->>'automationJobId' = ${job.id}`,
    ...(job.type === 'AI_RESPONSE' ? [sql`${messages.metadata}->>'automationInboundVersion' = ${String((job.payload as Record<string, unknown> | null)?.latestInboundVersion ?? '')}`] : []),
  )).limit(1);
  return message;
}

export async function updateClaimedJob(job: ClaimedAutomationJob, values: Partial<typeof automationJobs.$inferInsert>) {
  if (!job.lockToken) return false;
  const updated = await db.update(automationJobs).set({ ...values, updatedAt: new Date() }).where(and(
    eq(automationJobs.id, job.id),
    eq(automationJobs.lockToken, job.lockToken),
    sql`${automationJobs.status} IN ('PROCESSING', 'SENDING')`,
  )).returning({ id: automationJobs.id });
  return updated.length === 1;
}

export async function finishAiResponse(job: ClaimedAutomationJob, processedInboundVersion: number) {
  if (!job.lockToken) return undefined;
  const now = new Date();
  const hasNewerInbound = sql`COALESCE((${automationJobs.payload}->>'latestInboundVersion')::integer, 0) > ${processedInboundVersion}`;
  const [updated] = await db.update(automationJobs).set({
    status: sql`CASE WHEN ${hasNewerInbound} THEN 'PENDING' ELSE 'COMPLETED' END`,
    attemptCount: sql`CASE WHEN ${hasNewerInbound} THEN 0 ELSE ${automationJobs.attemptCount} END`,
    resultMessageId: sql`CASE WHEN ${hasNewerInbound} THEN NULL ELSE ${automationJobs.resultMessageId} END`,
    sentAt: sql`CASE WHEN ${hasNewerInbound} THEN NULL ELSE ${now} END`,
    completedAt: sql`CASE WHEN ${hasNewerInbound} THEN NULL ELSE ${now} END`,
    lastErrorCode: null,
    lockedAt: null,
    lockExpiresAt: null,
    lockToken: null,
    updatedAt: now,
  }).where(and(eq(automationJobs.id, job.id), eq(automationJobs.lockToken, job.lockToken), eq(automationJobs.status, 'SENDING')))
    .returning({ status: automationJobs.status });
  return updated?.status;
}
