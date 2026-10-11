-- Repeat sheet simplification: custom "every N days" cadence.
--
-- subscriptions.interval_days : step in days (1..365) for frequency = 'every_n_days'.
--   NULL for every other frequency (all existing rows). The schedule engine
--   (src/lib/subscriptions/schedule.ts) treats every_n_days as a daily-style
--   cadence with this step, indexed from anchor_date. Purely additive.

ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS interval_days integer;
