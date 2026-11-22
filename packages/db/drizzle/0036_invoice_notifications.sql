CREATE UNIQUE INDEX studio_invoices_id_organization_uidx ON studio_invoices(id, organization_id);
--> statement-breakpoint
CREATE TABLE invoice_notifications (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES organizations(id),
 invoice_id uuid NOT NULL,
 user_id uuid NOT NULL,
 read_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT invoice_notifications_invoice_tenant_fk FOREIGN KEY (invoice_id, organization_id) REFERENCES studio_invoices(id, organization_id),
 CONSTRAINT invoice_notifications_user_tenant_fk FOREIGN KEY (user_id, organization_id) REFERENCES users(id, organization_id)
);
CREATE UNIQUE INDEX invoice_notifications_recipient_uidx ON invoice_notifications(invoice_id, user_id);
CREATE INDEX invoice_notifications_user_created_idx ON invoice_notifications(organization_id, user_id, created_at);
