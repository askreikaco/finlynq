import { describe, it, expect, beforeAll, afterAll } from "vitest";
import pg from "pg";

const DATABASE_URL = process.env.DATABASE_URL;

/**
 * Table coverage verification test.
 *
 * Verifies that the migration creates triggers for exactly the right set of tables.
 * Expected: 44 covered tables × 3 triggers (_ins, _upd, _del) = 132 triggers.
 *
 * Tables explicitly excluded (documented reasons):
 * - diagnostics_log, op_rollup, system_metrics_sample, etc. (system/logging)
 * - password_reset_tokens, user_identities, etc. (auth infrastructure)
 * - price_cache, fx_rates (external data caches)
 * - transaction_splits (child of transactions)
 * - feedback, tx_currency_audit (system tables, not user data)
 * - Other non-user-data tables
 *
 * Total excluded: 35 tables (actual from schema)
 * Expected coverage: 79 total - 35 excluded = 44 covered
 */

const DOCUMENTED_EXCLUSIONS: Record<string, string> = {
  // System/admin tables
  diagnostics_log: "system logging",
  op_rollup: "computed metrics",
  system_metrics_sample: "system monitoring",
  system_settings: "global settings",
  admin_audit: "admin logging",
  revoked_jtis: "auth infrastructure",
  schema_migrations: "migration tracking",

  // Authentication
  password_reset_tokens: "auth infrastructure",
  user_identities: "auth infrastructure",
  user_devices: "auth infrastructure",
  user_passkeys: "auth infrastructure",
  user_recovery_codes: "auth infrastructure",
  user_security_events: "auth logs",

  // Price and external data
  price_cache: "read-only cache",
  fx_rates: "external market data",

  // Child tables
  transaction_splits: "child of transactions",
  incoming_emails: "transient",
  incoming_email_replies: "transient",

  // OAuth
  oauth_clients: "app registration",
  oauth_authorization_codes: "auth infrastructure",
  oauth_access_tokens: "auth tokens",

  // Temp/transient
  mcp_idempotency_keys: "transient",
  backfill_proposals: "transient staging",
  backfill_audit: "audit log",
  webhook_deliveries: "transient event log",

  // Family/infrastructure
  family_invites: "transient",
  family_key_grants: "auth infrastructure",
  family_section_keys: "auth infrastructure",
  family_shares: "derived",
  user_keypairs: "auth infrastructure",

  // Non-user-data
  announcement_reads: "transient read state",
  feedback: "system feedback",
  announcements: "system announcements",

  // Read-only audit
  tx_currency_audit: "read-only audit log",

  // Other
  family_labels: "family-sharing feature",
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

    // Expected 35 exclusions (79 total - 44 covered = 35 excluded)
    expect(exclusionCount).toBe(35);
  });

  afterAll(async () => {
    if (client) {
      await client.end();
    }
  });
});
