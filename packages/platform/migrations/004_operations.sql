-- Operational checks and alerts (spec 19.3, 28). Written by the worker, read by operators.
CREATE TABLE IF NOT EXISTS ops_checks (
  name TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK (status IN ('ok', 'warn', 'alert')),
  summary TEXT NOT NULL,
  detail JSONB NOT NULL DEFAULT '{}',
  checked_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One row per alert episode: raised when a check leaves 'ok', resolved when it returns.
CREATE TABLE IF NOT EXISTS ops_alerts (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('warn', 'alert')),
  summary TEXT NOT NULL,
  raised_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS ops_alerts_open ON ops_alerts (name) WHERE resolved_at IS NULL;

-- Worker heartbeat, for lag and liveness.
ALTER TABLE ledger_offsets ADD COLUMN IF NOT EXISTS last_pass_at TIMESTAMPTZ;
