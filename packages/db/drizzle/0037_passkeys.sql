CREATE TABLE auth_passkeys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  credential_id text NOT NULL UNIQUE,
  public_key bytea NOT NULL,
  counter bigint NOT NULL CHECK (counter >= 0),
  device_type text NOT NULL CHECK (device_type IN ('singleDevice', 'multiDevice')),
  backed_up boolean NOT NULL,
  transports jsonb NOT NULL DEFAULT '[]'::jsonb,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz
);
--> statement-breakpoint
CREATE INDEX auth_passkeys_user_idx ON auth_passkeys(user_id);
--> statement-breakpoint
CREATE UNIQUE INDEX auth_sessions_token_user_uidx ON auth_sessions(token_hash, user_id);
--> statement-breakpoint
CREATE TABLE auth_passkey_challenges (
  browser_hash text PRIMARY KEY,
  operation text NOT NULL,
  challenge text NOT NULL,
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  session_hash text,
  expires_at timestamptz NOT NULL,
  CONSTRAINT auth_passkey_challenges_session_owner_fk FOREIGN KEY (session_hash, user_id)
    REFERENCES auth_sessions(token_hash, user_id) ON DELETE CASCADE,
  CONSTRAINT auth_passkey_challenges_operation_check CHECK (
    (operation = 'registration' AND user_id IS NOT NULL AND session_hash IS NOT NULL) OR
    (operation = 'authentication' AND user_id IS NULL AND session_hash IS NULL)
  )
);
--> statement-breakpoint
CREATE INDEX auth_passkey_challenges_expiry_idx ON auth_passkey_challenges(expires_at);
