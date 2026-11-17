-- Real accounts sign in with email and password; demo accounts are kept apart.
ALTER TABLE users ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'member';
DO $$ BEGIN
  ALTER TABLE users ADD CONSTRAINT users_kind_check CHECK (kind IN ('demo', 'member'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
UPDATE users SET kind = 'demo' WHERE email LIKE '%@summertime.demo';
-- scrypt$N$r$p$salt$hash (base64url); NULL for demo accounts, which cannot use password sign-in.
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ;

-- One-time codes now serve password reset only.
ALTER TABLE login_codes ADD COLUMN IF NOT EXISTS purpose TEXT NOT NULL DEFAULT 'reset';

-- Sign-in attempts, for rate limiting by email and by client address.
CREATE TABLE IF NOT EXISTS auth_attempts (
  id BIGSERIAL PRIMARY KEY,
  email TEXT NOT NULL,
  ip TEXT NOT NULL,
  ok BOOLEAN NOT NULL,
  at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS auth_attempts_email_recent ON auth_attempts (lower(email), at DESC);
CREATE INDEX IF NOT EXISTS auth_attempts_ip_recent ON auth_attempts (ip, at DESC);

-- Development mail sink: when no email provider is configured outside production, messages
-- are written here (and to the log) instead of being sent.
CREATE TABLE IF NOT EXISTS mail_outbox (
  id BIGSERIAL PRIMARY KEY,
  to_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
