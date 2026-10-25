ALTER TABLE studio_payment_accounts ADD COLUMN livemode boolean NOT NULL DEFAULT false;
ALTER TABLE checkout_sales DROP CONSTRAINT checkout_sales_tender_check;
ALTER TABLE checkout_sales ADD CONSTRAINT checkout_sales_tender_check CHECK(tender IN ('CASH','EXTERNAL','CARD'));
CREATE TABLE checkout_card_attempts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL REFERENCES organizations(id),
 artist_id uuid NOT NULL REFERENCES artists(id),created_by_user_id uuid NOT NULL REFERENCES users(id),
 request_id uuid NOT NULL,cart_hash text NOT NULL,stripe_account_id text NOT NULL,livemode boolean NOT NULL,
 session_id text,payment_intent_id text,lines jsonb NOT NULL,
 subtotal_cents integer NOT NULL,tax_cents integer NOT NULL,tip_cents integer NOT NULL,total_cents integer NOT NULL,
 note text NOT NULL DEFAULT '',status text NOT NULL DEFAULT 'PENDING',
 created_at timestamp with time zone NOT NULL DEFAULT now(),updated_at timestamp with time zone NOT NULL DEFAULT now(),
 FOREIGN KEY(artist_id,organization_id) REFERENCES artists(id,organization_id),
 CONSTRAINT checkout_card_status_check CHECK(status IN ('PENDING','PAID','EXPIRED')),
 CONSTRAINT checkout_card_amount_check CHECK(subtotal_cents>=0 AND tax_cents>=0 AND tip_cents>=0 AND total_cents=subtotal_cents+tax_cents+tip_cents AND total_cents BETWEEN 1 AND 100000000)
);
CREATE UNIQUE INDEX checkout_card_request_idx ON checkout_card_attempts(organization_id,request_id);
CREATE UNIQUE INDEX checkout_card_session_idx ON checkout_card_attempts(session_id);
