ALTER TABLE organizations ADD COLUMN industries jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE organizations ADD COLUMN staff_term text NOT NULL DEFAULT 'artist';
ALTER TABLE organizations ADD COLUMN consent_forms_enabled boolean NOT NULL DEFAULT true;
ALTER TABLE organizations ADD COLUMN request_forms_enabled boolean NOT NULL DEFAULT true;
--> statement-breakpoint
ALTER TABLE request_forms DROP CONSTRAINT request_forms_request_type_check;
ALTER TABLE request_forms ADD CONSTRAINT request_forms_type_check CHECK (request_type IN ('PIERCING_REQUEST','TATTOO_REQUEST','HAIR_REQUEST','NAILS_REQUEST','ESTHETICS_REQUEST'));
ALTER TABLE request_submissions DROP CONSTRAINT request_submissions_request_type_check;
ALTER TABLE request_submissions ADD CONSTRAINT request_submissions_type_check CHECK (request_type IN ('PIERCING_REQUEST','TATTOO_REQUEST','HAIR_REQUEST','NAILS_REQUEST','ESTHETICS_REQUEST'));
