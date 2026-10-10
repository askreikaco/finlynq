-- Repeat + Installment phase 2b: month-end anchor for subscription schedules.
--
-- subscriptions.anchor_date : the date a series STARTED on (YYYY-MM-DD), e.g.
--   Jan 31 for a monthly bill that is currently due Feb 28. next_date is the
--   occurrence due next; advancing/skipping/posting/self-healing computes the
--   following occurrence from the anchor by index (Jan 31 -> Feb 28 -> Mar 31 ->
--   Apr 30) instead of from next_date (which would continue Mar 28 forever).
--   NULL = no anchor known; readers fall back to next_date (the old behaviour).
-- Best-effort backfill: next_date is the best anchor available for existing
--   rows (a row already stuck on the 28th stays on the 28th).

ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS anchor_date text;

UPDATE subscriptions SET anchor_date = next_date WHERE anchor_date IS NULL AND next_date IS NOT NULL;
