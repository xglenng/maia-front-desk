CREATE TABLE studio_payment_accounts (
 organization_id uuid PRIMARY KEY REFERENCES organizations(id),
 stripe_account_id text NOT NULL UNIQUE,
 charges_enabled boolean NOT NULL DEFAULT false,
 payouts_enabled boolean NOT NULL DEFAULT false,
 details_submitted boolean NOT NULL DEFAULT false,
 updated_at timestamp NOT NULL DEFAULT now()
);

--> statement-breakpoint
ALTER TABLE payments ADD COLUMN stripe_account_id text;
--> statement-breakpoint
ALTER TABLE payments ADD COLUMN checkout_url text;
--> statement-breakpoint
ALTER TABLE payments ADD COLUMN purpose text NOT NULL DEFAULT 'DEPOSIT';
