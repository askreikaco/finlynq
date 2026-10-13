-- Offline write queue (local-first L3): server idempotency for non-transaction POSTs (budgets now; goals, rules,
-- accounts, categories later through src/lib/idempotency.ts withIdempotency).
--
-- request_idempotency (user_id, idempotency_key) : the primary key is the lock. The first request claims the row
--   (response_status = 0, "in progress"), runs, then stores status + JSON body. A retry with the same key replays it.
--   Keys are per user. Rows expire after 72h (lazy delete on claim, daily sweep).
-- Transactions keep their own key on transactions.idempotency_key and do not use this table.

CREATE TABLE IF NOT EXISTS request_idempotency (
  user_id text NOT NULL,
  idempotency_key text NOT NULL,
  entity text NOT NULL,
  response_status integer NOT NULL,
  response_body jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS request_idempotency_created_at_idx ON request_idempotency (created_at);
