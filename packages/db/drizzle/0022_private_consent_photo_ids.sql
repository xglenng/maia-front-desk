-- Add private identity attachments without changing existing forms or submissions.
CREATE UNIQUE INDEX waiver_submissions_id_organization_uidx ON waiver_submissions(id, organization_id);
CREATE TABLE waiver_identity_documents (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES organizations(id),
 assignment_id uuid NOT NULL,
 submission_id uuid NOT NULL,
 field_id text NOT NULL,
 content_type text NOT NULL,
 byte_length integer NOT NULL,
 sha256 text NOT NULL,
 encrypted_image text NOT NULL,
 created_at timestamp with time zone NOT NULL DEFAULT now(),
 CONSTRAINT waiver_identity_documents_assignment_tenant_fk FOREIGN KEY(assignment_id,organization_id) REFERENCES external_waiver_assignments(id,organization_id),
 CONSTRAINT waiver_identity_documents_submission_tenant_fk FOREIGN KEY(submission_id,organization_id) REFERENCES waiver_submissions(id,organization_id),
 CONSTRAINT waiver_identity_documents_size_check CHECK(byte_length > 0 AND byte_length <= 2097152),
 CONSTRAINT waiver_identity_documents_type_check CHECK(content_type = 'image/jpeg'),
 CONSTRAINT waiver_identity_documents_hash_check CHECK(sha256 ~ '^[a-f0-9]{64}$')
);
CREATE UNIQUE INDEX waiver_identity_documents_assignment_uidx ON waiver_identity_documents(assignment_id);
