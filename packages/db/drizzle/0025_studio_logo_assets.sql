CREATE TABLE "studio_logo_assets" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "content_type" text DEFAULT 'image/webp' NOT NULL,
  "byte_length" integer NOT NULL,
  "sha256" text NOT NULL,
  "data" text NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "studio_logo_assets_content_type_check" CHECK ("content_type" = 'image/webp'),
  CONSTRAINT "studio_logo_assets_byte_length_check" CHECK ("byte_length" BETWEEN 1 AND 524288)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "studio_logo_assets_id_organization_uidx" ON "studio_logo_assets" USING btree ("id","organization_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "studio_logo_assets_one_active_per_org_uidx" ON "studio_logo_assets" USING btree ("organization_id") WHERE "active" = true;
-- Rollback: stop logo upload and form creation first. Existing signatures refer to immutable assets;
-- preserve and export signed records before dropping this table.
