-- Sign-in through Privy: each account can be linked to one Privy user (its DID).
ALTER TABLE users ADD COLUMN IF NOT EXISTS privy_did TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS users_privy_did_key ON users (privy_did) WHERE privy_did IS NOT NULL;
