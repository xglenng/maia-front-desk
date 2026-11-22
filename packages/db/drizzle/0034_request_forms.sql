CREATE TABLE request_forms (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES organizations(id),
 artist_id uuid NOT NULL,
 name text NOT NULL,
 request_type text NOT NULL CHECK (request_type IN ('PIERCING_REQUEST','TATTOO_REQUEST')),
 definition jsonb NOT NULL,
 version integer NOT NULL DEFAULT 1 CHECK (version > 0),
 token_hash text NOT NULL UNIQUE,
 token_encrypted text NOT NULL,
 active boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT request_forms_artist_tenant_fk FOREIGN KEY (artist_id, organization_id) REFERENCES artists(id, organization_id)
);
CREATE UNIQUE INDEX request_forms_id_organization_uidx ON request_forms(id, organization_id);
--> statement-breakpoint
CREATE TABLE request_submissions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES organizations(id),
 form_id uuid NOT NULL,
 artist_id uuid NOT NULL,
 request_type text NOT NULL CHECK (request_type IN ('PIERCING_REQUEST','TATTOO_REQUEST')),
 client_name text NOT NULL,
 definition jsonb NOT NULL,
 answers jsonb NOT NULL,
 idempotency_key uuid NOT NULL,
 payload_hash text NOT NULL CHECK (payload_hash ~ '^[a-f0-9]{64}$'),
 created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT request_submissions_form_tenant_fk FOREIGN KEY (form_id, organization_id) REFERENCES request_forms(id, organization_id),
 CONSTRAINT request_submissions_artist_tenant_fk FOREIGN KEY (artist_id, organization_id) REFERENCES artists(id, organization_id)
);
CREATE UNIQUE INDEX request_submissions_id_organization_uidx ON request_submissions(id, organization_id);
CREATE UNIQUE INDEX request_submissions_form_replay_uidx ON request_submissions(form_id, idempotency_key);
--> statement-breakpoint
CREATE TABLE request_attachments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES organizations(id),
 submission_id uuid NOT NULL,
 field_id text NOT NULL,
 content_type text NOT NULL CHECK (content_type = 'image/jpeg'),
 byte_length integer NOT NULL CHECK (byte_length BETWEEN 1 AND 2097152),
 sha256 text NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
 encrypted_image text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT request_attachments_submission_tenant_fk FOREIGN KEY (submission_id, organization_id) REFERENCES request_submissions(id, organization_id)
);
CREATE UNIQUE INDEX request_attachments_submission_field_uidx ON request_attachments(submission_id, field_id);
--> statement-breakpoint
CREATE TABLE request_notifications (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES organizations(id),
 submission_id uuid NOT NULL,
 user_id uuid NOT NULL,
 read_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT request_notifications_submission_tenant_fk FOREIGN KEY (submission_id, organization_id) REFERENCES request_submissions(id, organization_id),
 CONSTRAINT request_notifications_user_tenant_fk FOREIGN KEY (user_id, organization_id) REFERENCES users(id, organization_id)
);
CREATE UNIQUE INDEX request_notifications_recipient_uidx ON request_notifications(submission_id, user_id);
CREATE INDEX request_notifications_user_created_idx ON request_notifications(organization_id, user_id, created_at);
