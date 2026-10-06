import { describe, it, expect, beforeAll, afterAll } from "vitest";
import pg from "pg";
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "node:url";

const DATABASE_URL = process.env.DATABASE_URL;
const shouldRun = !!DATABASE_URL;

/**
 * Table Coverage Test
 *
 * Verifies that every table with a user_id column (that should have triggers)
 * actually has the reika_* triggers created by the data-version migration.
 *
 * Documented exclusions (auth system, system tables):
 * - password_reset_tokens, user_identities, user_devices, user_passkeys,
 *   user_recovery_codes, oauth_authorization_codes, oauth_access_tokens,
 *   user_security_events, portfolio_cash_snapshot_dirty, portfolio_snapshot_dirty,
 *   portfolio_lots_status, reporting_recompute_status, portfolio_cash_snapshot_meta
 */

const DOCUMENTED_EXCLUSIONS = new Set([
  "password_reset_tokens",
  "user_identities",
  "user_devices",
  "user_passkeys",
  "user_recovery_codes",
  "oauth_authorization_codes",
  "oauth_access_tokens",
  "user_security_events",
  // Portfolio snapshot tracking (internal status tables, not user-facing data)
  "portfolio_cash_snapshot_dirty",
  "portfolio_snapshot_dirty",
  "portfolio_lots_status",
  "reporting_recompute_status",
  "portfolio_cash_snapshot_meta",
  // Email import rules (legacy, being phased out)
  "email_import_rules",
  // Backfill proposals (internal system table)
  "backfill_proposals",
  // MCP tables (internal integration tracking)
  "mcp_idempotency_keys",
  // Feedback (admin-only, not user-facing data write)
  "feedback",
  // Announcement reads (system-generated, high-volume, not needing version bump)
  "announcement_reads",
  // Audit/system tables (not user-facing data modifications)
  "tx_currency_audit",
  // Keypairs (auth/system credential material, not user-data)
  "user_keypairs",
]);

describe.skipIf(!shouldRun)("Table coverage verification", () => {
  let client: pg.Client;

  beforeAll(async () => {
    if (!DATABASE_URL) throw new Error("DATABASE_URL not set");
    client = new pg.Client({ connectionString: DATABASE_URL });
    await client.connect();
  });

  afterAll(async () => {
    if (client) await client.end();
  });

  it("every user_id table should have reika_* triggers or be documented as excluded", async () => {
    if (!shouldRun) return;

    // Get all tables with user_id column
    const { rows: tableRows } = await client.query(`
      SELECT table_name FROM information_schema.columns
      WHERE column_name = 'user_id' AND table_schema = 'public'
      ORDER BY table_name
    `);

    const userIdTables = new Set(tableRows.map((r) => r.table_name));

    // Get all existing reika_* triggers
    const { rows: triggerRows } = await client.query(`
      SELECT DISTINCT tgname FROM pg_trigger
      WHERE tgname LIKE 'reika_%'
      ORDER BY tgname
    `);

    const triggerNames = triggerRows.map((r) => r.tgname);
    const coveredTables = new Set(
      triggerNames.map((name) => {
        // Extract table name from trigger_name (e.g., reika_accounts_data_version_ins -> accounts)
        const match = name.match(/^reika_(.+)_data_version_(ins|upd|del)$/);
        return match ? match[1] : null;
      })
    );

    const uncoveredButNotExcluded = [];

    for (const table of userIdTables) {
      // Normalize: trigger names are snake_case, schema might have underscores
      const normailzedTable = table.replace(/-/g, "_");
      const hasInsTrigger = triggerNames.some((name) => name.includes(`reika_${normailzedTable}_data_version_ins`));

      if (!hasInsTrigger && !DOCUMENTED_EXCLUSIONS.has(table)) {
        uncoveredButNotExcluded.push(table);
      }
    }

    if (uncoveredButNotExcluded.length > 0) {
      const msg = `Tables with user_id that lack reika_* triggers and are not documented as excluded:\n  - ${uncoveredButNotExcluded.join("\n  - ")}\n\nEither add triggers or document the exclusion in DOCUMENTED_EXCLUSIONS.`;
      throw new Error(msg);
    }
  });

  it("all covered tables should have INSERT, UPDATE, and DELETE triggers", async () => {
    if (!shouldRun) return;

    // Get all reika_* triggers
    const { rows: triggerRows } = await client.query(`
      SELECT tgname FROM pg_trigger
      WHERE tgname LIKE 'reika_%_data_version_%'
      ORDER BY tgname
    `);

    const triggers = triggerRows.map((r) => r.tgname);
    const tablesByOp: Record<string, Set<string>> = {
      ins: new Set(),
      upd: new Set(),
      del: new Set(),
    };

    for (const trigger of triggers) {
      const match = trigger.match(/^reika_(.+)_data_version_(ins|upd|del)$/);
      if (match) {
        const [_, table, op] = match;
        tablesByOp[op].add(table);
      }
    }

    // Verify each table has all three operations
    const missingOps = [];
    for (const table of tablesByOp.ins) {
      if (!tablesByOp.upd.has(table)) {
        missingOps.push(`${table} (missing UPDATE trigger)`);
      }
      if (!tablesByOp.del.has(table)) {
        missingOps.push(`${table} (missing DELETE trigger)`);
      }
    }

    if (missingOps.length > 0) {
      throw new Error(`Tables with incomplete trigger coverage:\n  - ${missingOps.join("\n  - ")}`);
    }
  });

  it("trigger count should match expected coverage (36 tables x 3 operations)", async () => {
    if (!shouldRun) return;

    const { rows } = await client.query(`
      SELECT count(*)::int as count FROM pg_trigger WHERE tgname LIKE 'reika_%'
    `);

    const count = rows[0].count;
    // We now have 38 tables (35 original + webhooks + email_inbox + user_prompt_acks)
    const expectedCount = 38 * 3; // INSERT, UPDATE, DELETE per table

    expect(count).toBe(expectedCount);
  });
});
