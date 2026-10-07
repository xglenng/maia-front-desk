ALTER TABLE "artists"
  ADD COLUMN "venmo_enabled" boolean DEFAULT false NOT NULL,
  ADD COLUMN "venmo_username" text,
  ADD COLUMN "venmo_payment_url" text,
  ADD COLUMN "venmo_payment_instructions" text,
  ADD COLUMN "appointment_reminder_enabled" boolean DEFAULT false NOT NULL,
  ADD COLUMN "appointment_reminder_minutes" integer DEFAULT 1440 NOT NULL,
  ADD COLUMN "appointment_reminder_short_notice_mode" text DEFAULT 'SKIP' NOT NULL,
  ADD COLUMN "appointment_waiver_send_enabled" boolean DEFAULT false NOT NULL,
  ADD COLUMN "appointment_waiver_send_minutes" integer DEFAULT 360 NOT NULL,
  ADD COLUMN "aftercare_followup_enabled" boolean DEFAULT false NOT NULL,
  ADD COLUMN "aftercare_followup_hours" integer DEFAULT 24 NOT NULL,
  ADD COLUMN "review_followup_enabled" boolean DEFAULT false NOT NULL,
  ADD COLUMN "review_followup_hours" integer DEFAULT 24 NOT NULL,
  ADD COLUMN "google_review_url" text,
  ADD COLUMN "review_followup_message" text,
  ADD CONSTRAINT "artists_appointment_reminder_minutes_check" CHECK ("appointment_reminder_minutes" IN (120, 360, 720, 1440, 2880)),
  ADD CONSTRAINT "artists_appointment_reminder_short_notice_check" CHECK ("appointment_reminder_short_notice_mode" IN ('SKIP', 'SEND_AFTER_DELAY')),
  ADD CONSTRAINT "artists_appointment_waiver_send_minutes_check" CHECK ("appointment_waiver_send_minutes" IN (120, 240, 360, 720)),
  ADD CONSTRAINT "artists_aftercare_followup_hours_check" CHECK ("aftercare_followup_hours" IN (12, 24, 48, 72)),
  ADD CONSTRAINT "artists_review_followup_hours_check" CHECK ("review_followup_hours" IN (24, 48, 72, 168));

ALTER TABLE "appointments"
  ADD COLUMN "completed_at" timestamptz,
  ADD COLUMN "schedule_revision" integer DEFAULT 0 NOT NULL,
  ADD COLUMN "payment_provider" text,
  ADD CONSTRAINT "appointments_schedule_revision_check" CHECK ("schedule_revision" >= 0);

UPDATE "appointments" AS appointment
SET "payment_provider" = service."payment_provider"
FROM "services" AS service
WHERE appointment."service_id" = service."id"
  AND appointment."payment_provider" IS NULL;

ALTER TABLE "payments"
  ADD COLUMN "confirmation_method" text,
  ADD COLUMN "confirmed_by_user_id" uuid REFERENCES "users"("id"),
  ADD COLUMN "confirmed_at" timestamptz,
  ADD CONSTRAINT "payments_confirmation_method_check" CHECK ("confirmation_method" IS NULL OR "confirmation_method" IN ('SQUARE_WEBHOOK', 'STRIPE_WEBHOOK', 'MANUAL')),
  ADD CONSTRAINT "payments_manual_confirmation_audit_check" CHECK ("confirmation_method" IS DISTINCT FROM 'MANUAL' OR ("confirmed_by_user_id" IS NOT NULL AND "confirmed_at" IS NOT NULL));

CREATE INDEX "automation_jobs_appointment_status_idx"
  ON "automation_jobs" ("appointment_id", "status");
