-- Requires PostgreSQL 13+ for the built-in gen_random_uuid() function.

CREATE TABLE IF NOT EXISTS number_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clerk_user_id text NOT NULL,
  number text NOT NULL,
  number_key text NOT NULL,
  service text NOT NULL,
  country text,
  flag text,
  network text,
  assigned_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  released_at timestamptz,
  end_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS number_sessions_user_created_idx
  ON number_sessions (clerk_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS number_sessions_number_key_idx
  ON number_sessions (number_key);

-- A provider phone number is globally leased to at most one YoriOTP user at a time.
CREATE TABLE IF NOT EXISTS active_number_leases (
  number_key text PRIMARY KEY,
  session_id uuid NOT NULL UNIQUE REFERENCES number_sessions(id) ON DELETE CASCADE,
  clerk_user_id text NOT NULL,
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS active_number_leases_user_expires_idx
  ON active_number_leases (clerk_user_id, expires_at);

CREATE TABLE IF NOT EXISTS mailboxes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clerk_user_id text NOT NULL,
  email text NOT NULL,
  email_key text NOT NULL,
  domain text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS mailboxes_user_created_idx
  ON mailboxes (clerk_user_id, created_at DESC);

-- The provider exposes no mailbox release endpoint, so ownership records are retained.
CREATE TABLE IF NOT EXISTS mailbox_ownership (
  email_key text PRIMARY KEY,
  provider_email text NOT NULL,
  mailbox_id uuid NOT NULL UNIQUE REFERENCES mailboxes(id) ON DELETE CASCADE,
  clerk_user_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS mailbox_ownership_user_idx
  ON mailbox_ownership (clerk_user_id);

-- Fixed-window, database-backed rate limits work across server instances.
CREATE TABLE IF NOT EXISTS app_rate_limits (
  bucket text PRIMARY KEY,
  window_start timestamptz NOT NULL,
  request_count integer NOT NULL CHECK (request_count >= 0)
);
