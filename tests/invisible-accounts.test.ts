/**
 * Invisible accounts (2026-10-07).
 *
 * `accounts.invisible` hides an account from EVERY metric/total (net worth
 * current + history, totals, reports, FX exposure, health score, recap, chat,
 * family overview, MCP + mobile totals) while it stays listed and editable on
 * the Accounts page. Independent of `archived`, which stays IN net worth.
 *
 *   1. Pure: the client-side total helpers skip invisible rows.
 *   2. Schema/migration: column declared in schema-pg, additive idempotent
 *      migration that sorts after every existing one.
 *   3. Static source gates on the money paths — the same approach as
 *      archived-accounts-stay-in-net-worth.test.ts, catching a regression
 *      where one surface stops filtering (or the snapshot BUILDER starts
 *      filtering, which would let the reaper delete stored history).
 */

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import {
  countsInTotals,
  excludeInvisible,
  sumAssetsLiabilities,
} from "@/lib/account-visibility";

const ROOT = join(__dirname, "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

/** Body of `export async function <name>(` up to the next top-level `export`. */
function fnBody(src: string, name: string): string {
  const start = src.indexOf(`export async function ${name}(`);
  expect(start, `${name} not found — was it renamed?`).toBeGreaterThan(-1);
  const after = src.slice(start + 1);
  const end = after.indexOf("\nexport ");
  return end === -1 ? after : after.slice(0, end);
}

describe("account-visibility helpers (pure)", () => {
  const rows = [
    { accountType: "A", invisible: false, v: 1000 },
    { accountType: "A", invisible: true, v: 50000 },
    { accountType: "A", v: 250 }, // older payload without the field → counted
    { accountType: "L", invisible: false, v: -300 },
    { accountType: "L", invisible: true, v: -9999 },
    { accountType: "A", invisible: null, v: 5 },
  ];

  it("countsInTotals only drops rows explicitly flagged invisible", () => {
    expect(rows.map(countsInTotals)).toEqual([true, false, true, true, false, true]);
  });

  it("excludeInvisible filters without mutating", () => {
    const out = excludeInvisible(rows);
    expect(out.map((r) => r.v)).toEqual([1000, 250, -300, 5]);
    expect(rows).toHaveLength(6);
  });

  it("sumAssetsLiabilities excludes invisible accounts from assets, liabilities and net worth", () => {
    const t = sumAssetsLiabilities(rows, (r) => r.v);
    expect(t.totalAssets).toBe(1255);
    expect(t.totalLiabilities).toBe(-300);
    expect(t.netWorth).toBe(955);
  });

  it("an archived (but visible) account still counts — archived is independent", () => {
    const t = sumAssetsLiabilities(
      [{ accountType: "A", archived: true, invisible: false, v: 42 }],
      (r) => r.v,
    );
    expect(t.netWorth).toBe(42);
  });
});

describe("schema + migration", () => {
  it("schema-pg declares accounts.invisible NOT NULL DEFAULT false", () => {
    const schema = read("src/db/schema-pg.ts");
    const block = schema.slice(schema.indexOf('pgTable("accounts"'), schema.indexOf('pgTable("categories"'));
    expect(block).toContain('invisible: boolean("invisible").notNull().default(false)');
  });

  it("migration is additive, idempotent, has no BEGIN/COMMIT, and sorts last", () => {
    const dir = join(ROOT, "scripts/migrations");
    const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
    const name = "20261007_reika_account_invisible.sql";
    expect(files).toContain(name);
    expect(files[files.length - 1]).toBe(name);
    const code = read(`scripts/migrations/${name}`).replace(/--.*$/gm, "");
    expect(code).toMatch(/ALTER TABLE accounts\s+ADD COLUMN IF NOT EXISTS invisible BOOLEAN NOT NULL DEFAULT false/i);
    expect(code).not.toMatch(/\b(DROP|DELETE|TRUNCATE|BEGIN|COMMIT)\b/i);
  });
});

describe("invisible accounts never reach a metric (static gates)", () => {
  const queries = read("src/lib/queries.ts");

  it("getAccountBalances excludes invisible by default and selects the flag", () => {
    const body = fnBody(queries, "getAccountBalances");
    expect(body).toContain("if (!opts?.includeInvisible) conditions.push(eq(accounts.invisible, false))");
    expect(body).toContain("invisible: accounts.invisible");
  });

  it("the aggregate snapshot readers skip invisible accounts (accountId-scoped reads do not)", () => {
    for (const name of ["getInvestmentSnapshotsInRange", "getCashSnapshotsInRange"]) {
      const body = fnBody(queries, name);
      const elseBranch = body.slice(body.indexOf("} else {"));
      expect(elseBranch, name).toContain("eq(accounts.invisible, false)");
      const scoped = body.slice(0, body.indexOf("} else {"));
      expect(scoped, name).not.toContain("invisible");
    }
  });

  it("the snapshot BUILDER inputs + fingerprint still cover invisible accounts (history survives a toggle)", () => {
    for (const name of ["getCashDailyDeltas", "getCashDailyDeltasByAccount", "getCashTxFingerprint"]) {
      expect(fnBody(queries, name), name).not.toContain("accounts.invisible");
    }
  });

  it("getNetWorthOverTime filters invisible accounts", () => {
    expect(fnBody(queries, "getNetWorthOverTime")).toContain("accounts.invisible");
  });

  it("list-shaped payloads include invisible rows, and their consumers skip them in totals", () => {
    expect(read("src/app/api/dashboard/route.ts")).toMatch(/includeInvisible: true/);
    expect(read("src/app/(app)/dashboard/page.tsx")).toMatch(/sumAssetsLiabilities\(\s*balances/);
    expect(read("src/app/(app)/accounts/page.tsx")).toContain("excludeInvisible(accounts)");
    expect(read("mobile/src/api/client.ts")).toMatch(/filter\(\(b\) => b\.invisible !== true\)/);
    expect(read("mobile/src/screens/AccountsScreen.tsx")).toMatch(/b\.invisible !== true/);
  });

  it("net-worth history drops invisible accounts on the whole-portfolio series only", () => {
    const route = read("src/app/api/net-worth-history/route.ts");
    expect(route).toMatch(/includeInvisible: true/);
    expect(route).toContain("accountId != null ? allBalances : allBalances.filter((b) => !b.invisible)");
  });

  it("reconcile summary keeps invisible accounts (bookkeeping, not a metric)", () => {
    expect(read("src/app/api/reconcile/summary/route.ts")).toContain(
      "getAccountBalances(userId, { includeInvisible: true })",
    );
  });

  it("hand-written net-worth / balance SQL filters invisible accounts", () => {
    const health = read("src/lib/financial-health.ts");
    expect((health.match(/a\.invisible = false/g) ?? []).length).toBeGreaterThanOrEqual(4);
    expect(read("src/lib/weekly-recap.ts")).toContain("accounts.invisible");
    expect(read("src/lib/chat-engine.ts")).toContain("eq(schema.accounts.invisible, false)");
    const reads = read("mcp-server/tools/reads.ts");
    expect(reads).toContain("AND a.invisible = false");
    expect(reads).toContain("invisible: isInvisible(i)");
    expect(read("mcp-server/register-core-tools.ts")).toContain("a.invisible = false");
    expect(read("mcp-server/tools/portfolio.ts")).toContain("a.invisible = false");
  });

  it("write paths accept the flag (REST + MCP manage_accounts)", () => {
    const route = read("src/app/api/accounts/route.ts");
    expect((route.match(/invisible: z\.boolean\(\)\.optional\(\)/g) ?? []).length).toBe(2);
    const mcp = read("mcp-server/tools/accounts.ts");
    expect((mcp.match(/invisible: z\.boolean\(\)\.optional\(\)/g) ?? []).length).toBe(2);
    expect(mcp).toContain("updates.push(sql`invisible = ${invisible}`)");
  });
});
