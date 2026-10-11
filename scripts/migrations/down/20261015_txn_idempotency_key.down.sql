-- Rollback for 20261015_txn_idempotency_key. Rows stay; they lose their idempotency key.
DROP INDEX IF EXISTS uniq_transactions_idempotency_key;
ALTER TABLE transactions DROP COLUMN IF EXISTS idempotency_key;
