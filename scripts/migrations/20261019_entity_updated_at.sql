-- Offline write queue (local-first L3): server clock (updated_at) for per-field conflict resolution of queued edits
-- of goals, accounts and categories. Bumped by their PUT handlers. transaction_rules already has updated_at.
-- Existing rows get now() at migration time: a queued change made against them uses that as its baseline.

ALTER TABLE goals ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE categories ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
