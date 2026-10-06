import { describe, it, expect, beforeAll, afterAll } from "vitest";
import pg from "pg";
import { readFileSync } from "fs";
import path from "path";

const DATABASE_URL = process.env.DATABASE_URL;

// Skip if no DATABASE_URL is set
const shouldRun = !!DATABASE_URL;

describe.skipIf(!shouldRun)("data-version triggers (real database)", () => {
  let client: pg.Client;
  const testUserId = "test-user-" + Math.random().toString(36).slice(2, 9);

  beforeAll(async () => {
    if (!DATABASE_URL) throw new Error("DATABASE_URL not set");

    client = new pg.Client({ connectionString: DATABASE_URL });
    await client.connect();

    // Insert test user with all required fields (table already exists from baseline)
    const now = new Date().toISOString();
    try {
      await client.query(
        `INSERT INTO users (id, password_hash, created_at, updated_at, data_version)
         VALUES ($1, $2, $3, $4, 1)
         ON CONFLICT (id) DO NOTHING`,
        [testUserId, "test_hash_" + testUserId, now, now]
      );
    } catch (e) {
      // Users table might have different schema in test DB
      // Try a simpler insert with just required fields
      await client.query("INSERT INTO users (id, password_hash, created_at, updated_at) VALUES ($1, $2, $3, $4)", [
        testUserId,
        "test_hash",
        now,
        now,
      ]);
    }
  });

  afterAll(async () => {
    if (client) {
      // Clean up test data
      await client.query("DELETE FROM users WHERE id = $1", [testUserId]);
      await client.end();
    }
  });

  it("should bump data_version on INSERT to accounts", async () => {
    if (!shouldRun) return;

    const { rows: before } = await client.query(
      "SELECT data_version FROM users WHERE id = $1",
      [testUserId]
    );
    const versionBefore = before[0].data_version;

    // Insert a row into accounts (real schema)
    await client.query(
      'INSERT INTO accounts (user_id, type, "group", currency) VALUES ($1, $2, $3, $4)',
      [testUserId, "savings", "default", "CAD"]
    );

    const { rows: after } = await client.query(
      "SELECT data_version FROM users WHERE id = $1",
      [testUserId]
    );
    const versionAfter = after[0].data_version;

    expect(versionAfter).toBe(versionBefore + 1);

    // Clean up - delete all test accounts for this user
    await client.query("DELETE FROM accounts WHERE user_id = $1", [testUserId]);
  });

  it("should bump data_version once per bulk INSERT statement", async () => {
    if (!shouldRun) return;

    const { rows: before } = await client.query(
      "SELECT data_version FROM users WHERE id = $1",
      [testUserId]
    );
    const versionBefore = before[0].data_version;

    // Bulk insert 10 rows in one statement
    const rows = Array.from({ length: 10 }, (_, i) => [
      testUserId,
      "savings",
      `group${i}`,
      "CAD",
    ]);

    const placeholders = rows.map((_, i) => `($${i * 4 + 1}, $${i * 4 + 2}, $${i * 4 + 3}, $${i * 4 + 4})`).join(",");
    const values = rows.flat();

    await client.query(
      `INSERT INTO accounts (user_id, type, "group", currency) VALUES ${placeholders}`,
      values
    );

    const { rows: after } = await client.query(
      "SELECT data_version FROM users WHERE id = $1",
      [testUserId]
    );
    const versionAfter = after[0].data_version;

    // Should bump exactly once, not 10 times
    expect(versionAfter).toBe(versionBefore + 1);

    // Clean up
    await client.query("DELETE FROM accounts WHERE user_id = $1", [testUserId]);
  });

  it("should bump data_version on UPDATE", async () => {
    if (!shouldRun) return;

    // Insert test account
    const insertRes = await client.query(
      'INSERT INTO accounts (user_id, type, "group", currency) VALUES ($1, $2, $3, $4) RETURNING id',
      [testUserId, "savings", "default", "CAD"]
    );
    const accountId = insertRes.rows[0].id;

    const { rows: before } = await client.query(
      "SELECT data_version FROM users WHERE id = $1",
      [testUserId]
    );
    const versionBefore = before[0].data_version;

    // Update the account
    await client.query('UPDATE accounts SET note = $1 WHERE id = $2', ["Updated note", accountId]);

    const { rows: after } = await client.query(
      "SELECT data_version FROM users WHERE id = $1",
      [testUserId]
    );
    const versionAfter = after[0].data_version;

    expect(versionAfter).toBe(versionBefore + 1);

    // Clean up
    await client.query("DELETE FROM accounts WHERE id = $1", [accountId]);
  });

  it("should bump data_version on DELETE", async () => {
    if (!shouldRun) return;

    // Insert test account
    const insertRes = await client.query(
      'INSERT INTO accounts (user_id, type, "group", currency) VALUES ($1, $2, $3, $4) RETURNING id',
      [testUserId, "savings", "default", "CAD"]
    );
    const accountId = insertRes.rows[0].id;

    const { rows: before } = await client.query(
      "SELECT data_version FROM users WHERE id = $1",
      [testUserId]
    );
    const versionBefore = before[0].data_version;

    // Delete the account
    await client.query('DELETE FROM accounts WHERE id = $1', [accountId]);

    const { rows: after } = await client.query(
      "SELECT data_version FROM users WHERE id = $1",
      [testUserId]
    );
    const versionAfter = after[0].data_version;

    expect(versionAfter).toBe(versionBefore + 1);
  });

  it("should have triggers on all required tables", async () => {
    if (!shouldRun) return;

    const { rows } = await client.query(`
      SELECT tgname FROM pg_trigger WHERE tgname LIKE 'reika_%' ORDER BY tgname
    `);

    // Should have at least some triggers
    expect(rows.length).toBeGreaterThan(0);

    // Check for specific tables that should have triggers
    const triggerNames = rows.map((r) => r.tgname);
    expect(triggerNames.some((t) => t.includes("accounts"))).toBe(true);
    expect(triggerNames.some((t) => t.includes("transactions"))).toBe(true);
    expect(triggerNames.some((t) => t.includes("categories"))).toBe(true);
  });

  it("should NOT have triggers on system tables", async () => {
    if (!shouldRun) return;

    // These should NOT have triggers
    const systemTables = [
      "diagnostics_log",
      "op_rollup",
      "system_metrics_sample",
      "admin_audit",
      "revoked_jtis",
    ];

    const { rows } = await client.query(`
      SELECT tgname FROM pg_trigger WHERE tgname LIKE 'reika_%' ORDER BY tgname
    `);

    const triggerNames = rows.map((r) => r.tgname);

    for (const table of systemTables) {
      expect(triggerNames.some((t) => t.includes(table))).toBe(false);
    }
  });
});
