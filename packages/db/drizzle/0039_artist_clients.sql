-- Additive only. Existing relationships are queried from appointments,
-- conversations and invoices; no ambiguous studio-wide clients are backfilled.
CREATE TABLE artist_clients (
 organization_id uuid NOT NULL REFERENCES organizations(id),
 artist_id uuid NOT NULL,
 client_id uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT artist_clients_artist_tenant_fk FOREIGN KEY (artist_id,organization_id) REFERENCES artists(id,organization_id),
 CONSTRAINT artist_clients_client_tenant_fk FOREIGN KEY (client_id,organization_id) REFERENCES clients(id,organization_id)
);
CREATE UNIQUE INDEX artist_clients_artist_client_uidx ON artist_clients(artist_id,client_id);
