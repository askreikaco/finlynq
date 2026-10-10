-- Local-first outbox: server-side idempotency for transaction creates.
--
-- transactions.idempotency_key : the client's `Idempotency-Key` header (the
--   outbox opId) of the POST /api/transactions that created the row. NULL for
--   every row created without the header (UI, import, MCP, ...).
-- The partial UNIQUE index makes a retried POST (response lost) resolve to the
--   existing row instead of inserting a second one: the route looks the key up
--   first and, on a concurrent-insert race (23505), re-selects it.

ALTER TABLE transactions ADD COLUMN IF NOT EXISTS idempotency_key text;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_transactions_idempotency_key ON transactions (user_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
