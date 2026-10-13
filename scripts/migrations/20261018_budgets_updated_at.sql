-- Offline write queue (local-first L3): budgets.updated_at is the server clock for per-field conflict resolution of
-- queued budget edits and the "row changed since" baseline of queued budget deletes. Bumped by upsertBudget (queries.ts).
-- Existing rows get now() at migration time: a queued change made against them uses that as its baseline.

ALTER TABLE budgets ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
