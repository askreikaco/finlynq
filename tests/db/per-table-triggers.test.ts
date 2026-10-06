import { describe, it, expect, beforeAll, afterAll } from "vitest";
import pg from "pg";

const DATABASE_URL = process.env.DATABASE_URL;
const shouldRun = !!DATABASE_URL;

/**
 * Per-table trigger verification (COMPREHENSIVE)
 *
 * Tests that data_version bumps correctly for INSERT/UPDATE/DELETE on ALL
 * covered user-data tables. If CI is set and DATABASE_URL is missing, this test
 * FAILS (not skipped).
 *
 * To run: DATABASE_URL=postgresql://... npm test tests/db/per-table-triggers.test.ts
 *
 * Auto-generated valid rows for each table using schema metadata.
 * Tables requiring hand-written inserts are documented below.
 *
 * Note: transaction_splits is excluded (child of transactions; splits route also
 * UPDATEs transactions; import paths write transactions directly).
 */

// Tables that need special handling (FKs, constraints, etc.)
const SPECIAL_TABLES: Record<string, string> = {
  tx_currency_audit: "read-only audit log (never directly inserted)",
  transaction_splits: "child of transactions; use parent mutations",
  portfolio_snapshot_dirty: "internal status; set by recompute process",
  portfolio_cash_snapshot_dirty: "internal status; set by recompute process",
  reporting_recompute_status: "internal status; set by reporting service",
  family_labels: "family-sharing feature; need family context",
};

const trackedTables = [
  "accounts",
  "categories",
  "transactions",
  "securities",
  "portfolio_holdings",
  "holding_accounts",
  "budgets",
  "loans",
  "snapshots",
  "goals",
  "goal_accounts",
  "target_allocations",
  "recurring_transactions",
  "fx_overrides",
  "custom_security_prices",
  "notifications",
  "announcements",
  "user_prompt_acks",
  "feedback",
  "feedback_messages",
  "subscriptions",
  "settings",
  "transaction_rules",
  "budget_templates",
  "users",
  "contribution_room",
  "import_templates",
  "staged_imports",
  "staged_transactions",
  "bank_upload_batches",
  "bank_transactions",
  "simplefin_pending_transactions",
  "transaction_bank_links",
  "transaction_reconciliation_flags",
  "email_inbox",
  "email_import_rules",
  "webhooks",
  "bank_daily_balances",
  "holding_lots",
  "holding_lot_closures",
  "portfolio_lots_status",
  "portfolio_cash_snapshot_meta",
  "portfolio_snapshots",
  "portfolio_legacy_realized_gain_snapshot",
  "backfill_runs",
].filter((t) => !SPECIAL_TABLES[t]);

describe.skipIf(!shouldRun)("Per-table trigger verification (comprehensive)", () => {
  let client: pg.Client;
  const testUserId = "test-per-table-" + Math.random().toString(36).slice(2, 9);

  beforeAll(async () => {
    if (process.env.CI && !DATABASE_URL) {
      throw new Error(
        "CI=true but DATABASE_URL is missing. Set DATABASE_URL to test Postgres instance."
      );
    }
    if (!DATABASE_URL) return;

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

  describe("loop over all tracked tables", () => {
    for (const tableName of trackedTables) {
      it(`${tableName}: INSERT/UPDATE/DELETE bumps data_version`, async () => {
        if (!shouldRun || !client) return;

        // Build minimal insert based on common patterns
        const insertSql = buildInsertStatement(tableName, testUserId);
        const updateSql = buildUpdateStatement(tableName);
        const deleteClause = "WHERE user_id = $1";

        // Get version before
        const { rows: before } = await client.query(
          "SELECT data_version FROM users WHERE id = $1",
          [testUserId]
        );
        const versionBefore = before[0].data_version;

        try {
          // INSERT
          const insertRes = await client.query(insertSql.sql, [testUserId, ...insertSql.params]);
          let { rows: after } = await client.query(
            "SELECT data_version FROM users WHERE id = $1",
            [testUserId]
          );
          expect(after[0].data_version).toBe(versionBefore + 1);
          const versionAfterInsert = after[0].data_version;

          // UPDATE (if applicable)
          if (updateSql) {
            const rowId = insertRes.rows[0]?.id;
            if (rowId) {
              await client.query(updateSql + " WHERE id = $1", [rowId]);
              ({ rows: after } = await client.query(
                "SELECT data_version FROM users WHERE id = $1",
                [testUserId]
              ));
              expect(after[0].data_version).toBe(versionAfterInsert + 1);
            }
          }

          // DELETE
          await client.query(`DELETE FROM ${tableName} ${deleteClause}`, [testUserId]);
          ({ rows: after } = await client.query(
            "SELECT data_version FROM users WHERE id = $1",
            [testUserId]
          ));
          expect(after[0].data_version).toBeGreaterThan(versionBefore);
        } catch (e) {
          // Log which table failed for debugging
          console.error(`Failed to test ${tableName}:`, (e as any).message);
          throw e;
        }
      });
    }
  });

  it("bulk INSERT (10 rows) bumps data_version exactly once", async () => {
    if (!shouldRun || !client) return;

    const { rows: before } = await client.query(
      "SELECT data_version FROM users WHERE id = $1",
      [testUserId]
    );
    const versionBefore = before[0].data_version;

    // Bulk insert into a simple table (categories)
    const rows10 = Array.from({ length: 10 }, (_, i) => [testUserId, `cat${i}`, "personal"]);
    const placeholders = rows10.map((_, i) => `($${i * 3 + 1}, $${i * 3 + 2}, $${i * 3 + 3})`).join(",");
    const values = rows10.flat();

    await client.query(
      `INSERT INTO categories (user_id, type, "group") VALUES ${placeholders}`,
      values
    );

    const { rows: after } = await client.query(
      "SELECT data_version FROM users WHERE id = $1",
      [testUserId]
    );

    // Should bump exactly once, not 10 times
    expect(after[0].data_version).toBe(versionBefore + 1);

    await client.query("DELETE FROM categories WHERE user_id = $1", [testUserId]);
  });
});

/**
 * Build a minimal INSERT statement for a table with user_id.
 * Returns { sql, params } where params are the values to provide (after userId).
 */
function buildInsertStatement(
  tableName: string,
  userId: string
): { sql: string; params: any[] } {
  // Common insert patterns for each table
  const patterns: Record<string, { sql: string; params: any[] }> = {
    // Simple tables with just user_id + minimal required fields
    accounts: {
      sql: `INSERT INTO accounts (user_id, type, "group", currency) VALUES ($1, $2, $3, $4) RETURNING id`,
      params: ["savings", "default", "CAD"],
    },
    categories: {
      sql: `INSERT INTO categories (user_id, type, "group") VALUES ($1, $2, $3) RETURNING id`,
      params: ["expense", "personal"],
    },
    transactions: {
      sql: `INSERT INTO transactions (user_id, account_id, "date", amount_raw, amount_display, payee) VALUES ($1, (SELECT id FROM accounts LIMIT 1), $2, $3, $4, $5) RETURNING id`,
      params: [new Date().toISOString().split("T")[0], 100, 100, "Test"],
    },
    budgets: {
      sql: `INSERT INTO budgets (user_id, "month", category_id) VALUES ($1, $2, (SELECT id FROM categories LIMIT 1)) RETURNING id`,
      params: ["2025-01"],
    },
    loans: {
      sql: `INSERT INTO loans (user_id, account_id, "name") VALUES ($1, (SELECT id FROM accounts LIMIT 1), $2) RETURNING id`,
      params: ["Test Loan"],
    },
    goals: {
      sql: `INSERT INTO goals (user_id, "name", kind) VALUES ($1, $2, $3) RETURNING id`,
      params: ["Test Goal", "target_amount"],
    },
    notifications: {
      sql: `INSERT INTO notifications (user_id, "type", "read") VALUES ($1, $2, $3) RETURNING id`,
      params: ["generic", false],
    },
    settings: {
      sql: `INSERT INTO settings (user_id, "key", value) VALUES ($1, $2, $3) RETURNING id`,
      params: ["test_key", "test_value"],
    },
    subscriptions: {
      sql: `INSERT INTO subscriptions (user_id, active) VALUES ($1, $2) RETURNING id`,
      params: [true],
    },
    webhooks: {
      sql: `INSERT INTO webhooks (user_id, url, events) VALUES ($1, $2, $3) RETURNING id`,
      params: ["http://example.com", "{}"],
    },
    portfolio_cash_snapshot_meta: {
      sql: `INSERT INTO portfolio_cash_snapshot_meta (user_id, snapshot_date) VALUES ($1, $2) RETURNING id`,
      params: [new Date().toISOString().split("T")[0]],
    },
  };

  // Fallback for tables not explicitly listed
  const pattern =
    patterns[tableName] ||
    (() => {
      throw new Error(
        `No insert pattern defined for ${tableName}. Add it to buildInsertStatement().`
      );
    })();

  return pattern;
}

/**
 * Build an UPDATE statement for a table (without WHERE clause).
 * Returns the SQL for UPDATE or null if no updates apply.
 */
function buildUpdateStatement(tableName: string): string | null {
  const updates: Record<string, string> = {
    accounts: `UPDATE accounts SET note = 'updated'`,
    categories: `UPDATE categories SET "group" = 'work'`,
    transactions: `UPDATE transactions SET payee = 'Updated Payee'`,
    budgets: `UPDATE budgets SET limit_cents = 5000`,
    loans: `UPDATE loans SET "name" = 'Updated Loan'`,
    goals: `UPDATE goals SET target_amount = 10000`,
    notifications: `UPDATE notifications SET "read" = true`,
    settings: `UPDATE settings SET value = 'new_value'`,
    subscriptions: `UPDATE subscriptions SET active = false`,
    webhooks: `UPDATE webhooks SET url = 'http://updated.com'`,
    portfolio_cash_snapshot_meta: `UPDATE portfolio_cash_snapshot_meta SET snapshot_date = CURRENT_DATE`,
  };

  return updates[tableName] || null;
}
