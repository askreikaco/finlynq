/** Static gate for 20261015_txn_idempotency_key: migration <-> schema-pg.ts parity. */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import path from "path";

const ROOT = path.resolve(__dirname, "..");
const read = (p: string) => readFileSync(path.join(ROOT, p), "utf8");
const MIG = "scripts/migrations/20261015_txn_idempotency_key.sql";
const DOWN = "scripts/migrations/down/20261015_txn_idempotency_key.down.sql";

describe("20261015_txn_idempotency_key", () => {
  const sql = read(MIG);
  const schema = read("src/db/schema-pg.ts");
  it("has a down file, no tx control, is idempotent", () => {
    expect(existsSync(path.join(ROOT, DOWN))).toBe(true);
    expect(sql).not.toMatch(/^\s*(BEGIN|COMMIT)\b/im);
    for (const line of sql.split("\n").filter((l) => /^(ALTER|CREATE)/.test(l))) expect(line).toMatch(/IF NOT EXISTS/);
  });
  it("adds nullable idempotency_key text + partial unique (user_id, key) index, mirrored in schema-pg.ts", () => {
    expect(sql).toContain("ALTER TABLE transactions ADD COLUMN IF NOT EXISTS idempotency_key text;");
    expect(sql).toContain(
      "CREATE UNIQUE INDEX IF NOT EXISTS uniq_transactions_idempotency_key ON transactions (user_id, idempotency_key) WHERE idempotency_key IS NOT NULL;",
    );
    expect(schema).toContain('idempotencyKey: text("idempotency_key")');
    expect(schema).toContain('uniqueIndex("uniq_transactions_idempotency_key").on(t.userId, t.idempotencyKey)');
    expect(schema).toContain("(idempotency_key IS NOT NULL)");
  });
  it("the route uses this exact index name", () => {
    expect(read("src/app/api/transactions/route.ts")).toContain('"uniq_transactions_idempotency_key"');
  });
});
