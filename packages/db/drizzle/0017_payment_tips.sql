ALTER TABLE payments ADD COLUMN tip_cents integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE payments ADD CONSTRAINT payments_tip_amount_check CHECK (tip_cents >= 0 AND tip_cents <= amount_cents);
