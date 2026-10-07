-- D1 follows the unapplied 0000_studio_configuration_foundation migration.
-- Existing timestamp-without-zone values were written as UTC instants by Node.
ALTER TABLE "artists"
  ADD COLUMN "sms_response_delay_seconds" integer DEFAULT 0 NOT NULL,
  ADD COLUMN "meta_response_delay_seconds" integer DEFAULT 0 NOT NULL,
  ADD COLUMN "web_response_delay_seconds" integer DEFAULT 0 NOT NULL,
  ADD CONSTRAINT "artists_sms_response_delay_check" CHECK ("sms_response_delay_seconds" IN (0, 60, 120, 300)),
  ADD CONSTRAINT "artists_meta_response_delay_check" CHECK ("meta_response_delay_seconds" IN (0, 60, 120, 300)),
  ADD CONSTRAINT "artists_web_response_delay_check" CHECK ("web_response_delay_seconds" = 0);

ALTER TABLE "conversations"
  ADD COLUMN "inbound_version" integer DEFAULT 0 NOT NULL;

ALTER TABLE "automation_jobs"
  ALTER COLUMN "run_at" TYPE timestamptz USING "run_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "sent_at" TYPE timestamptz USING "sent_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "created_at" TYPE timestamptz USING "created_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "updated_at" TYPE timestamptz USING "updated_at" AT TIME ZONE 'UTC';

ALTER TABLE "automation_jobs"
  ADD COLUMN "conversation_id" uuid REFERENCES "conversations"("id"),
  ADD COLUMN "result_message_id" uuid REFERENCES "messages"("id"),
  ADD COLUMN "dedupe_key" text,
  ADD COLUMN "attempt_count" integer DEFAULT 0 NOT NULL,
  ADD COLUMN "max_attempts" integer DEFAULT 5 NOT NULL,
  ADD COLUMN "locked_at" timestamptz,
  ADD COLUMN "lock_expires_at" timestamptz,
  ADD COLUMN "lock_token" uuid,
  ADD COLUMN "last_error_code" text,
  ADD COLUMN "completed_at" timestamptz;

-- Waiver jobs use their assignment as a stable logical key. If legacy duplicate
-- jobs exist, retain one canonical key and give the other historical rows unique
-- legacy keys so migration remains safe and does not discard job history.
WITH ranked_waivers AS (
  SELECT id, organization_id, payload->>'waiverAssignmentId' AS assignment_id,
    row_number() OVER (
      PARTITION BY organization_id, payload->>'waiverAssignmentId'
      ORDER BY CASE WHEN status IN ('SENT', 'COMPLETED') THEN 0 ELSE 1 END, created_at DESC, id
    ) AS row_num
  FROM automation_jobs
  WHERE type = 'WAIVER_REMINDER' AND payload ? 'waiverAssignmentId'
)
UPDATE automation_jobs AS job
SET dedupe_key = CASE
  WHEN ranked.row_num = 1 THEN 'WAIVER_REMINDER:' || ranked.assignment_id
  ELSE 'legacy:' || job.id::text
END,
status = CASE WHEN ranked.row_num > 1 AND job.status IN ('PENDING', 'RETRY', 'PROCESSING') THEN 'CANCELLED' ELSE job.status END,
completed_at = CASE WHEN ranked.row_num > 1 AND job.status IN ('PENDING', 'RETRY', 'PROCESSING') THEN COALESCE(job.completed_at, job.updated_at) ELSE job.completed_at END
FROM ranked_waivers AS ranked
WHERE job.id = ranked.id;

UPDATE automation_jobs SET dedupe_key = 'legacy:' || id::text WHERE dedupe_key IS NULL;
UPDATE automation_jobs SET status = 'COMPLETED', completed_at = COALESCE(sent_at, updated_at) WHERE status = 'SENT';

-- Historical waiver URLs contain bearer tracking tokens. New jobs render from
-- the assignment-linked message, so remove the rendered body from queued payloads.
UPDATE automation_jobs
SET payload = jsonb_build_object('waiverAssignmentId', payload->>'waiverAssignmentId')
WHERE type = 'WAIVER_REMINDER' AND payload ? 'waiverAssignmentId';

UPDATE automation_jobs AS job
SET conversation_id = source.conversation_id
FROM messages AS source
WHERE job.type = 'WAIVER_REMINDER'
  AND job.dedupe_key = 'WAIVER_REMINDER:' || (job.payload->>'waiverAssignmentId')
  AND source.metadata->>'waiverAssignmentId' = job.payload->>'waiverAssignmentId'
  AND job.payload ? 'waiverAssignmentId';

ALTER TABLE "automation_jobs"
  ALTER COLUMN "dedupe_key" SET NOT NULL,
  ADD CONSTRAINT "automation_jobs_lifecycle_check" CHECK ("status" IN ('PENDING', 'PROCESSING', 'SENDING', 'RETRY', 'COMPLETED', 'FAILED', 'DELIVERY_UNKNOWN', 'CANCELLED')),
  ADD CONSTRAINT "automation_jobs_attempts_check" CHECK ("attempt_count" >= 0 AND "max_attempts" >= 1);

CREATE UNIQUE INDEX "automation_jobs_organization_dedupe_uidx"
  ON "automation_jobs" ("organization_id", "dedupe_key");
CREATE INDEX "automation_jobs_due_idx"
  ON "automation_jobs" ("status", "run_at", "id");
CREATE INDEX "automation_jobs_conversation_idx"
  ON "automation_jobs" ("conversation_id", "status");
CREATE UNIQUE INDEX "automation_jobs_result_message_uidx"
  ON "automation_jobs" ("result_message_id") WHERE "result_message_id" IS NOT NULL;
