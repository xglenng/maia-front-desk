-- Additive only: no automatic legal identity or account adoption.
CREATE TABLE "legal_customer_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"legal_customer_id" uuid NOT NULL,
	"twilio_account_id" uuid NOT NULL,
	"verified_by_user_id" uuid NOT NULL,
	"verified_at" timestamp with time zone NOT NULL,
	"verification_reference" text NOT NULL,
	CONSTRAINT "legal_customer_accounts_legal_customer_id_unique" UNIQUE("legal_customer_id"),
	CONSTRAINT "legal_customer_accounts_twilio_account_id_unique" UNIQUE("twilio_account_id"),
	CONSTRAINT "legal_customer_accounts_reference_check" CHECK (length(btrim("legal_customer_accounts"."verification_reference")) > 0)
);
--> statement-breakpoint
CREATE TABLE "legal_customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"customer_type" text NOT NULL,
	"legal_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "legal_customers_organization_id_unique" UNIQUE("organization_id"),
	CONSTRAINT "legal_customers_type_check" CHECK ("legal_customers"."customer_type" IN ('STUDIO', 'INDEPENDENT_BUSINESS')),
	CONSTRAINT "legal_customers_name_check" CHECK (length(btrim("legal_customers"."legal_name")) > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "legal_customers_id_organization_uidx" ON "legal_customers" USING btree ("id","organization_id");
--> statement-breakpoint
ALTER TABLE "legal_customer_accounts" ADD CONSTRAINT "legal_customer_accounts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "legal_customer_accounts" ADD CONSTRAINT "legal_customer_accounts_customer_tenant_fk" FOREIGN KEY ("legal_customer_id","organization_id") REFERENCES "public"."legal_customers"("id","organization_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "legal_customer_accounts" ADD CONSTRAINT "legal_customer_accounts_account_tenant_fk" FOREIGN KEY ("twilio_account_id","organization_id") REFERENCES "public"."twilio_accounts"("id","organization_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "legal_customer_accounts" ADD CONSTRAINT "legal_customer_accounts_verifier_tenant_fk" FOREIGN KEY ("verified_by_user_id","organization_id") REFERENCES "public"."users"("id","organization_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "legal_customers" ADD CONSTRAINT "legal_customers_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
