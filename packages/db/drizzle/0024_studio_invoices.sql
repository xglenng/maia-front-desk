-- Additive invoice drafts. No existing payments, sales, or balances are changed.
CREATE TABLE studio_invoices (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id), artist_id uuid NOT NULL REFERENCES artists(id), created_by_user_id uuid NOT NULL REFERENCES users(id), request_id uuid NOT NULL,
 client_id uuid REFERENCES clients(id), sms_status text NOT NULL DEFAULT 'NOT_SENT' CHECK(sms_status IN ('NOT_SENT','SENDING','SENT','UNKNOWN')), sms_provider_id text,
 client_name text NOT NULL, client_email text NOT NULL, lines jsonb NOT NULL, total_cents integer NOT NULL CHECK(total_cents BETWEEN 1 AND 100000000), due_days integer NOT NULL DEFAULT 30 CHECK(due_days BETWEEN 1 AND 90), note text NOT NULL DEFAULT '',
 status text NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','ISSUING','OPEN','PAID','VOID','UNCOLLECTIBLE')),
 stripe_account_id text, stripe_invoice_id text, issuing_at timestamptz, hosted_url text,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(client_id,organization_id) REFERENCES clients(id,organization_id),
 FOREIGN KEY(artist_id,organization_id) REFERENCES artists(id,organization_id)
);
CREATE UNIQUE INDEX studio_invoices_request_idx ON studio_invoices(organization_id,request_id);
CREATE INDEX studio_invoices_artist_idx ON studio_invoices(organization_id,artist_id,created_at);
-- Rollback: disable invoice routes first. Preserve/export invoice records and remote Stripe IDs;
-- do not drop this table after any invoice has been issued or paid.
