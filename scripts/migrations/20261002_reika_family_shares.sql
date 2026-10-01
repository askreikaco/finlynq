-- Family Wealth sharing — shares table (P1, 2026-10-01).
--
-- Tracks outgoing shares from an owner to viewers. Each row represents
-- one sharing relationship (owner -> viewer) with a status lifecycle:
-- pending (awaiting owner unlock/approval), awaiting_owner_unlock (owner action required),
-- active (viewer has access), suspended (viewer left, can be reactivated),
-- revoked (owner/viewer terminated), declined (viewer declined), expired (invite expired),
-- key_reset (owner reset keys, labels generic until re-swept).
--
-- Reciprocal shares (must_share_back flow) link via reciprocal_of UUID.
-- Sections array holds the names of shared data sections.
-- Net worth totals imply unshared sections (disclosed in share dialog).
--
-- Idempotent. Wraps via schema_migrations bookkeeping.

CREATE TABLE IF NOT EXISTS family_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id TEXT NOT NULL,
  viewer_id TEXT,
  viewer_email_lower TEXT NOT NULL,
  sections TEXT[] NOT NULL,
  all_sections BOOLEAN NOT NULL DEFAULT false,
  must_share_back BOOLEAN NOT NULL DEFAULT false,
  required_back_sections TEXT[] NOT NULL DEFAULT '{}',
  reciprocal_of UUID REFERENCES family_shares(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','awaiting_owner_unlock','active','suspended','revoked','declined','expired','key_reset')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  accepted_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  revoked_by TEXT,
  last_viewed_at TIMESTAMPTZ,
  CONSTRAINT owner_not_viewer CHECK (owner_id <> viewer_id),
  CONSTRAINT sections_not_empty CHECK (cardinality(sections) > 0 OR all_sections),
  FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (viewer_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS family_shares_owner_viewer_live_uniq ON family_shares(owner_id, viewer_id) WHERE status IN ('active','awaiting_owner_unlock','pending');
CREATE INDEX IF NOT EXISTS family_shares_owner_idx ON family_shares(owner_id);
CREATE INDEX IF NOT EXISTS family_shares_viewer_idx ON family_shares(viewer_id);
CREATE INDEX IF NOT EXISTS family_shares_status_idx ON family_shares(status);

-- Min-section scope guard: reciprocal share must satisfy the required sections.
-- SQL trigger ensures: if this share is a reciprocal of an active parent,
-- this share's sections must contain all required_back_sections from parent.
CREATE OR REPLACE FUNCTION family_shares_min_scope_guard_fn()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.reciprocal_of IS NOT NULL THEN
    DECLARE
      parent_required TEXT[];
      parent_status TEXT;
    BEGIN
      SELECT required_back_sections, status INTO parent_required, parent_status
      FROM family_shares WHERE id = NEW.reciprocal_of;

      IF parent_status IN ('active', 'awaiting_owner_unlock') THEN
        IF NOT (NEW.sections @> COALESCE(parent_required, '{}'::TEXT[])) THEN
          RAISE EXCEPTION 'reciprocal share sections must include required_back_sections'
            USING ERRCODE = 'check_violation';
        END IF;
      END IF;
    END;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS family_shares_min_scope_guard ON family_shares;
CREATE TRIGGER family_shares_min_scope_guard
BEFORE INSERT OR UPDATE ON family_shares
FOR EACH ROW EXECUTE FUNCTION family_shares_min_scope_guard_fn();
