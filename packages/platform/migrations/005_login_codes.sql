-- Email one-time-code sign-in (spec: production replaces demo sign-in with one-time codes).
ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT;
-- Demo accounts get a deterministic, clearly fictional address.
UPDATE users SET email = handle || '@summertime.demo' WHERE email IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS users_email_key ON users (lower(email));

-- Codes are stored only as a keyed hash; each allows a few attempts and expires quickly.
CREATE TABLE IF NOT EXISTS login_codes (
  id BIGSERIAL PRIMARY KEY,
  email TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  attempts INT NOT NULL DEFAULT 0,
  consumed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS login_codes_email_recent ON login_codes (lower(email), created_at DESC);
