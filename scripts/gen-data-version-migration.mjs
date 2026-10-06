#!/usr/bin/env node
/**
 * Generator for the data-version triggers migration.
 *
 * Derives the table list from src/db/schema-pg.ts and generates:
 * - scripts/migrations/20261010_reika_data_version_triggers.sql (UP)
 * - scripts/migrations/down/20261010_reika_data_version_triggers.down.sql (DOWN)
 *
 * Tables to exclude (with reasons):
 * - System/admin tables: diagnostics_log, op_rollup, system_metrics_sample, admin_audit, revoked_jtis
 * - Authentication: password_reset_tokens, user_identities, user_devices, user_passkeys, user_recovery_codes, user_security_events
 * - Internal versioning: schema_migrations
 * - Price cache: price_cache (read-only, populated by external service)
 * - Child tables: transaction_splits (splits route also UPDATEs transactions; import paths write transactions)
 * - Internal auth: oauth_clients, oauth_authorization_codes, oauth_access_tokens
 * - Temp/staging: They have user_id but are transient (mcpIdempotencyKeys, backfillProposals, backfillAudit, incomingEmails, incomingEmailReplies, webhookDeliveries, familyInvites, familyKeyGrants, familySectionKeys)
 * - Family: familyShares (derived, not user-controlled)
 * - User keypairs: userKeypairs (infrastructure, not data)
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const schemaPath = path.join(__dirname, "../src/db/schema-pg.ts");

const EXCLUSION_LIST = {
  // System tables
  diagnostics_log: "system logging, not user data",
  op_rollup: "computed metrics, not user data",
  system_metrics_sample: "system monitoring, not user data",
  system_settings: "global settings, not per-user data",
  admin_audit: "admin logging, not user data",
  revoked_jtis: "auth infrastructure, not user data",
  schema_migrations: "migration tracking, not user data",

  // Authentication
  password_reset_tokens: "auth infrastructure, expires quickly",
  user_identities: "auth infrastructure, part of users table concept",
  user_devices: "auth infrastructure, not data-dependent",
  user_passkeys: "auth infrastructure, not data-dependent",
  user_recovery_codes: "auth infrastructure, not data-dependent",
  user_security_events: "auth logs, not data-dependent",

  // Price and external data
  price_cache: "read-only cache from external service, not user-controlled data",
  fx_rates: "external market data cache, not user-controlled data",

  // Child tables that are updated via parent mutations
  transaction_splits: "child of transactions; splits route also UPDATEs transactions; import paths write transactions directly",
  incoming_emails: "transient, webhook-driven, not critical for data version",
  incoming_email_replies: "transient, webhook-driven, not critical for data version",

  // OAuth infrastructure
  oauth_clients: "app registration, not per-user data",
  oauth_authorization_codes: "auth infrastructure, not user data",
  oauth_access_tokens: "auth tokens, not user data",

  // Temp/transient
  mcp_idempotency_keys: "transient, expires quickly",
  backfill_proposals: "transient staging, cleaned up after use",
  backfill_audit: "audit log only, not user data",
  webhook_deliveries: "transient event log, not user data",

  // Family infrastructure (not user-controlled)
  family_invites: "transient, awaiting response",
  family_key_grants: "auth infrastructure",
  family_section_keys: "auth infrastructure",
  family_shares: "derived, not directly user-controlled",
  user_keypairs: "auth infrastructure",

  // Other non-data
  announcement_reads: "transient read state, minimal footprint",
};

// Read schema file
const schemaContent = fs.readFileSync(schemaPath, "utf8");

// Extract all table names from "export const <name> = pgTable("
const tableMatches = [...schemaContent.matchAll(/export const (\w+) = pgTable\(/g)];
const allTables = tableMatches.map((m) => m[1]);

// Convert camelCase to snake_case
function camelToSnake(str) {
  return str
    .replace(/([A-Z])/g, "_$1")
    .toLowerCase()
    .replace(/^_/, "");
}

const snakeTables = allTables.map((t) => camelToSnake(t));

// Filter: exclude system tables, keep user-data tables
const trackedTables = snakeTables.filter(
  (table) => !EXCLUSION_LIST[camelToSnake(table)]
);

const trackedTablesCamel = allTables.filter(
  (table) => !EXCLUSION_LIST[table]
);

console.log(`Found ${allTables.length} total tables, tracking ${trackedTables.length}:`);
trackedTables.forEach((t) => console.log(`  - ${t}`));
console.log(
  `\nExcluded ${Object.keys(EXCLUSION_LIST).length} system/auth/temp tables (reasons documented in script).`
);

// Generate UP migration
const upMigration = generateUpMigration(trackedTables);

// Generate DOWN migration
const downMigration = generateDownMigration();

// Write migrations
const upPath = path.join(__dirname, "../scripts/migrations/20261010_reika_data_version_triggers.sql");
const downDir = path.join(__dirname, "../scripts/migrations/down");
const downPath = path.join(downDir, "20261010_reika_data_version_triggers.down.sql");

fs.mkdirSync(downDir, { recursive: true });
fs.writeFileSync(upPath, upMigration);
fs.writeFileSync(downPath, downMigration);

console.log(`\n✓ Generated ${upPath}`);
console.log(`✓ Generated ${downPath}`);

function generateUpMigration(tables) {
  const triggerBlock = tables
    .map((table) => generateTableBlock(table))
    .join("\n");

  return `-- Per-user data versioning via statement-level triggers
--
-- Adds triggers to bump users.data_version on EVERY write to user-owned tables.
-- Each trigger is STATEMENT-level (not ROW) with transition tables, so a bulk
-- insert of 1000 rows bumps the version once per affected user, not 1000 times.
--
-- This migration is idempotent (DROP TRIGGER IF EXISTS before CREATE TRIGGER).
-- To rollback: see scripts/migrations/down/20261010_reika_data_version_triggers.down.sql

-- Plpgsql function that bumps data_version for affected users.
-- Called by statement-level triggers with NEW TABLE or OLD TABLE.
-- Uses deterministic row locking to prevent deadlocks in concurrent scenarios.
-- For UPDATE statements, both old_rows and new_rows are used to detect user_id changes.
CREATE OR REPLACE FUNCTION reika_bump_data_version()
RETURNS TRIGGER AS $$
DECLARE
  v_user_ids text;
BEGIN
  -- Determine the user_ids subquery based on trigger operation.
  -- INSERT: uses new_rows
  -- DELETE: uses old_rows
  -- UPDATE: unions old_rows and new_rows to catch user_id changes
  -- (a row moved from one user to another must bump both owners)
  IF TG_OP = 'INSERT' THEN
    v_user_ids := '(SELECT DISTINCT user_id FROM new_rows WHERE user_id IS NOT NULL)';
  ELSIF TG_OP = 'DELETE' THEN
    v_user_ids := '(SELECT DISTINCT user_id FROM old_rows WHERE user_id IS NOT NULL)';
  ELSIF TG_OP = 'UPDATE' THEN
    v_user_ids := '(SELECT DISTINCT user_id FROM old_rows WHERE user_id IS NOT NULL UNION ALL SELECT DISTINCT user_id FROM new_rows WHERE user_id IS NOT NULL)';
  END IF;

  -- Take row locks on the users table in deterministic order (by id) BEFORE the UPDATE
  -- to prevent deadlocks. NO KEY UPDATE allows concurrent reads while preventing
  -- concurrent modifications to the same rows.
  EXECUTE format('PERFORM 1 FROM users WHERE id IN %s ORDER BY id FOR NO KEY UPDATE', v_user_ids);

  -- Now bump the data_version for all affected users
  EXECUTE format(
    'UPDATE users SET data_version = data_version + 1 WHERE id IN %s',
    v_user_ids
  );

  RETURN NULL; -- STATEMENT-level triggers return NULL
END;
$$ LANGUAGE plpgsql;

-- Create statement-level triggers for each user-owned data table.
-- Each table gets three triggers (_ins, _upd, _del) for INSERT/UPDATE/DELETE.
-- DROP TRIGGER IF EXISTS before CREATE ensures idempotency.
-- UPDATE triggers use both REFERENCING OLD TABLE AS old_rows and NEW TABLE AS new_rows
-- to detect changes to the user_id column.

${triggerBlock}`;
}

function generateTableBlock(table) {
  const functionName = `reika_${table}_data_version`;
  return `
-- ${table}
DO $$ BEGIN
  IF to_regclass('${table}') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS ${functionName}_ins ON ${table};
    CREATE TRIGGER ${functionName}_ins AFTER INSERT ON ${table}
      REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT
      EXECUTE FUNCTION reika_bump_data_version();

    DROP TRIGGER IF EXISTS ${functionName}_upd ON ${table};
    CREATE TRIGGER ${functionName}_upd AFTER UPDATE ON ${table}
      REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows FOR EACH STATEMENT
      EXECUTE FUNCTION reika_bump_data_version();

    DROP TRIGGER IF EXISTS ${functionName}_del ON ${table};
    CREATE TRIGGER ${functionName}_del AFTER DELETE ON ${table}
      REFERENCING OLD TABLE AS old_rows FOR EACH STATEMENT
      EXECUTE FUNCTION reika_bump_data_version();
  END IF;
END $$;`;
}

function generateDownMigration() {
  return `-- Rollback for 20261010_reika_data_version_triggers.sql
--
-- Removes all reika_% triggers and the reika_bump_data_version() function.
-- After applying this down migration, also manually run:
--   DELETE FROM schema_migrations WHERE version = '20261010_reika_data_version_triggers';

-- Drop the function (cascades to triggers)
DROP FUNCTION IF EXISTS reika_bump_data_version() CASCADE;

-- Verify cleanup (should return 0)
-- SELECT COUNT(*) FROM pg_trigger WHERE tgname LIKE 'reika_%';
-- SELECT COUNT(*) FROM pg_proc WHERE proname LIKE 'reika_%';
`;
}
