-- Family Wealth invites — email invitations for share acceptance (P1, 2026-10-01).
--
-- Email invitations are sent to an email address; single-use tokens are hashed
-- (domain-separated as 'family-invite|') and tracked here. Acceptance requires
-- the viewer to be logged in with a verified email matching viewer_email_lower.
-- Invite expires after 7 days. `send_count` and `last_sent_at` support re-sends.
--
-- Idempotent. Wraps via schema_migrations bookkeeping.

CREATE TABLE IF NOT EXISTS family_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  share_id UUID NOT NULL,
  email_lower TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  send_count INTEGER NOT NULL DEFAULT 1,
  last_sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (share_id) REFERENCES family_shares(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS family_invites_share_idx ON family_invites(share_id);
CREATE INDEX IF NOT EXISTS family_invites_email_lower_idx ON family_invites(email_lower);
CREATE INDEX IF NOT EXISTS family_invites_expires_at_idx ON family_invites(expires_at);
