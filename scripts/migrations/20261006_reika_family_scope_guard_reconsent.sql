-- Family Wealth P4: must-share-back re-consent (plan 7.4).
-- When the parent's owner widens the share, required_back_sections is raised and the reciprocal
-- (child) share stays live but no longer covers it until its owner re-consents. The P1 guard fired
-- on EVERY update of the child row, so the child's owner could not revoke it (and the parent's
-- owner could not even stamp last_viewed_at) while a re-consent was pending.
-- The guard now fires on INSERT and on any UPDATE that changes the child's sections; every other
-- update (status change, last_viewed_at, key reset) is allowed. Idempotent.
CREATE OR REPLACE FUNCTION family_shares_min_scope_guard_fn()
RETURNS TRIGGER AS $$
DECLARE
  parent_required TEXT[];
  parent_status TEXT;
BEGIN
  IF NEW.reciprocal_of IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.sections IS DISTINCT FROM OLD.sections) THEN
    SELECT required_back_sections, status INTO parent_required, parent_status
    FROM family_shares WHERE id = NEW.reciprocal_of;

    IF parent_status IN ('active', 'awaiting_owner_unlock') THEN
      IF NOT (NEW.sections @> COALESCE(parent_required, '{}'::TEXT[])) THEN
        RAISE EXCEPTION 'reciprocal share sections must include required_back_sections'
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS family_shares_min_scope_guard ON family_shares;
CREATE TRIGGER family_shares_min_scope_guard
BEFORE INSERT OR UPDATE ON family_shares
FOR EACH ROW EXECUTE FUNCTION family_shares_min_scope_guard_fn();
