CREATE TABLE "twilio_account_creation_intents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"legal_customer_id" uuid NOT NULL,
	"artist_id" uuid NOT NULL,
	"requested_by_user_id" uuid NOT NULL,
	"twilio_account_id" uuid,
	"status" text DEFAULT 'INTENT' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "twilio_account_creation_intents_organization_id_unique" UNIQUE("organization_id"),
	CONSTRAINT "account_creation_state_check" CHECK (("twilio_account_creation_intents"."status" = 'INTENT' AND "twilio_account_creation_intents"."twilio_account_id" IS NULL AND "twilio_account_creation_intents"."completed_at" IS NULL) OR ("twilio_account_creation_intents"."status" = 'COMPLETED' AND "twilio_account_creation_intents"."twilio_account_id" IS NOT NULL AND "twilio_account_creation_intents"."completed_at" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "twilio_account_creation_intents" ADD CONSTRAINT "twilio_account_creation_intents_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "twilio_account_creation_intents" ADD CONSTRAINT "account_creation_customer_tenant_fk" FOREIGN KEY ("legal_customer_id","organization_id") REFERENCES "public"."legal_customers"("id","organization_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "twilio_account_creation_intents" ADD CONSTRAINT "account_creation_artist_tenant_fk" FOREIGN KEY ("artist_id","organization_id") REFERENCES "public"."artists"("id","organization_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "twilio_account_creation_intents" ADD CONSTRAINT "account_creation_requester_tenant_fk" FOREIGN KEY ("requested_by_user_id","organization_id") REFERENCES "public"."users"("id","organization_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "twilio_account_creation_intents" ADD CONSTRAINT "account_creation_account_tenant_fk" FOREIGN KEY ("twilio_account_id","organization_id") REFERENCES "public"."twilio_accounts"("id","organization_id") ON DELETE no action ON UPDATE no action;
