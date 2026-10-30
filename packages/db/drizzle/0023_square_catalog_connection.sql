-- Add catalog-only Square connections. Existing scheduling credentials and providers are untouched.
CREATE TABLE square_catalog_connections (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES organizations(id),
 artist_id uuid NOT NULL,
 merchant_id text NOT NULL,
 access_token_encrypted text NOT NULL,
 refresh_token_encrypted text NOT NULL,
 expires_at timestamptz NOT NULL,
 status text NOT NULL DEFAULT 'CONNECTED',
 updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT square_catalog_connections_artist_tenant_fk FOREIGN KEY(artist_id,organization_id) REFERENCES artists(id,organization_id)
);
CREATE UNIQUE INDEX square_catalog_connections_artist_uidx ON square_catalog_connections(organization_id,artist_id);
CREATE TABLE square_catalog_oauth_states (
 token_hash text PRIMARY KEY,
 user_id uuid NOT NULL,
 organization_id uuid NOT NULL REFERENCES organizations(id),
 artist_id uuid NOT NULL,
 expires_at timestamptz NOT NULL,
 CONSTRAINT square_catalog_oauth_states_user_tenant_fk FOREIGN KEY(user_id,organization_id) REFERENCES users(id,organization_id),
 CONSTRAINT square_catalog_oauth_states_artist_tenant_fk FOREIGN KEY(artist_id,organization_id) REFERENCES artists(id,organization_id)
);
