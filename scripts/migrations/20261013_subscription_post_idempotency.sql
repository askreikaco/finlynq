-- Repeat + Installment phase 2a: idempotent "Post now".
--
-- transactions.occurrence_date : the subscription occurrence (YYYY-MM-DD, the
--   subscription's next_date at post time) a row was posted for. Set ONLY by
--   POST /api/transactions { subscriptionId, occurrenceDate }; the first row
--   booked together with a Repeat leaves it NULL.
-- The partial UNIQUE index makes a double tap / retry / two devices post the
--   same occurrence once: the second insert raises 23505, mapped to 409
--   already_posted.

ALTER TABLE transactions ADD COLUMN IF NOT EXISTS occurrence_date text;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_transactions_subscription_occurrence ON transactions (user_id, subscription_id, occurrence_date) WHERE subscription_id IS NOT NULL AND occurrence_date IS NOT NULL;
