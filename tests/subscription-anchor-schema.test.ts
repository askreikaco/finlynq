/**
 * Static gate for 20261014_subscription_anchor_date: migration <-> schema-pg.ts
 * parity and the backup/wipe contract for subscriptions.anchor_date.
 * Pure text checks, no DB.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import path from "path";

const ROOT = path.resolve(__dirname, "..");
const read = (p: string) => readFileSync(path.join(ROOT, p), "utf8");
const MIG = "scripts/migrations/20261014_subscription_anchor_date.sql";
const DOWN = "scripts/migrations/down/20261014_subscription_anchor_date.down.sql";

describe("20261014_subscription_anchor_date", () => {
  const sql = read(MIG);

  it("has a down file and no explicit transaction control", () => {
    expect(existsSync(path.join(ROOT, DOWN))).toBe(true);
    expect(sql).not.toMatch(/^\s*(BEGIN|COMMIT)\b/im);
  });

  it("adds the nullable anchor_date text column (idempotent) declared in schema-pg.ts", () => {
    expect(sql).toContain("ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS anchor_date text;");
    expect(read("src/db/schema-pg.ts")).toContain('anchorDate: text("anchor_date")');
  });

  it("backfills from next_date, only where unset (re-runnable)", () => {
    expect(sql).toContain("UPDATE subscriptions SET anchor_date = next_date WHERE anchor_date IS NULL AND next_date IS NOT NULL;");
  });

  it("down migration drops the column", () => {
    expect(read(DOWN)).toContain("ALTER TABLE subscriptions DROP COLUMN IF EXISTS anchor_date;");
  });
});

describe("where anchor_date is written / read", () => {
  it("export returns whole subscription rows and import never strips anchorDate (round-trips via strip())", () => {
    expect(read("src/app/api/data/export/route.ts")).toContain("schema.subscriptions");
    expect(read("src/app/api/data/import/route.ts")).not.toMatch(/anchorDate/);
  });

  it("creators set it: Repeat creation, POST /api/subscriptions, MCP add + bulk add, sample data", () => {
    expect(read("src/lib/transactions/repeat-subscription.ts")).toContain("anchorDate: plan.anchorDate");
    expect(read("src/app/api/subscriptions/route.ts")).toContain("anchorDate: d.nextDate ?? null");
    const mcp = read("mcp-server/tools/subscriptions.ts");
    expect(mcp.match(/next_date, anchor_date, status/g)).toHaveLength(2);
    expect(read("src/app/api/onboarding/sample-data/route.ts")).toContain("anchorDate: nextDate");
  });

  it("the advance paths pass the anchor through", () => {
    expect(read("src/lib/subscriptions/post-occurrence.ts")).toContain("anchorDate: sub.anchorDate");
    expect(read("src/lib/subscriptions/advance-next-dates.ts")).toContain("s.anchor_date");
    expect(read("src/lib/subscriptions/advance-next-dates.ts")).toContain("anchorDate: r.anchor_date");
    expect(read("src/app/api/subscriptions/route.ts")).toContain("anchorDate: schema.subscriptions.anchorDate");
  });

  it("MCP cadence enum is every SUBSCRIPTION_FREQUENCIES value (+ yearly)", () => {
    expect(read("mcp-server/tools/subscriptions.ts")).toContain('z.enum([...SUBSCRIPTION_FREQUENCIES, "yearly"])');
  });
});
