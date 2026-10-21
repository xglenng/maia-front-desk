ALTER TABLE payments ADD COLUMN refunded_cents integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE payments ADD COLUMN provider_refund_id text;
--> statement-breakpoint
ALTER TABLE payments ADD COLUMN refund_requested_by_user_id uuid REFERENCES users(id);
--> statement-breakpoint
ALTER TABLE payments ADD COLUMN refund_requested_at timestamp with time zone;
--> statement-breakpoint
UPDATE payments SET refunded_cents=amount_cents WHERE status='REFUNDED';
--> statement-breakpoint
ALTER TABLE payments ADD CONSTRAINT payments_refund_amount_check CHECK (refunded_cents >= 0 AND refunded_cents <= amount_cents);
--> statement-breakpoint
ALTER TABLE payments ADD CONSTRAINT payments_refund_user_tenant_fk FOREIGN KEY (refund_requested_by_user_id,organization_id) REFERENCES users(id,organization_id);
