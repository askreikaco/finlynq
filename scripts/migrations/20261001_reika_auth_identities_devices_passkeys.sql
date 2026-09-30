-- Google Sign-in identities, trusted devices, WebAuthn passkeys, and recovery codes.
-- (REIKA custom auth system, additive — schema changes allowed in fork.)
--
-- Four tables supporting multi-factor authentication and device management:
--
--   user_identities — external provider identities (Google, future: Apple/GitHub)
--   user_devices — trusted device registration + secret rotation
--   user_passkeys — WebAuthn registration for FIDO2/Windows Hello/Touch ID
--   user_recovery_codes — backup single-use recovery codes for account recovery
--
-- All four tables carry ON DELETE CASCADE to users (account deletion removes all).
-- On password reset (via `wipeUserDataAndRewrap` in src/lib/auth/queries.ts):
-- identities, passkeys, and recovery codes survive; devices are deleted (session rotation);
-- passkey PRF wraps are NULLed (cannot unlock with old DEK after wipe).
--
-- The runner in deploy.sh wraps the file in a transaction with the
-- schema_migrations bookkeeping insert — do NOT add a BEGIN/COMMIT here.

CREATE TABLE IF NOT EXISTS user_identities (
  id serial PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider text NOT NULL,
  provider_subject text NOT NULL,
  email text,
  email_verified integer NOT NULL DEFAULT 0,
  created_at text NOT NULL,
  last_login_at text,
  CONSTRAINT user_identities_provider_check CHECK (provider IN ('google'))
);
CREATE UNIQUE INDEX IF NOT EXISTS user_identities_provider_subject_unique ON user_identities(provider, provider_subject);
CREATE INDEX IF NOT EXISTS idx_user_identities_user_id ON user_identities(user_id);

CREATE TABLE IF NOT EXISTS user_devices (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  secret_hash text NOT NULL,
  dek_wrapped text NOT NULL,
  label text,
  created_at text NOT NULL,
  last_used_at text,
  expires_at text NOT NULL,
  revoked_at text
);
CREATE UNIQUE INDEX IF NOT EXISTS user_devices_secret_hash_unique ON user_devices(secret_hash);
CREATE INDEX IF NOT EXISTS idx_user_devices_user_id ON user_devices(user_id);

CREATE TABLE IF NOT EXISTS user_passkeys (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  public_key text NOT NULL,
  counter bigint NOT NULL DEFAULT 0,
  transports text,
  aaguid text,
  backed_up integer NOT NULL DEFAULT 0,
  label text,
  prf_supported integer NOT NULL DEFAULT 0,
  dek_wrapped_prf text,
  created_at text NOT NULL,
  last_used_at text
);
CREATE INDEX IF NOT EXISTS idx_user_passkeys_user_id ON user_passkeys(user_id);

CREATE TABLE IF NOT EXISTS user_recovery_codes (
  id serial PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash text NOT NULL,
  used_at text,
  created_at text NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS user_recovery_codes_hash_unique ON user_recovery_codes(code_hash);
CREATE INDEX IF NOT EXISTS idx_user_recovery_codes_user_id ON user_recovery_codes(user_id);
