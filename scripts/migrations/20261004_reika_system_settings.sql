-- system_settings: admin-editable server settings (email transport first).
-- value_ct is ALWAYS ciphertext (ss1: envelope, src/lib/crypto/system-settings-envelope.ts).
-- Additive + idempotent. Not part of the baseline ledger.

CREATE TABLE IF NOT EXISTS system_settings (
  key        TEXT PRIMARY KEY,
  value_ct   TEXT NOT NULL,
  updated_by TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
