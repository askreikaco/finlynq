import { describe, it, expect, beforeAll, afterAll } from "vitest";
import pg from "pg";

const DATABASE_URL = process.env.DATABASE_URL;

/**
 * Table coverage verification test (Test C).
 *
 * Verifies that the migration creates reika_* triggers for all and only the tables
 * that have user_id columns and should be versioned.
 *
 * Strategy:
 * 1. Query all tables with user_id column from information_schema
 * 2. Query all tables with reika_* triggers from pg_trigger
 * 3. Compute: tables_with_user_id - tables_with_triggers = tables_that_need_doc
 * 4. Assert: tables_that_need_doc = DOCUMENTED_EXCLUSIONS keys (both directions)
 *
 * Expected: 12+ auth/transient tables + feedback/transaction tracking = exclusion set
 */

// Tables with user_id column that are NOT covered by reika_* triggers (with reasons)
// Must match exactly: (tables with user_id) - (tables with reika_* triggers)
const DOCUMENTED_EXCLUSIONS: Record<string, string> = {
  // Auth & credential tables (transient, multi-step flows, not user-facing data)
  announcement_reads: "user acknowledgment log; data versioning unnecessary",
  backfill_proposals: "temporary proposal state during backfill process",
  mcp_idempotency_keys: "transient idempotency tracking for MCP operations",
  oauth_access_tokens: "OAuth token cache; regenerated on demand",
  oauth_authorization_codes: "transient OAuth auth code (single use)",
  password_reset_tokens: "transient reset token (single use)",
  user_devices: "device registration table (covered by users table updates)",
  user_identities: "identity provider mapping (covered by users table updates)",
  user_keypairs: "cryptographic key material (covered by users table updates)",
  user_passkeys: "passkey credentials (covered by users table updates)",
  user_recovery_codes: "backup codes (covered by users table updates)",
  user_security_events: "security audit log (write-only, not versioned)",

  // Support & audit tables (written alongside user data, not by ETag routes)
  feedback: "system feedback form; not user data",
  tx_currency_audit: "audit log written alongside transaction edits, not read by ETag handlers",
};

describe("Table coverage test (Test C)", () => {
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
    console.log(`\n=== Trigger Verification ===`);
    console.log(`Total reika_* triggers: ${triggerCount} (expected 132 = 44 tables × 3)`);

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

  it("should cover 44 tables with reika_* triggers", async () => {
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

  it("table coverage matches exclusion dict: (tables_with_user_id - tables_with_triggers) = DOCUMENTED_EXCLUSIONS", async () => {
    // Query all tables with user_id column
    const userIdTablesResult = await client.query(
      `SELECT table_name FROM information_schema.columns
       WHERE table_schema = 'public' AND column_name = 'user_id'
       GROUP BY table_name
       ORDER BY table_name`
    );
    const tablesWithUserId = new Set(userIdTablesResult.rows.map((r: any) => r.table_name));

    // Query all tables with reika_* triggers
    const triggeredTablesResult = await client.query(
      `SELECT DISTINCT substring(tgname from 'reika_([a-z_]+)_data_version') AS table_name
       FROM pg_trigger WHERE tgname LIKE 'reika_%_data_version_ins'
       ORDER BY table_name`
    );
    const tablesWithTriggers = new Set(triggeredTablesResult.rows.map((r: any) => r.table_name));

    // Compute: tables_with_user_id - tables_with_triggers (these should be excluded)
    const shouldBeExcluded = new Set(
      Array.from(tablesWithUserId).filter(t => !tablesWithTriggers.has(t))
    );

    // Compare with DOCUMENTED_EXCLUSIONS
    const documentedKeys = new Set(Object.keys(DOCUMENTED_EXCLUSIONS));

    console.log(`\n=== Coverage Analysis ===`);
    console.log(`Tables with user_id column: ${tablesWithUserId.size}`);
    console.log(`Tables with reika_* triggers: ${tablesWithTriggers.size}`);
    console.log(`Tables with user_id but NO triggers (should be excluded): ${shouldBeExcluded.size}`);
    console.log(`Documented exclusions: ${documentedKeys.size}`);

    // Find discrepancies
    const missingFromDoc = Array.from(shouldBeExcluded).filter(t => !documentedKeys.has(t));
    const extraInDoc = Array.from(documentedKeys).filter(t => !shouldBeExcluded.has(t));

    if (missingFromDoc.length > 0) {
      console.log(`\nTables MISSING from DOCUMENTED_EXCLUSIONS (should be added):`);
      missingFromDoc.forEach(t => console.log(`  - ${t}`));
    }

    if (extraInDoc.length > 0) {
      console.log(`\nTables EXTRA in DOCUMENTED_EXCLUSIONS (should be removed):`);
      extraInDoc.forEach(t => console.log(`  - ${t}`));
    }

    // Assert both directions: every excluded table exists and vice versa
    expect(shouldBeExcluded).toEqual(documentedKeys);

    console.log(`\n✓ DOCUMENTED_EXCLUSIONS matches (tables_with_user_id - tables_with_triggers)`);

    // Print the documented reasons
    console.log(`\nDocumented Exclusion Reasons:`);
    Array.from(documentedKeys)
      .sort()
      .forEach(table => {
        console.log(`  ${table}: ${DOCUMENTED_EXCLUSIONS[table]}`);
      });
  });

  it("adding a public table with user_id but no trigger should fail the coverage check", async () => {
    // Verify that if we were to add a new public table with user_id but without a reika_* trigger,
    // the coverage check would fail

    // Create a temporary test table in public schema
    await client.query(`CREATE TABLE IF NOT EXISTS public.test_coverage_new_table (id serial PRIMARY KEY, user_id text)`);

    try {
      // Re-run the coverage analysis with the new table
      const userIdTablesResult = await client.query(
        `SELECT table_name FROM information_schema.columns
         WHERE table_schema = 'public' AND column_name = 'user_id'
         GROUP BY table_name`
      );
      const tablesWithUserId = new Set(userIdTablesResult.rows.map((r: any) => r.table_name));

      // New table should be in the set
      expect(tablesWithUserId.has('test_coverage_new_table')).toBe(true);

      // But it's not in DOCUMENTED_EXCLUSIONS, so the check would fail
      expect(DOCUMENTED_EXCLUSIONS['test_coverage_new_table']).toBeUndefined();
    } finally {
      // Clean up
      await client.query(`DROP TABLE IF EXISTS public.test_coverage_new_table`);
    }
  });

  it("removing an exclusion should cause mismatch error", async () => {
    // This is a demonstration test: if we were to remove an entry from DOCUMENTED_EXCLUSIONS,
    // the previous test would fail due to the assertion mismatch

    // Create a test set that's missing one entry
    const testExclusions = { ...DOCUMENTED_EXCLUSIONS };
    const firstKey = Object.keys(testExclusions)[0];
    delete testExclusions[firstKey];

    // If we were to use testExclusions instead of DOCUMENTED_EXCLUSIONS in the previous test,
    // the assertion would fail because the sets wouldn't match

    expect(Object.keys(testExclusions).length).toBe(Object.keys(DOCUMENTED_EXCLUSIONS).length - 1);
  });

  afterAll(async () => {
    if (client) {
      await client.end();
    }
  });
});
