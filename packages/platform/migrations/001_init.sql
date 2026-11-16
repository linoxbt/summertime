-- Summertime application database.
-- Non-authoritative (NFR-2): the ledger is the source of truth for reservations, allocations,
-- outcomes and receipts. Everything here is profile data, indexes, logs or worker state, and
-- the projections can be rebuilt from the ledger.

CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Deployment-wide settings written by bootstrap: operator party, registry admin, instrument.
CREATE TABLE IF NOT EXISTS system_config (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  handle TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('forwarder', 'importer', 'operator')),
  contact TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Each user maps to exactly one party. mode: 'pilot' (hosted by Summertime) or 'wallet'.
CREATE TABLE IF NOT EXISTS party_links (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  party_id TEXT NOT NULL UNIQUE,
  mode TEXT NOT NULL CHECK (mode IN ('pilot', 'wallet'))
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);

-- Forwarder-entered labels for campaigns. Terms live on the ledger only.
CREATE TABLE IF NOT EXISTS campaign_index (
  campaign_id TEXT PRIMARY KEY,
  forwarder_party TEXT NOT NULL,
  title TEXT NOT NULL,
  route TEXT,
  auto_execute BOOLEAN NOT NULL DEFAULT false,
  -- Display copy of the ledger terms, kept after the campaign contract is archived.
  terms_snapshot JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS campaign_index_forwarder ON campaign_index (forwarder_party);

-- Who the forwarder invited, so progress views reach every invitee (F-6).
CREATE TABLE IF NOT EXISTS campaign_invitees (
  campaign_id TEXT NOT NULL REFERENCES campaign_index(campaign_id) ON DELETE CASCADE,
  importer_party TEXT NOT NULL,
  invitation_id TEXT NOT NULL,
  invited_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (campaign_id, importer_party)
);

-- Every command submitted, keyed by its deterministic command ID (NFR-4).
CREATE TABLE IF NOT EXISTS command_log (
  command_id TEXT PRIMARY KEY,
  party_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  subject TEXT,
  status TEXT NOT NULL CHECK (status IN ('pending', 'succeeded', 'failed')),
  update_id TEXT,
  result JSONB,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS command_log_created ON command_log (created_at);
CREATE INDEX IF NOT EXISTS command_log_subject ON command_log (kind, subject);

-- Idempotency-Key handling for mutating API calls.
CREATE TABLE IF NOT EXISTS idempotency_keys (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  status_code INT,
  response JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, key)
);

-- Worker resume points (NFR-6).
CREATE TABLE IF NOT EXISTS ledger_offsets (
  worker_id TEXT PRIMARY KEY,
  "offset" BIGINT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Operator bookkeeping for the bond it holds in custody (section 10.4).
CREATE TABLE IF NOT EXISTS bond_ledger (
  id BIGSERIAL PRIMARY KEY,
  campaign_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('received', 'paid', 'returned', 'refunded')),
  amount_micro BIGINT NOT NULL,
  holding_cids TEXT[] NOT NULL DEFAULT '{}',
  reference TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, kind, reference)
);

-- Capacity holds made for a reservation request, so a crash between hold and countersign
-- reuses the hold instead of holding twice.
CREATE TABLE IF NOT EXISTS capacity_holds (
  request_cid TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL,
  hold_cid TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
