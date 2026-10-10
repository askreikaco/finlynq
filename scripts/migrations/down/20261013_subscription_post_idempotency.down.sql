-- Rollback for 20261013_subscription_post_idempotency. Drops the per-occurrence
-- marker; already-posted rows stay but lose their idempotency key.
DROP INDEX IF EXISTS uniq_transactions_subscription_occurrence;
ALTER TABLE transactions DROP COLUMN IF EXISTS occurrence_date;
