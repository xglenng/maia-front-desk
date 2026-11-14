CREATE TABLE "owner_welcome_emails" (
	"organization_id" uuid PRIMARY KEY NOT NULL,
	"owner_id" uuid NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"run_at" timestamp with time zone DEFAULT now() NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"lock_token" uuid,
	"lock_expires_at" timestamp with time zone,
	"first_send_at" timestamp with time zone,
	"email_payload" jsonb,
	"last_error_code" text,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "owner_welcome_emails_status_check" CHECK ("owner_welcome_emails"."status" IN ('PENDING','PROCESSING','RETRY','SENT','FAILED','DELIVERY_UNKNOWN')),
	CONSTRAINT "owner_welcome_emails_attempt_check" CHECK ("owner_welcome_emails"."attempt_count" >= 0)
);
--> statement-breakpoint
ALTER TABLE "owner_welcome_emails" ADD CONSTRAINT "owner_welcome_emails_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "owner_welcome_emails" ADD CONSTRAINT "owner_welcome_emails_owner_tenant_fk" FOREIGN KEY ("owner_id","organization_id") REFERENCES "public"."users"("id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "owner_welcome_emails_due_idx" ON "owner_welcome_emails" USING btree ("status","run_at");