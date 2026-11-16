-- Dispute evidence stays off-ledger (spec F-10); the ledger records only its SHA-256 hash.
-- Readable only by the dispute's two parties (checked against their ledger view).
CREATE TABLE IF NOT EXISTS dispute_evidence (
  evidence_hash TEXT PRIMARY KEY,
  importer_party TEXT NOT NULL,
  campaign_id TEXT NOT NULL,
  details TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
