-- Repeat + Installment phase 1 (R1): series columns on transactions + end
-- conditions on subscriptions.
--
-- transactions.installment_group_id : server-generated uuid (text) shared by
--   every row of one instalment plan; NEVER accepted from a client.
-- transactions.installment_seq      : 1..N position inside the group.
-- transactions.subscription_id      : the subscription a "Repeat" row belongs to.
--   ON DELETE SET NULL - deleting a subscription never deletes history.
-- subscriptions.end_date            : last date (YYYY-MM-DD) a repeat may fall on.
-- subscriptions.remaining_count     : occurrences still to come, counting next_date.
-- No data_version trigger changes: both tables are already covered.
-- Not link_id (transfer pairs) and not trade_link_id (multi-currency trades).

ALTER TABLE transactions ADD COLUMN IF NOT EXISTS installment_group_id text;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS installment_seq smallint;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS subscription_id integer REFERENCES subscriptions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_installment_group ON transactions (installment_group_id) WHERE installment_group_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_transactions_subscription_id ON transactions (subscription_id) WHERE subscription_id IS NOT NULL;

ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS end_date text;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS remaining_count integer;
