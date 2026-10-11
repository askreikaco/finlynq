-- Rollback for 20261016_subscription_interval_days. Drops the stored interval;
-- any every_n_days rows would then step 1 day, so convert them first if present.
ALTER TABLE subscriptions DROP COLUMN IF EXISTS interval_days;
