-- Who sent or received each bond movement, so refunds and returns go to the right party.
ALTER TABLE bond_ledger ADD COLUMN IF NOT EXISTS counterparty TEXT;
ALTER TABLE bond_ledger DROP CONSTRAINT IF EXISTS bond_ledger_kind_check;
ALTER TABLE bond_ledger ADD CONSTRAINT bond_ledger_kind_check CHECK (kind IN ('received', 'escrowed', 'paid', 'returned', 'refunded'));
