ALTER TABLE "studio_invoices" ADD COLUMN "email_status" text DEFAULT 'NOT_SENT' NOT NULL;
ALTER TABLE "studio_invoices" ADD COLUMN "email_provider_id" text;
ALTER TABLE "studio_invoices" ADD CONSTRAINT "studio_invoice_email_status_check" CHECK ("email_status" IN ('NOT_SENT','SENDING','SENT','UNKNOWN'));
