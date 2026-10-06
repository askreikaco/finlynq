import { describe, it, expect, beforeAll, afterAll } from "vitest";
import pg from "pg";

const DATABASE_URL = process.env.DATABASE_URL;
const shouldRun = !!DATABASE_URL;

/**
 * Per-table trigger verification
 *
 * Tests that data_version bumps correctly for INSERT/UPDATE/DELETE
 * on representative user-data tables, and verify bulk operations.
 */

describe.skipIf(!shouldRun)("Per-table trigger verification", () => {
  let client: pg.Client;
  const testUserId = "test-per-table-" + Math.random().toString(36).slice(2, 9);

  beforeAll(async () => {
    if (!DATABASE_URL) throw new Error("DATABASE_URL not set");
    client = new pg.Client({ connectionString: DATABASE_URL });
    await client.connect();

    // Create test user
    const now = new Date().toISOString();
    await client.query(
      "INSERT INTO users (id, password_hash, created_at, updated_at) VALUES ($1, $2, $3, $4)",
      [testUserId, "test_hash", now, now]
    );
  });

  afterAll(async () => {
    if (client) {
      // Delete test user (cascades to all dependent tables)
      await client.query("DELETE FROM users WHERE id = $1", [testUserId]);
      await client.end();
    }
  });

  it("accounts: INSERT bumps data_version", async () => {
    const { rows: before } = await client.query("SELECT data_version FROM users WHERE id = $1", [
      testUserId,
    ]);
    const versionBefore = before[0].data_version;

    await client.query(
      'INSERT INTO accounts (user_id, type, "group", currency) VALUES ($1, $2, $3, $4)',
      [testUserId, "savings", "default", "CAD"]
    );

    const { rows: after } = await client.query("SELECT data_version FROM users WHERE id = $1", [
      testUserId,
    ]);
    expect(after[0].data_version).toBe(versionBefore + 1);

    await client.query("DELETE FROM accounts WHERE user_id = $1", [testUserId]);
  });

  it("categories: INSERT/UPDATE/DELETE bumps data_version", async () => {
    const { rows: before } = await client.query("SELECT data_version FROM users WHERE id = $1", [
      testUserId,
    ]);
    const versionBefore = before[0].data_version;

    // INSERT
    const insertRes = await client.query(
      'INSERT INTO categories (user_id, type, "group") VALUES ($1, $2, $3) RETURNING id',
      [testUserId, "expense", "personal"]
    );
    const catId = insertRes.rows[0].id;

    let { rows: after } = await client.query("SELECT data_version FROM users WHERE id = $1", [
      testUserId,
    ]);
    expect(after[0].data_version).toBe(versionBefore + 1);
    const versionAfterInsert = after[0].data_version;

    // UPDATE
    await client.query('UPDATE categories SET "group" = $1 WHERE id = $2', ["work", catId]);

    ({ rows: after } = await client.query("SELECT data_version FROM users WHERE id = $1", [
      testUserId,
    ]));
    expect(after[0].data_version).toBe(versionAfterInsert + 1);
    const versionAfterUpdate = after[0].data_version;

    // DELETE
    await client.query("DELETE FROM categories WHERE id = $1", [catId]);

    ({ rows: after } = await client.query("SELECT data_version FROM users WHERE id = $1", [
      testUserId,
    ]));
    expect(after[0].data_version).toBe(versionAfterUpdate + 1);
  });

  it("bulk INSERT (10 rows) bumps data_version exactly once", async () => {
    const { rows: before } = await client.query("SELECT data_version FROM users WHERE id = $1", [
      testUserId,
    ]);
    const versionBefore = before[0].data_version;

    // Build bulk insert for 10 categories
    const rows10 = Array.from({ length: 10 }, (_, i) => [testUserId, `cat${i}`, "personal"]);
    const placeholders = rows10.map((_, i) => `($${i * 3 + 1}, $${i * 3 + 2}, $${i * 3 + 3})`).join(",");
    const values = rows10.flat();

    await client.query(
      `INSERT INTO categories (user_id, type, "group") VALUES ${placeholders}`,
      values
    );

    const { rows: after } = await client.query("SELECT data_version FROM users WHERE id = $1", [
      testUserId,
    ]);

    // Should bump exactly once, not 10 times
    expect(after[0].data_version).toBe(versionBefore + 1);

    await client.query("DELETE FROM categories WHERE user_id = $1", [testUserId]);
  });

  it("DELETE USER (cascade) does not error", async () => {
    // Create temporary user
    const tmpUser = "tmp-" + Math.random().toString(36).slice(2, 9);
    const now = new Date().toISOString();
    await client.query(
      "INSERT INTO users (id, password_hash, created_at, updated_at) VALUES ($1, $2, $3, $4)",
      [tmpUser, "test_hash", now, now]
    );

    // Add test data
    await client.query(
      'INSERT INTO accounts (user_id, type, "group", currency) VALUES ($1, $2, $3, $4)',
      [tmpUser, "savings", "default", "CAD"]
    );

    // Delete user should cascade without error
    const result = await client.query("DELETE FROM users WHERE id = $1", [tmpUser]);
    expect(result.rowCount).toBe(1);
  });
});
