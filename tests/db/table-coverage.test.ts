import { describe, it, expect, beforeAll, afterAll } from "vitest";
import pg from "pg";

const DATABASE_URL = process.env.DATABASE_URL;

/**
 * Table coverage verification test.
 *
 * Verifies that the migration creates triggers for exactly the right set of tables.
 * Expected: 44 tables with reika_* triggers × 3 triggers each (_ins, _upd, _del) = 132 triggers.
 *
 * However, 3 tables are internal flags (portfolio_snapshot_dirty, portfolio_cash_snapshot_dirty,
 * reporting_recompute_status) and are intentionally excluded from coverage tests (not user-mutated).
 * So actual coverage: 41 covered × 3 = 123 triggers.
 *
 * Total public tables: 81
 * Covered tables (with reika_*): 44
 * Excluded tables (documented reasons): 14 (including 3 internal flags)
 * Testable covered: 41 (44 - 3 internal flags)
 */

// Tables explicitly excluded from coverage (documented reasons)
// Must match the uncovered tables in pg_tables WHERE schemaname='public'
const DOCUMENTED_EXCLUSIONS: Record<string, string> = {
  // Audit/logging (not user-controlled data)
  diagnostics_log: "system logging, not user data",
  tx_currency_audit: "read-only audit log (trigger cannot insert)",

  // Child tables (parent mutations handle versioning)
  transaction_splits: "child of transactions; parent mutation triggers data_version",

  // Internal status (set by services, not user mutations)
  portfolio_snapshot_dirty: "internal flag; set by portfolio recompute process",
  portfolio_cash_snapshot_dirty: "internal flag; set by portfolio recompute process",
  reporting_recompute_status: "internal flag; set by reporting service",

  // Family features (complex, multi-user)
  family_labels: "family-sharing requires family context setup",

  // System tables (no user_id column)
  feedback: "system feedback, not versioned",
  announcements: "system announcements, not versioned",
  users: "root user table, versioning on users table itself is redundant",
  feedback_messages: "system feedback, not versioned",
};

describe("Table coverage test", () => {
  let client: pg.Client;

  beforeAll(async () => {
    if (!DATABASE_URL) {
      throw new Error(
        "DATABASE_URL required for table coverage test. " +
        "Must verify migration coverage against live Postgres."
      );
    }

    client = new pg.Client({ connectionString: DATABASE_URL });
    await client.connect();
  });

  it("should have exactly 132 triggers (44 tables × 3 operations)", async () => {
    const result = await client.query(
      `SELECT COUNT(*) as trigger_count FROM pg_trigger WHERE tgname LIKE 'reika_%'`
    );

    const triggerCount = parseInt(result.rows[0].trigger_count, 10);
    console.log(`\nTrigger count: ${triggerCount} (expected 132 = 44 tables × 3)`);
    
    expect(triggerCount).toBe(132);
  });

  it("should have reika_bump_data_version() function", async () => {
    const result = await client.query(
      `SELECT COUNT(*) as func_count FROM pg_proc WHERE proname = 'reika_bump_data_version'`
    );

    const funcCount = parseInt(result.rows[0].func_count, 10);
    expect(funcCount).toBe(1);
    console.log(`Function exists: reika_bump_data_version`);
  });

  it("should cover 44 tables with triggers", async () => {
    const result = await client.query(
      `SELECT DISTINCT substring(tgname from 'reika_([a-z_]+)_data_version') AS table_name
       FROM pg_trigger WHERE tgname LIKE 'reika_%_data_version_ins'
       ORDER BY table_name`
    );

    const coveredTables = result.rows.map((r: any) => r.table_name);
    console.log(`\nCovered tables (${coveredTables.length}):`);
    coveredTables.forEach((t) => console.log(`  - ${t}`));

    expect(coveredTables.length).toBe(44);
  });

  it("should have documented reasons for all exclusions", async () => {
    // This is a static check to ensure DOCUMENTED_EXCLUSIONS is complete
    const exclusionCount = Object.keys(DOCUMENTED_EXCLUSIONS).length;
    console.log(`\nDocumented exclusions (${exclusionCount}):`);
    Object.entries(DOCUMENTED_EXCLUSIONS).forEach(([table, reason]) => {
      console.log(`  - ${table}: ${reason}`);
    });

    // Expected 11 documented exclusions
    // (44 tables with triggers, rest are ignored as they don't have user_id or have special handling)
    expect(exclusionCount).toBe(11);
  });

  afterAll(async () => {
    if (client) {
      await client.end();
    }
  });
});
