/**
 * Static gate for 20261012_txn_series: migration <-> schema-pg.ts parity and
 * the backup/wipe contract for the new transactions / subscriptions columns.
 * Pure text checks, no DB.
 *
 *  - export: `select().from(schema.transactions)` / `schema.subscriptions`
 *    returns every column, so installment_group_id, installment_seq,
 *    subscription_id, end_date and remaining_count are exported as-is.
 *  - import: installment_* and the subscription end fields round-trip through
 *    `...rest`; `subscriptionId` is the ONE excluded-on-insert column (it is an
 *    FK to subscriptions, restored after transactions with fresh ids) and is
 *    re-linked from the old->new subscription id map.
 *  - wipe: subscriptions are deleted in deleteAllUserDataTx; the FK is
 *    ON DELETE SET NULL, so no transaction row is orphaned or blocks the wipe.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import path from "path";

const ROOT = path.resolve(__dirname, "..");
const read = (p: string) => readFileSync(path.join(ROOT, p), "utf8");
const MIG = "scripts/migrations/20261012_txn_series.sql";

describe("20261012_txn_series", () => {
  const sql = read(MIG);
  const schema = read("src/db/schema-pg.ts");

  it("has a down file and no explicit transaction control", () => {
    expect(existsSync(path.join(ROOT, "scripts/migrations/down/20261012_txn_series.down.sql"))).toBe(true);
    expect(sql).not.toMatch(/^\s*(BEGIN|COMMIT)\b/im);
  });

  it("is idempotent (IF NOT EXISTS everywhere)", () => {
    for (const line of sql.split("\n").filter((l) => /^(ALTER|CREATE)/.test(l))) {
      expect(line).toMatch(/IF NOT EXISTS/);
    }
  });

  it("creates the columns schema-pg.ts declares", () => {
    for (const [col, decl] of [
      ["installment_group_id text", 'text("installment_group_id")'],
      ["installment_seq smallint", 'smallint("installment_seq")'],
      ["subscription_id integer REFERENCES subscriptions(id) ON DELETE SET NULL", 'integer("subscription_id")'],
      ["end_date text", 'text("end_date")'],
      ["remaining_count integer", 'integer("remaining_count")'],
    ] as const) {
      expect(sql).toContain(col);
      expect(schema).toContain(decl);
    }
    expect(schema).toMatch(/subscriptionId: integer\("subscription_id"\)\.references\(\(\) => subscriptions\.id, \{ onDelete: "set null" \}\)/);
  });

  it("creates partial indexes declared in schema-pg.ts", () => {
    for (const name of ["idx_transactions_installment_group", "idx_transactions_subscription_id"]) {
      expect(sql).toContain(`CREATE INDEX IF NOT EXISTS ${name}`);
      expect(schema).toContain(`index("${name}")`);
    }
    expect(sql).toContain("WHERE installment_group_id IS NOT NULL");
    expect(sql).toContain("WHERE subscription_id IS NOT NULL");
  });
});

describe("backup / wipe contract", () => {
  it("export returns whole rows (no column allow-list that would drop the new columns)", () => {
    const exp = read("src/app/api/data/export/route.ts");
    expect(exp).toContain("db.select().from(schema.transactions)");
    expect(exp).toContain("db.select().from(schema.subscriptions)");
  });

  it("import drops subscriptionId on insert and re-links it from the new subscription ids", () => {
    const imp = read("src/app/api/data/import/route.ts");
    expect(imp).toContain("subscriptionId: _rawSubId");
    expect(imp).toContain("subIdMap");
    expect(imp).toMatch(/\.set\(\{ subscriptionId: newSub \}\)/);
    // installment_* ride along via ...rest (never destructured away)
    expect(imp).not.toMatch(/installmentGroupId|installmentSeq/);
  });

  it("deleteAllUserDataTx removes subscriptions (FK is SET NULL)", () => {
    expect(read("src/lib/auth/queries.ts")).toContain("tx.delete(s.subscriptions)");
  });
});
