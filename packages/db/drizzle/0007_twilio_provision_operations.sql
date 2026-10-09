CREATE TABLE "twilio_provision_operations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"artist_id" uuid NOT NULL,
	"twilio_account_id" uuid NOT NULL,
	"step" text NOT NULL,
	"status" text DEFAULT 'INTENT' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "twilio_provision_operations_status_check" CHECK ("twilio_provision_operations"."status" IN ('INTENT', 'COMPLETED')),
	CONSTRAINT "twilio_provision_operations_step_check" CHECK ("twilio_provision_operations"."step" IN ('SERVICE', 'NUMBER', 'ASSOCIATE'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "twilio_provision_operations_step_uidx" ON "twilio_provision_operations" USING btree ("organization_id","artist_id","step");
--> statement-breakpoint
ALTER TABLE "twilio_provision_operations" ADD CONSTRAINT "twilio_provision_operations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "twilio_provision_operations" ADD CONSTRAINT "twilio_provision_operations_artist_tenant_fk" FOREIGN KEY ("artist_id","organization_id") REFERENCES "public"."artists"("id","organization_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "twilio_provision_operations" ADD CONSTRAINT "twilio_provision_operations_account_tenant_fk" FOREIGN KEY ("twilio_account_id","organization_id") REFERENCES "public"."twilio_accounts"("id","organization_id") ON DELETE no action ON UPDATE no action;
