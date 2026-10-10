-- Rollback for 20261014_subscription_anchor_date. Drops the stored anchors;
-- schedules fall back to next_date-based stepping.
ALTER TABLE subscriptions DROP COLUMN IF EXISTS anchor_date;
