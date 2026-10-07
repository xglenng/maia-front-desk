ALTER TABLE "organizations"
  ADD COLUMN "public_name" text,
  ADD COLUMN "public_phone" text,
  ADD COLUMN "public_email" text,
  ADD COLUMN "website" text;

ALTER TABLE "artists"
  ADD COLUMN "receptionist_enabled" boolean DEFAULT true NOT NULL,
  ADD COLUMN "receptionist_tone" text DEFAULT 'WARM' NOT NULL,
  ADD COLUMN "receptionist_greeting" text,
  ADD COLUMN "receptionist_instructions" text,
  ADD CONSTRAINT "artists_receptionist_tone_check" CHECK ("receptionist_tone" IN ('WARM', 'PROFESSIONAL', 'FRIENDLY'));

ALTER TABLE "business_rules"
  ADD COLUMN "visibility" text DEFAULT 'AI_INTERNAL' NOT NULL,
  ADD CONSTRAINT "business_rules_visibility_check" CHECK ("visibility" IN ('CLIENT_VISIBLE', 'AI_INTERNAL'));

CREATE TABLE "studio_locations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "name" text NOT NULL,
  "address_line_1" text,
  "address_line_2" text,
  "city" text,
  "region" text,
  "postal_code" text,
  "country" text,
  "phone" text,
  "email" text,
  "timezone" text NOT NULL,
  "business_hours_configured" boolean DEFAULT false NOT NULL,
  "is_primary" boolean DEFAULT false NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX "studio_locations_id_organization_idx"
  ON "studio_locations" ("id", "organization_id");
CREATE INDEX "studio_locations_organization_idx"
  ON "studio_locations" ("organization_id");
CREATE UNIQUE INDEX "studio_locations_one_primary_per_org_idx"
  ON "studio_locations" ("organization_id") WHERE "is_primary" = true;

CREATE TABLE "studio_business_hours" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "location_id" uuid NOT NULL,
  "day_of_week" integer NOT NULL,
  "start_minute" integer NOT NULL,
  "end_minute" integer NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "studio_business_hours_weekday_check" CHECK ("day_of_week" BETWEEN 0 AND 6),
  CONSTRAINT "studio_business_hours_start_check" CHECK ("start_minute" BETWEEN 0 AND 1439),
  CONSTRAINT "studio_business_hours_end_check" CHECK ("end_minute" BETWEEN 1 AND 1440),
  CONSTRAINT "studio_business_hours_valid_range_check" CHECK ("start_minute" < "end_minute"),
  CONSTRAINT "studio_business_hours_tenant_location_fk" FOREIGN KEY ("location_id", "organization_id") REFERENCES "studio_locations"("id", "organization_id") ON DELETE CASCADE
);
CREATE INDEX "studio_business_hours_location_day_idx"
  ON "studio_business_hours" ("organization_id", "location_id", "day_of_week");

CREATE TABLE "studio_faqs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "location_id" uuid,
  "category" text,
  "question" text NOT NULL,
  "answer" text NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "studio_faqs_tenant_location_fk" FOREIGN KEY ("location_id", "organization_id") REFERENCES "studio_locations"("id", "organization_id") ON DELETE CASCADE
);
CREATE INDEX "studio_faqs_organization_idx"
  ON "studio_faqs" ("organization_id", "active", "sort_order");

CREATE TABLE "studio_aftercare" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "location_id" uuid,
  "service_type" text,
  "category" text,
  "title" text NOT NULL,
  "instructions" text NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "studio_aftercare_tenant_location_fk" FOREIGN KEY ("location_id", "organization_id") REFERENCES "studio_locations"("id", "organization_id") ON DELETE CASCADE
);
CREATE INDEX "studio_aftercare_organization_idx"
  ON "studio_aftercare" ("organization_id", "active", "sort_order");
