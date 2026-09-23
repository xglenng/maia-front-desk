CREATE TABLE IF NOT EXISTS auth_credentials (
 user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 password_hash text NOT NULL,
 active boolean NOT NULL DEFAULT true
);
CREATE TABLE IF NOT EXISTS auth_sessions (
 token_hash text PRIMARY KEY,
 user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS auth_sessions_user ON auth_sessions(user_id);
CREATE TABLE IF NOT EXISTS auth_oauth_states (
 token_hash text PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id),
 organization_id uuid NOT NULL REFERENCES organizations(id), artist_id uuid NOT NULL REFERENCES artists(id), expires_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS auth_login_attempts (
 key text PRIMARY KEY,
 attempts integer NOT NULL DEFAULT 0,
 reset_at timestamptz NOT NULL
);
