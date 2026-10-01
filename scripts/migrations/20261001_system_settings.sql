-- System settings table for admin-configurable options
-- Supports encrypted storage of secrets (API keys, passwords)
-- Additive migration; idempotent

CREATE TABLE IF NOT EXISTS system_settings (
  key TEXT PRIMARY KEY,
  value_ct TEXT NOT NULL,
  updated_by TEXT,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Add index on updated_at for audit purposes
CREATE INDEX IF NOT EXISTS idx_system_settings_updated_at ON system_settings(updated_at);

-- Grant appropriate permissions (adjust for your user/role setup)
-- GRANT SELECT ON system_settings TO readonly_role;
-- GRANT SELECT,INSERT,UPDATE ON system_settings TO readwrite_role;
