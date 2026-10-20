CREATE TABLE "staff_invitations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "artist_id" uuid NOT NULL,
  "invited_by_user_id" uuid NOT NULL,
  "email" text NOT NULL,
  "token_hash" text NOT NULL UNIQUE,
  "expires_at" timestamp with time zone NOT NULL,
  "accepted_at" timestamp with time zone,
  "revoked_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "staff_invitations_artist_tenant_fk" FOREIGN KEY ("artist_id", "organization_id") REFERENCES "artists"("id", "organization_id"),
  CONSTRAINT "staff_invitations_inviter_tenant_fk" FOREIGN KEY ("invited_by_user_id", "organization_id") REFERENCES "users"("id", "organization_id")
);
CREATE INDEX "staff_invitations_artist_idx" ON "staff_invitations" ("organization_id", "artist_id");
