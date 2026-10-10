-- Rollback for 20261012_txn_series. Destroys instalment-group and
-- repeat-subscription links on transactions and the subscription end fields.
DROP INDEX IF EXISTS idx_transactions_installment_group;
DROP INDEX IF EXISTS idx_transactions_subscription_id;
ALTER TABLE transactions DROP COLUMN IF EXISTS installment_group_id;
ALTER TABLE transactions DROP COLUMN IF EXISTS installment_seq;
ALTER TABLE transactions DROP COLUMN IF EXISTS subscription_id;
ALTER TABLE subscriptions DROP COLUMN IF EXISTS end_date;
ALTER TABLE subscriptions DROP COLUMN IF EXISTS remaining_count;
