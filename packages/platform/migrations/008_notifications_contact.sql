-- Notifications (spec section 22, NOTIFICATIONS): one row per event a user should hear about.
-- payload_ref names the ledger record the event is about (one the recipient can see) and makes
-- the row idempotent; title and body only ever describe the recipient's own data (NFR-9).
CREATE TABLE IF NOT EXISTS notifications (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  payload_ref TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  link TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  read_at TIMESTAMPTZ,
  -- Email delivery: sent_at when sent; attempts counts failures (given up after 3).
  sent_at TIMESTAMPTZ,
  email_attempts INT NOT NULL DEFAULT 0,
  UNIQUE (user_id, payload_ref)
);
CREATE INDEX IF NOT EXISTS notifications_user_recent ON notifications (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS notifications_unsent ON notifications (created_at) WHERE sent_at IS NULL;

-- Email preference, and self-service account deletion (the row stays, scrubbed, so ledger
-- history that names the party still resolves).
ALTER TABLE users ADD COLUMN IF NOT EXISTS notify_email BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Messages from the public Contact page, read by the operator.
CREATE TABLE IF NOT EXISTS contact_messages (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  company TEXT,
  topic TEXT NOT NULL,
  message TEXT NOT NULL,
  ip TEXT,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  handled_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS contact_messages_recent ON contact_messages (created_at DESC);
CREATE INDEX IF NOT EXISTS contact_messages_ip_recent ON contact_messages (ip, created_at DESC);
