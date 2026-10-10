ALTER TABLE "twilio_provision_operations" ADD COLUMN "reviewed_by_user_id" uuid;
--> statement-breakpoint
ALTER TABLE "twilio_provision_operations" ADD COLUMN "review_reference" text;
--> statement-breakpoint
ALTER TABLE "twilio_provision_operations" ADD COLUMN "reviewed_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "twilio_provision_operations" ADD CONSTRAINT "twilio_provision_operations_reviewer_tenant_fk" FOREIGN KEY ("reviewed_by_user_id","organization_id") REFERENCES "public"."users"("id","organization_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "twilio_provision_operations" ADD CONSTRAINT "twilio_provision_operations_review_check" CHECK ((reviewed_at IS NULL AND reviewed_by_user_id IS NULL AND review_reference IS NULL) OR (reviewed_at IS NOT NULL AND reviewed_by_user_id IS NOT NULL AND review_reference IS NOT NULL AND length(btrim(review_reference)) > 0 AND status = 'COMPLETED'));
