-- Recovery code DEK wraps, session cutoff, passkey PRF salt version, and security events.
-- (REIKA custom auth system — B1 recovery primitives.)
--
-- Changes to existing tables:
--   user_recovery_codes: add dek_wrapped column to store recovery-code-wrapped DEK copies
--   users: add session_not_before to implement per-user session cutoff
--   user_passkeys: add prf_salt_version for future PRF salt rotation
--
-- New table:
--   user_security_events: audit log of auth events (recovery, passkey, password changes, etc.)
--     Exempt from data-wipe coverage test (audit survives account clear).
--
-- On wipe (deleteAllUserDataTx):
--   DELETE user_devices (session rotation)
--   UPDATE user_passkeys SET dek_wrapped_prf=NULL (PRF binds to old DEK)
--   UPDATE user_recovery_codes SET dek_wrapped=NULL,used_at=now() WHERE used_at IS NULL
--
-- The runner in deploy.sh wraps the file in a transaction — do NOT add BEGIN/COMMIT.

ALTER TABLE user_recovery_codes
  ADD COLUMN IF NOT EXISTS dek_wrapped text;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS session_not_before text;

ALTER TABLE user_passkeys
  ADD COLUMN IF NOT EXISTS prf_salt_version integer NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS user_security_events (
  id bigserial PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event text NOT NULL,
  method text,
  ip text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_user_security_events_user_id_created ON user_security_events(user_id, created_at DESC);
