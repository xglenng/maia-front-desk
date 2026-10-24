CREATE TABLE retail_items (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id),
 artist_id uuid NOT NULL REFERENCES artists(id),
 name text NOT NULL, category text, sku text, price_cents integer CHECK(price_cents BETWEEN 1 AND 100000000),
 tax_basis_points integer NOT NULL DEFAULT 0 CHECK(tax_basis_points BETWEEN 0 AND 10000),active boolean NOT NULL DEFAULT true,
 created_at timestamp NOT NULL DEFAULT now(),updated_at timestamp NOT NULL DEFAULT now(),
 FOREIGN KEY(artist_id,organization_id) REFERENCES artists(id,organization_id)
);
CREATE INDEX retail_items_org_idx ON retail_items(organization_id,artist_id);
CREATE TABLE checkout_sales (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id),
 artist_id uuid NOT NULL REFERENCES artists(id),created_by_user_id uuid NOT NULL REFERENCES users(id),request_id uuid NOT NULL,
 lines jsonb NOT NULL,subtotal_cents integer NOT NULL CHECK(subtotal_cents>=0),tax_cents integer NOT NULL CHECK(tax_cents>=0),
 tip_cents integer NOT NULL CHECK(tip_cents>=0),total_cents integer NOT NULL CHECK(total_cents=subtotal_cents+tax_cents+tip_cents AND total_cents BETWEEN 1 AND 100000000),
 tender text NOT NULL CHECK(tender IN ('CASH','EXTERNAL')),note text NOT NULL DEFAULT '',created_at timestamp NOT NULL DEFAULT now(),
 FOREIGN KEY(artist_id,organization_id) REFERENCES artists(id,organization_id)
);
CREATE UNIQUE INDEX checkout_sales_request_idx ON checkout_sales(organization_id,request_id);
CREATE INDEX checkout_sales_artist_idx ON checkout_sales(organization_id,artist_id);
