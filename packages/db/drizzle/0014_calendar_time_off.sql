CREATE TABLE calendar_time_off (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES organizations(id),
 artist_id uuid NOT NULL,
 starts_at timestamp NOT NULL,
 ends_at timestamp NOT NULL,
 label text NOT NULL DEFAULT 'Time off',
 created_at timestamp NOT NULL DEFAULT now(),
 CONSTRAINT calendar_time_off_artist_tenant_fk FOREIGN KEY (artist_id,organization_id) REFERENCES artists(id,organization_id),
 CONSTRAINT calendar_time_off_range_check CHECK (ends_at>starts_at)
);
--> statement-breakpoint
CREATE INDEX calendar_time_off_artist_range_idx ON calendar_time_off(organization_id,artist_id,starts_at);
