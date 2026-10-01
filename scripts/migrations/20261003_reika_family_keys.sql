-- Family Wealth key infrastructure — keypairs, section keys, grants, and labels (P1, 2026-10-01).
--
-- user_keypairs: Per-user X25519 keypair for ECIES. Private key is wrapped
--   by the user's DEK (AES-GCM with AAD "family-priv|"+user_id). Created lazily
--   at first login if the user has outgoing/incoming shares.
--
-- family_section_keys: Per-owner, per-section, per-epoch encryption keys.
--   Key is wrapped by the owner's DEK. Epoch is incremented on rotation
--   (key_grants rotation trigger). Uniqueness is (owner_id, section, epoch).
--
-- family_key_grants: Per-share, per-section key grant. key_sealed holds the
--   section key sealed to the viewer via ECIES (AAD = shareId|ownerId|viewerId|section|epoch).
--   viewer_wrapped (optional optimization) = key re-wrapped under viewer's DEK.
--   status tracks readiness: 'ready' (can be unsealed) or 'awaiting_keys' (finalized
--   when the owner next logs in after the viewer accepts).
--   Unique (share_id, section); cascade deletes from family_shares.
--
-- family_labels: Sidecar for encrypted account/category/goal/loan/holding/budget names.
--   Label is encrypted under K_section (AAD = owner|section|type|id|epoch).
--   src_hash = HMAC(K_section, source_name_ct) for skip-on-unchanged optimization.
--   Unique (owner_id, section, entity_type, entity_id); deletes when source entity is deleted.
--
-- Idempotent. Wraps via schema_migrations bookkeeping.

CREATE TABLE IF NOT EXISTS user_keypairs (
  user_id TEXT PRIMARY KEY,
  x25519_pub TEXT NOT NULL,
  priv_wrapped TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS family_section_keys (
  owner_id TEXT NOT NULL,
  section TEXT NOT NULL,
  epoch INTEGER NOT NULL DEFAULT 1,
  key_wrapped TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (owner_id, section, epoch),
  FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS family_section_keys_owner_idx ON family_section_keys(owner_id);

CREATE TABLE IF NOT EXISTS family_key_grants (
  share_id UUID NOT NULL,
  section TEXT NOT NULL,
  epoch INTEGER NOT NULL DEFAULT 1,
  key_sealed TEXT,
  viewer_wrapped TEXT,
  status TEXT NOT NULL DEFAULT 'ready'
    CHECK (status IN ('ready','awaiting_keys')),
  PRIMARY KEY (share_id, section),
  FOREIGN KEY (share_id) REFERENCES family_shares(id) ON DELETE CASCADE,
  FOREIGN KEY (viewer_wrapped) REFERENCES family_section_keys(owner_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS family_key_grants_share_idx ON family_key_grants(share_id);

CREATE TABLE IF NOT EXISTS family_labels (
  owner_id TEXT NOT NULL,
  section TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id INTEGER NOT NULL,
  epoch INTEGER NOT NULL DEFAULT 1,
  label_ct TEXT NOT NULL,
  src_hash TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (owner_id, section, entity_type, entity_id),
  FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS family_labels_owner_section_idx ON family_labels(owner_id, section);
