/**
 * Static gate for 20261013_subscription_post_idempotency: migration <-> schema-pg.ts
 * parity + the backup/read contract for transactions.occurrence_date.
 * Pure text checks (no DATABASE_URL in CI for this suite).
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import path from "path";

const ROOT = path.resolve(__dirname, "..");
const read = (p: string) => readFileSync(path.join(ROOT, p), "utf8");
const MIG = "scripts/migrations/20261013_subscription_post_idempotency.sql";
const DOWN = "scripts/migrations/down/20261013_subscription_post_idempotency.down.sql";

describe("20261013_subscription_post_idempotency", () => {
  const sql = read(MIG);
  const schema = read("src/db/schema-pg.ts");

  it("has a down file and no explicit transaction control", () => {
    expect(existsSync(path.join(ROOT, DOWN))).toBe(true);
    expect(sql).not.toMatch(/^\s*(BEGIN|COMMIT)\b/im);
  });

  it("is idempotent (IF NOT EXISTS everywhere)", () => {
    for (const line of sql.split("\n").filter((l) => /^(ALTER|CREATE)/.test(l))) {
      expect(line).toMatch(/IF NOT EXISTS/);
    }
  });

  it("adds the nullable occurrence_date text column declared in schema-pg.ts", () => {
    expect(sql).toContain("ALTER TABLE transactions ADD COLUMN IF NOT EXISTS occurrence_date text;");
    expect(schema).toContain('occurrenceDate: text("occurrence_date")');
  });

  it("creates the partial UNIQUE index (user, subscription, occurrence) in both places", () => {
    expect(sql).toContain(
      "CREATE UNIQUE INDEX IF NOT EXISTS uniq_transactions_subscription_occurrence ON transactions (user_id, subscription_id, occurrence_date) WHERE subscription_id IS NOT NULL AND occurrence_date IS NOT NULL;",
    );
    expect(schema).toContain('uniqueIndex("uniq_transactions_subscription_occurrence").on(t.userId, t.subscriptionId, t.occurrenceDate)');
    expect(schema).toContain("(subscription_id IS NOT NULL AND occurrence_date IS NOT NULL)");
  });

  it("the route maps exactly this index name to already_posted", () => {
    expect(read("src/lib/subscriptions/post-occurrence.ts")).toContain('"uniq_transactions_subscription_occurrence"');
  });

  it("down migration drops the index then the column", () => {
    const down = read(DOWN);
    expect(down).toContain("DROP INDEX IF EXISTS uniq_transactions_subscription_occurrence;");
    expect(down).toContain("DROP COLUMN IF EXISTS occurrence_date;");
    expect(down.indexOf("DROP INDEX")).toBeLessThan(down.indexOf("DROP COLUMN"));
  });
});

describe("backup / read contract", () => {
  it("export returns whole rows, so occurrence_date is exported", () => {
    expect(read("src/app/api/data/export/route.ts")).toContain("db.select().from(schema.transactions)");
  });

  it("import round-trips occurrenceDate via ...rest (never destructured away) and re-links subscriptionId", () => {
    const imp = read("src/app/api/data/import/route.ts");
    expect(imp).not.toMatch(/occurrenceDate/);
    expect(imp).toContain("subscriptionId: _rawSubId");
  });

  it("GET /api/transactions rows carry occurrenceDate", () => {
    expect(read("src/lib/queries.ts")).toContain("occurrenceDate: transactions.occurrenceDate");
  });

  it("'ended' is a valid subscription status in the API and MCP tools", () => {
    expect(read("src/app/api/subscriptions/route.ts")).toContain('["active", "paused", "cancelled", "ended"]');
    expect(read("mcp-server/tools/subscriptions.ts")).toContain('z.enum(["active", "paused", "cancelled", "ended"])');
  });
});
