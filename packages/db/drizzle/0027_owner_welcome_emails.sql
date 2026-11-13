CREATE TABLE "owner_welcome_emails" (
  "organization_id" uuid PRIMARY KEY REFERENCES "organizations"("id"),
  "owner_id" uuid NOT NULL,
  "status" text NOT NULL DEFAULT 'PENDING',
  "run_at" timestamptz NOT NULL DEFAULT now(),
  "attempt_count" integer NOT NULL DEFAULT 0,
  "lock_token" uuid,
  "lock_expires_at" timestamptz,
  "first_send_at" timestamptz,
  "email_payload" jsonb,
  "last_error_code" text,
  "sent_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "owner_welcome_emails_owner_tenant_fk" FOREIGN KEY ("owner_id", "organization_id") REFERENCES "users"("id", "organization_id"),
  CONSTRAINT "owner_welcome_emails_status_check" CHECK ("status" IN ('PENDING','PROCESSING','RETRY','SENT','FAILED','DELIVERY_UNKNOWN')),
  CONSTRAINT "owner_welcome_emails_attempt_check" CHECK ("attempt_count" >= 0)
);
--> statement-breakpoint
CREATE INDEX "owner_welcome_emails_due_idx" ON "owner_welcome_emails" ("status", "run_at");
