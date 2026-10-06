#!/usr/bin/env node
/**
 * Generate comprehensive list of tables with user_id from schema-pg.ts
 *
 * Usage: node scripts/gen-data-version-tables.mjs > tables-report.txt
 */

import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCHEMA_FILE = path.join(HERE, "../src/db/schema-pg.ts");

// Read schema file
const schema = readFileSync(SCHEMA_FILE, "utf-8");

// Find all pgTable definitions
const pgTableRegex = /export const (\w+) = pgTable\("(\w+)"/g;
const tables = new Map();

let match;
while ((match = pgTableRegex.exec(schema)) !== null) {
  const exportName = match[1];
  const tableName = match[2];
  tables.set(tableName, exportName);
}

// For each table, check if it has a user_id column
const tablesWithUserId = [];
const tablesWithoutUserId = [];

for (const [tableName, exportName] of tables) {
  // Find the table definition and check for userId column
  const tableDefPattern = new RegExp(
    `export const ${exportName} = pgTable\\("${tableName}"[^}]*userId: text\\("user_id"\\)`,
    "s"
  );

  if (tableDefPattern.test(schema)) {
    tablesWithUserId.push(tableName);
  } else {
    tablesWithoutUserId.push(tableName);
  }
}

// Current migration tables (from 20261010_reika_data_version_triggers.sql)
const currentTables = [
  "accounts",
  "backfill_runs",
  "bank_daily_balances",
  "bank_transactions",
  "bank_upload_batches",
  "budget_templates",
  "budgets",
  "categories",
  "contribution_room",
  "custom_security_prices",
  "fx_overrides",
  "goal_accounts",
  "goals",
  "holding_accounts",
  "holding_lot_closures",
  "holding_lots",
  "import_templates",
  "loans",
  "notifications",
  "portfolio_holdings",
  "portfolio_legacy_realized_gain_snapshot",
  "portfolio_snapshots",
  "recurring_transactions",
  "securities",
  "settings",
  "simplefin_pending_transactions",
  "snapshots",
  "staged_imports",
  "staged_transactions",
  "subscriptions",
  "target_allocations",
  "transaction_bank_links",
  "transaction_reconciliation_flags",
  "transaction_rules",
  "transactions",
];

// System/internal tables that should NOT have triggers (documented exclusions)
const exclusions = {
  "schema_migrations": "System table for migration tracking",
  "revoked_jtis": "System table for JWT revocation",
  "admin_audit": "System/audit table (internal)",
  "diagnostics_log": "System diagnostics (internal, fast-rotating)",
  "op_rollup": "System operational metrics (aggregated)",
  "system_metrics_sample": "System metrics (internal)",
  "fx_rates": "System cache for FX rates (refreshed periodically, not user-data)",
  "price_cache": "System cache for security prices (refreshed periodically)",
  // Authentication/identity tables (not user-data rows; managed by auth system)
  "password_reset_tokens": "Auth system: temporary tokens, not user data",
  "user_identities": "Auth system: identity providers, managed with user record",
  "user_devices": "Auth system: device tokens, managed with user record",
  "user_passkeys": "Auth system: passkey records, managed with user record",
  "user_recovery_codes": "Auth system: MFA recovery, managed with user record",
  "user_security_events": "Auth audit log for login events",
  // OAuth (authentication, not user data)
  "oauth_clients": "System: OAuth app registrations",
  "oauth_authorization_codes": "Auth: temporary authorization codes",
  "oauth_access_tokens": "Auth: JWT tokens",
  // Family/sharing tables
  "family_invites": "TODO: determine if covered",
  "family_keys": "TODO: determine if covered",
  "family_scope_guards": "TODO: determine if covered",
  "family_shares": "TODO: determine if covered",
  // Email/inbox (may be covered)
  "inbox": "TODO: determine if covered",
};

// Find tables with user_id that are NOT in current migration
const missing = tablesWithUserId.filter((t) => !currentTables.includes(t) && !exclusions[t]);

console.log("=== TABLE COVERAGE ANALYSIS ===\n");
console.log(`Total pgTables: ${tables.size}`);
console.log(`Tables with user_id: ${tablesWithUserId.length}`);
console.log(`Tables WITHOUT user_id: ${tablesWithoutUserId.length}`);
console.log(`Currently covered by triggers: ${currentTables.length}`);
console.log(`Documented exclusions: ${Object.keys(exclusions).length}`);
console.log(`Missing coverage: ${missing.length}\n`);

if (missing.length > 0) {
  console.log("MISSING TABLES (have user_id but no trigger):");
  missing.forEach((t) => console.log(`  - ${t}`));
  console.log();
}

console.log("=== CURRENT COVERAGE (35 tables) ===");
currentTables.forEach((t) => console.log(`  COVERED: ${t}`));

console.log("\n=== DOCUMENTED EXCLUSIONS ===");
Object.entries(exclusions)
  .filter(([t]) => tablesWithUserId.includes(t))
  .forEach(([t, reason]) => console.log(`  EXCLUDED: ${t} — ${reason}`));

console.log("\n=== TABLES WITHOUT user_id (should NOT have triggers) ===");
tablesWithoutUserId.slice(0, 20).forEach((t) => console.log(`  ${t}`));
if (tablesWithoutUserId.length > 20) {
  console.log(`  ... and ${tablesWithoutUserId.length - 20} more`);
}
