CREATE TABLE "consent_form_drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"form_id" uuid NOT NULL,
	"name" text NOT NULL,
	"audience" text NOT NULL,
	"definition" jsonb NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"base_version" integer NOT NULL,
	"updated_by_user_id" uuid NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "consent_drafts_revision_check" CHECK ("consent_form_drafts"."revision" > 0 AND "consent_form_drafts"."base_version" >= 0),
	CONSTRAINT "consent_drafts_audience_check" CHECK ("consent_form_drafts"."audience" IN ('ANY','ADULT','MINOR'))
);
--> statement-breakpoint
CREATE TABLE "consent_form_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"form_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"name" text NOT NULL,
	"audience" text NOT NULL,
	"definition" jsonb NOT NULL,
	"template_id" uuid NOT NULL,
	"content_hash" text NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "consent_versions_number_check" CHECK ("consent_form_versions"."version" > 0),
	CONSTRAINT "consent_versions_audience_check" CHECK ("consent_form_versions"."audience" IN ('ANY','ADULT','MINOR')),
	CONSTRAINT "consent_versions_hash_check" CHECK ("consent_form_versions"."content_hash" ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint
CREATE UNIQUE INDEX "consent_drafts_form_uidx" ON "consent_form_drafts" USING btree ("organization_id","form_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "consent_versions_form_number_uidx" ON "consent_form_versions" USING btree ("organization_id","form_id","version");
--> statement-breakpoint
CREATE UNIQUE INDEX "consent_versions_id_form_org_uidx" ON "consent_form_versions" USING btree ("id","form_id","organization_id");
--> statement-breakpoint
ALTER TABLE "external_waiver_assignments" ADD COLUMN "native_version_id" uuid;
--> statement-breakpoint
ALTER TABLE "consent_form_drafts" ADD CONSTRAINT "consent_form_drafts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "consent_form_drafts" ADD CONSTRAINT "consent_drafts_form_tenant_fk" FOREIGN KEY ("form_id","organization_id") REFERENCES "external_waiver_forms"("id","organization_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "consent_form_drafts" ADD CONSTRAINT "consent_drafts_user_tenant_fk" FOREIGN KEY ("updated_by_user_id","organization_id") REFERENCES "users"("id","organization_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "consent_form_versions" ADD CONSTRAINT "consent_form_versions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "consent_form_versions" ADD CONSTRAINT "consent_versions_form_tenant_fk" FOREIGN KEY ("form_id","organization_id") REFERENCES "external_waiver_forms"("id","organization_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "consent_form_versions" ADD CONSTRAINT "consent_versions_template_tenant_fk" FOREIGN KEY ("template_id","organization_id") REFERENCES "waiver_templates"("id","organization_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "consent_form_versions" ADD CONSTRAINT "consent_versions_user_tenant_fk" FOREIGN KEY ("created_by_user_id","organization_id") REFERENCES "users"("id","organization_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "external_waiver_assignments" ADD CONSTRAINT "waiver_assignment_native_version_fk" FOREIGN KEY ("native_version_id","waiver_form_id","organization_id") REFERENCES "consent_form_versions"("id","form_id","organization_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
-- No legacy assignments are backfilled: their issuance content is not known.
-- Published versions and their backing templates remain immutable.
CREATE FUNCTION protect_published_consent_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 RAISE EXCEPTION 'Published consent versions cannot be changed or deleted' USING ERRCODE = '23514';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER consent_version_retention BEFORE UPDATE OR DELETE OR TRUNCATE ON consent_form_versions
FOR EACH STATEMENT EXECUTE FUNCTION protect_published_consent_version();
--> statement-breakpoint
CREATE FUNCTION protect_published_consent_template() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM consent_form_versions WHERE template_id=OLD.id AND organization_id=OLD.organization_id) THEN
  RAISE EXCEPTION 'Published consent templates cannot be changed or deleted' USING ERRCODE = '23514';
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER published_consent_template_retention BEFORE UPDATE OR DELETE ON waiver_templates
FOR EACH ROW EXECUTE FUNCTION protect_published_consent_template();
--> statement-breakpoint
CREATE FUNCTION protect_consent_assignment_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.native_version_id IS NOT NULL AND
  (NEW.native_version_id,NEW.waiver_form_id,NEW.organization_id,NEW.appointment_id,NEW.client_id)
  IS DISTINCT FROM (OLD.native_version_id,OLD.waiver_form_id,OLD.organization_id,OLD.appointment_id,OLD.client_id) THEN
  RAISE EXCEPTION 'Issued consent version and recipient cannot be changed' USING ERRCODE = '23514';
 END IF;
 RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER consent_assignment_version_retention BEFORE UPDATE ON external_waiver_assignments
FOR EACH ROW EXECUTE FUNCTION protect_consent_assignment_version();
