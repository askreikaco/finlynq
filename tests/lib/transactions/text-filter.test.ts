/**
 * P3 tests: server-side encrypted-text filter (src/lib/transactions/text-filter.ts).
 *
 * No database. '@/db' is replaced by a small in-memory fake that renders each
 * WHERE clause with PgDialect and evaluates only the owner (user_id / id) and
 * `= ANY(array)` id predicates. Real AES-GCM is used for the decrypt paths.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { SQL } from "drizzle-orm";

const fake = vi.hoisted(() => ({
  store: new Map<string, Array<Record<string, unknown>>>(),
  selects: 0,
  lastWhere: null as null | { sql: string; params: unknown[] },
}));
const flag = vi.hoisted(() => ({ on: false }));

vi.mock("@/db", async () => {
  const schemaPg = await vi.importActual<typeof import("@/db/schema-pg")>("@/db/schema-pg");
  const { PgDialect: Dialect } = await vi.importActual<typeof import("drizzle-orm/pg-core")>("drizzle-orm/pg-core");
  const { getTableName } = await vi.importActual<typeof import("drizzle-orm")>("drizzle-orm");
  const dialect = new Dialect();

  function evaluate(tableName: string, expr: SQL): Array<Record<string, unknown>> {
    const q = dialect.sqlToQuery(expr);
    fake.lastWhere = { sql: q.sql, params: q.params };
    fake.selects += 1;
    const rows = fake.store.get(tableName) ?? [];
    return rows.filter((r) => {
      const owner = tableName === "users" ? r.id : r.userId;
      if (owner !== undefined && !q.params.includes(owner)) return false;
      for (const p of q.params) {
        if (Array.isArray(p) && !p.includes(r.id)) return false;
      }
      return true;
    });
  }

  const db = {
    select: () => {
      let tableName = "";
      let joined = false;
      const builder: Record<string, unknown> = {
        from(t: unknown) {
          tableName = getTableName(t as never);
          return builder;
        },
        leftJoin() {
          joined = true;
          return builder;
        },
        where(expr: SQL) {
          const run = () => {
            const rows = evaluate(tableName, expr);
            if (!joined) return rows;
            const secs = fake.store.get("securities") ?? [];
            return rows.map((r) => ({
              ...r,
              securityNameCt: secs.find((s) => s.id === r.securityId)?.nameCt ?? null,
            }));
          };
          return {
            then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
              Promise.resolve().then(run).then(res, rej),
            get: () => Promise.resolve().then(run).then((r) => r[0]),
          };
        },
      };
      return builder;
    },
  };
  return { db, schema: schemaPg, getDialect: () => "postgres" };
});

vi.mock("@/lib/securities/flag", () => ({
  securitiesReadEnabledForUser: vi.fn(async () => flag.on),
}));

import { SCENARIOS, EXPECTED_DIVERGENCES, type TxScenario } from "../../helpers/tx-paging-scenarios";
import { oracleFilterSort } from "../../helpers/tx-client-oracle";
import { buildTxPagingFixture } from "../../helpers/tx-paging-fixture";
import {
  matchTxText,
  resolveTextFilterIds,
  resolveAccountTextIds,
  resolveHoldingTextIds,
  clearTextFilterMemo,
  textFilterMemoSize,
  TEXT_FILTER_MEMO_TTL_MS,
  TEXT_FILTER_MEMO_MAX_ENTRIES,
  type TxTextNeedles,
} from "@/lib/transactions/text-filter";
import { encryptField, generateDEK } from "@/lib/crypto/envelope";
import { encryptName } from "@/lib/crypto/encrypted-columns";

const USER_A = "user-a";
const USER_B = "user-b";
const row = (over: Record<string, unknown> = {}) => ({
  payee: "Metro",
  note: "weekly shop",
  tags: "food,weekly",
  amount: -45,
  ...over,
});
const plain = (needles: TxTextNeedles) => ({ ...needles, hasDek: true });

beforeEach(() => {
  fake.store.clear();
  fake.selects = 0;
  fake.lastWhere = null;
  flag.on = false;
  clearTextFilterMemo();
});

afterEach(() => {
  vi.useRealTimers();
});

// ─── matchTxText: plan 2.5 rules ─────────────────────────────────────────────

describe("matchTxText", () => {
  it("search matches payee, note, tags and the amount string (2.5 a)", () => {
    expect(matchTxText(row(), plain({ search: "metro" }))).toBe(true);
    expect(matchTxText(row(), plain({ search: "weekly shop" }))).toBe(true);
    expect(matchTxText(row(), plain({ search: "food" }))).toBe(true);
    expect(matchTxText(row({ payee: "X", note: "", tags: "" }), plain({ search: "45" }))).toBe(true);
    expect(matchTxText(row(), plain({ search: "zzz" }))).toBe(false);
  });

  it("search trims the needle before matching (2.5 a)", () => {
    expect(matchTxText(row(), plain({ search: "  weekly  " }))).toBe(true);
    expect(matchTxText(row(), plain({ search: "\tmetro\n" }))).toBe(true);
  });

  it("search is case-insensitive", () => {
    expect(matchTxText(row(), plain({ search: "METRO" }))).toBe(true);
  });

  it("an empty or whitespace-only needle is a no-op", () => {
    expect(matchTxText(row(), plain({ search: "   " }))).toBe(true);
    expect(matchTxText(row(), plain({ tag: "" }))).toBe(true);
    expect(matchTxText(row(), plain({}))).toBe(true);
  });

  it("tag is an exact token match, not substring (2.5 b)", () => {
    expect(matchTxText(row({ tags: "food,weekly" }), plain({ tag: "food" }))).toBe(true);
    expect(matchTxText(row({ tags: "seafood" }), plain({ tag: "food" }))).toBe(false);
    expect(matchTxText(row({ tags: "fees,travel" }), plain({ tag: "fee" }))).toBe(false);
  });

  it("tag is case-insensitive (2.5 b)", () => {
    expect(matchTxText(row({ tags: "food" }), plain({ tag: "FOOD" }))).toBe(true);
  });

  it("tag comma list is OR across tokens and trims each token (2.5 b)", () => {
    expect(matchTxText(row({ tags: "invest" }), plain({ tag: "salary, invest" }))).toBe(true);
    expect(matchTxText(row({ tags: "salary" }), plain({ tag: "salary, invest" }))).toBe(true);
    expect(matchTxText(row({ tags: "fees" }), plain({ tag: "salary, invest" }))).toBe(false);
  });

  it("filter_payee is a case-insensitive substring on payee (2.1)", () => {
    expect(matchTxText(row({ payee: "Metro Market" }), plain({ payee: "metro" }))).toBe(true);
    expect(matchTxText(row({ payee: "Acme" }), plain({ payee: "metro" }))).toBe(false);
  });

  it("filter_note is a case-insensitive substring on note (2.1)", () => {
    expect(matchTxText(row({ note: "fee waiver" }), plain({ note: "fee" }))).toBe(true);
    expect(matchTxText(row({ note: "bonus" }), plain({ note: "fee" }))).toBe(false);
  });

  it("filter_tags is a substring on the raw tags string (2.1)", () => {
    expect(matchTxText(row({ tags: "food,fees" }), plain({ tags: "fees" }))).toBe(true);
    expect(matchTxText(row({ tags: "fees,travel" }), plain({ tags: "fee" }))).toBe(true);
    expect(matchTxText(row({ tags: "salary" }), plain({ tags: "fee" }))).toBe(false);
  });

  it("every present needle must match (AND across needles)", () => {
    const r = row({ payee: "Metro", tags: "food" });
    expect(matchTxText(r, plain({ payee: "metro", tag: "food" }))).toBe(true);
    expect(matchTxText(r, plain({ payee: "metro", tag: "salary" }))).toBe(false);
  });

  it("null and missing values read as empty and never throw", () => {
    expect(matchTxText({ payee: null, note: null, tags: null, amount: null }, plain({ search: "x" }))).toBe(false);
    expect(matchTxText({ payee: null, note: null, tags: null, amount: null }, plain({ tag: "x" }))).toBe(false);
  });

  it("no DEK: ciphertext (v1:) never matches, even for a search for 'v1'", () => {
    const ct = "v1:AAAA:BBBB:CCCC";
    const r = { payee: ct, note: ct, tags: ct, amount: -45 };
    expect(matchTxText(r, { search: "v1" })).toBe(false);
    expect(matchTxText(r, { search: "v1:" })).toBe(false);
    expect(matchTxText(r, { payee: "v1" })).toBe(false);
    expect(matchTxText(r, { note: "v1" })).toBe(false);
    expect(matchTxText(r, { tags: "v1" })).toBe(false);
    expect(matchTxText(r, { tag: "v1:AAAA:BBBB:CCCC" })).toBe(false);
  });

  it("no DEK: a ciphertext field fails its own needle but plaintext fields still match", () => {
    const ct = "v1:AAAA:BBBB:CCCC";
    expect(matchTxText({ payee: ct, note: "weekly shop", tags: null, amount: 0 }, { search: "weekly" })).toBe(true);
    expect(matchTxText({ payee: ct, note: "weekly shop", tags: null, amount: 0 }, { payee: "weekly" })).toBe(false);
  });
});

// ─── real crypto through resolveTextFilterIds ────────────────────────────────

describe("resolveTextFilterIds with encrypted rows", () => {
  it("decrypts payee/note/tags with the DEK and matches on plaintext", async () => {
    const dek = generateDEK();
    fake.store.set("transactions", [
      { id: 1, userId: USER_A, payee: encryptField(dek, "Metro"), note: encryptField(dek, "weekly"), tags: encryptField(dek, "food"), amount: -10 },
      { id: 2, userId: USER_A, payee: encryptField(dek, "Acme"), note: null, tags: encryptField(dek, "fees"), amount: -20 },
    ]);
    const ids = await resolveTextFilterIds({
      userId: USER_A, dek, sqlFilters: {}, needles: { search: "metro" }, dataVersion: 1,
    });
    expect(ids).toEqual([1]);
  });

  it("no DEK: ciphertext rows never match a 'v1' search; legacy plaintext rows still do", async () => {
    const dek = generateDEK();
    expect(encryptField(dek, "x")!.startsWith("v1:")).toBe(true);
    fake.store.set("transactions", [
      { id: 1, userId: USER_A, payee: encryptField(dek, "Metro"), note: null, tags: null, amount: -10 },
      { id: 2, userId: USER_A, payee: "Legacy Metro", note: null, tags: null, amount: -10 },
    ]);
    const ids = await resolveTextFilterIds({
      userId: USER_A, dek: null, sqlFilters: {}, needles: { search: "v1" }, dataVersion: 1,
    });
    expect(ids).toEqual([]);
    const legacy = await resolveTextFilterIds({
      userId: USER_A, dek: null, sqlFilters: {}, needles: { payee: "metro" }, dataVersion: 1,
    });
    expect(legacy).toEqual([2]);
  });

  it("a failed decrypt (wrong DEK) is never matched as ciphertext", async () => {
    const dek = generateDEK();
    const other = generateDEK();
    fake.store.set("transactions", [
      { id: 1, userId: USER_A, payee: encryptField(dek, "v1 stuff"), note: null, tags: null, amount: 1 },
    ]);
    const ids = await resolveTextFilterIds({
      userId: USER_A, dek: other, sqlFilters: {}, needles: { search: "v1" }, dataVersion: 1,
    });
    expect(ids).toEqual([]);
  });

  it("pushes SQL filters through buildTxFilterConditions, drops paging fields, applies no limit", async () => {
    fake.store.set("transactions", [{ id: 1, userId: USER_A, payee: "Metro", note: null, tags: null, amount: 1 }]);
    await resolveTextFilterIds({
      userId: USER_A, dek: null,
      sqlFilters: { startDate: "2026-01-01", limit: 5, offset: 3, cursor: undefined } as never,
      needles: { payee: "metro" }, dataVersion: 1,
    });
    const w = fake.lastWhere!;
    expect(w.sql).toContain('"transactions"."user_id"');
    expect(w.sql).toContain('"transactions"."date" >=');
    expect(w.params).toContain("2026-01-01");
    expect(w.params).not.toContain(5);
    expect(w.params).not.toContain(3);
    expect(w.sql).not.toMatch(/limit|offset/i);
  });

  it("empty match returns an empty id list", async () => {
    fake.store.set("transactions", [{ id: 1, userId: USER_A, payee: "Acme", note: null, tags: null, amount: 1 }]);
    const ids = await resolveTextFilterIds({
      userId: USER_A, dek: null, sqlFilters: {}, needles: { payee: "metro" }, dataVersion: 1,
    });
    expect(ids).toEqual([]);
  });
});

// ─── memo ────────────────────────────────────────────────────────────────────

describe("resolveTextFilterIds memo", () => {
  const seed = () =>
    fake.store.set("transactions", [
      { id: 1, userId: USER_A, payee: "Metro", note: null, tags: null, amount: 1 },
      { id: 2, userId: USER_A, payee: "Acme", note: null, tags: null, amount: 1 },
      { id: 3, userId: USER_B, payee: "Metro", note: null, tags: null, amount: 1 },
    ]);
  const call = (userId: string, dv: number, needles: Record<string, string> = { payee: "metro" }, dek: Buffer | null = null) =>
    resolveTextFilterIds({ userId, dek, sqlFilters: {}, needles, dataVersion: dv });

  it("miss then hit: second identical call does not query the database", async () => {
    seed();
    expect(await call(USER_A, 1)).toEqual([1]);
    expect(fake.selects).toBe(1);
    expect(await call(USER_A, 1)).toEqual([1]);
    expect(fake.selects).toBe(1);
  });

  it("returns a copy: mutating a result does not poison the memo", async () => {
    seed();
    const first = await call(USER_A, 1);
    first.push(999);
    expect(await call(USER_A, 1)).toEqual([1]);
  });

  it("different needles or DEK state are separate memo entries", async () => {
    seed();
    await call(USER_A, 1);
    await call(USER_A, 1, { payee: "acme" });
    expect(fake.selects).toBe(2);
    await call(USER_A, 1, { payee: "metro" }, generateDEK());
    expect(fake.selects).toBe(3);
  });

  it("expires after 60s", async () => {
    seed();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-09T00:00:00Z"));
    await call(USER_A, 1);
    vi.setSystemTime(new Date(Date.parse("2026-10-09T00:00:00Z") + TEXT_FILTER_MEMO_TTL_MS - 1));
    await call(USER_A, 1);
    expect(fake.selects).toBe(1);
    vi.setSystemTime(new Date(Date.parse("2026-10-09T00:00:00Z") + TEXT_FILTER_MEMO_TTL_MS));
    await call(USER_A, 1);
    expect(fake.selects).toBe(2);
  });

  it("per-user isolation: user B never receives user A's cached ids", async () => {
    seed();
    expect(await call(USER_A, 1)).toEqual([1]);
    expect(await call(USER_B, 1)).toEqual([3]);
    expect(fake.selects).toBe(2);
  });

  it("invalidates when dataVersion changes", async () => {
    seed();
    await call(USER_A, 1);
    fake.store.set("transactions", [
      { id: 1, userId: USER_A, payee: "Acme", note: null, tags: null, amount: 1 },
      { id: 2, userId: USER_A, payee: "Metro", note: null, tags: null, amount: 1 },
    ]);
    expect(await call(USER_A, 2)).toEqual([2]);
    expect(fake.selects).toBe(2);
    // old-version entry for this user was dropped on the bump
    expect(textFilterMemoSize()).toBe(1);
  });

  it("uses getDataVersion when no dataVersion is passed", async () => {
    seed();
    fake.store.set("users", [{ id: USER_A, dataVersion: 7 }]);
    const ids = await resolveTextFilterIds({ userId: USER_A, dek: null, sqlFilters: {}, needles: { payee: "metro" } });
    expect(ids).toEqual([1]);
    const before = fake.selects;
    await resolveTextFilterIds({ userId: USER_A, dek: null, sqlFilters: {}, needles: { payee: "metro" } });
    expect(fake.selects).toBe(before + 1); // only the users version read; the match is memoised
    fake.store.set("users", [{ id: USER_A, dataVersion: 8 }]);
    await resolveTextFilterIds({ userId: USER_A, dek: null, sqlFilters: {}, needles: { payee: "metro" } });
    expect(fake.selects).toBe(before + 3); // version read + transactions query again
  });

  it("caps the memo at the max entry count (LRU)", async () => {
    seed();
    for (let i = 0; i < TEXT_FILTER_MEMO_MAX_ENTRIES + 5; i++) {
      await call(USER_A, 1, { payee: `needle${i}` });
    }
    expect(textFilterMemoSize()).toBe(TEXT_FILTER_MEMO_MAX_ENTRIES);
  });
});

// ─── account / holding id resolution ─────────────────────────────────────────

describe("resolveAccountTextIds", () => {
  it("matches decrypted name or alias, returns the id set", async () => {
    const dek = generateDEK();
    fake.store.set("accounts", [
      { id: 1, userId: USER_A, nameCt: encryptName(dek, "Chequing").ct, aliasCt: encryptName(dek, "CHQ").ct },
      { id: 2, userId: USER_A, nameCt: encryptName(dek, "Savings").ct, aliasCt: null },
      { id: 3, userId: USER_A, nameCt: encryptName(dek, "Brokerage").ct, aliasCt: encryptName(dek, "BRK").ct },
      { id: 4, userId: USER_B, nameCt: encryptName(dek, "Chequing other").ct, aliasCt: null },
    ]);
    expect(await resolveAccountTextIds({ userId: USER_A, dek, needle: "chequ" })).toEqual([1]);
    expect(await resolveAccountTextIds({ userId: USER_A, dek, needle: "  brk " })).toEqual([3]);
    expect(await resolveAccountTextIds({ userId: USER_A, dek, needle: "chequ", fields: ["alias"] })).toEqual([]);
  });

  it("no DEK, empty needle, or no match returns an empty id set", async () => {
    const dek = generateDEK();
    fake.store.set("accounts", [{ id: 1, userId: USER_A, nameCt: encryptName(dek, "Chequing").ct, aliasCt: null }]);
    expect(await resolveAccountTextIds({ userId: USER_A, dek: null, needle: "chequ" })).toEqual([]);
    expect(await resolveAccountTextIds({ userId: USER_A, dek, needle: "   " })).toEqual([]);
    expect(await resolveAccountTextIds({ userId: USER_A, dek, needle: "nomatch" })).toEqual([]);
  });
});

describe("resolveHoldingTextIds", () => {
  const seedHoldings = (dek: Buffer) => {
    fake.store.set("securities", [
      { id: 50, userId: USER_A, nameCt: encryptName(dek, "Cash USD").ct },
    ]);
    fake.store.set("portfolio_holdings", [
      { id: 10, userId: USER_A, nameCt: encryptName(dek, "Apple Inc").ct, securityId: null },
      { id: 11, userId: USER_A, nameCt: encryptName(dek, "Vanguard Growth ETF").ct, securityId: 50 },
      { id: 12, userId: USER_B, nameCt: encryptName(dek, "Apple Inc").ct, securityId: null },
    ]);
  };

  it("matches the holding name", async () => {
    const dek = generateDEK();
    seedHoldings(dek);
    expect(await resolveHoldingTextIds({ userId: USER_A, dek, needle: "apple" })).toEqual([10]);
  });

  it("also matches the linked security name only when the securities read flag is on", async () => {
    const dek = generateDEK();
    seedHoldings(dek);
    flag.on = false;
    expect(await resolveHoldingTextIds({ userId: USER_A, dek, needle: "cash" })).toEqual([]);
    flag.on = true;
    expect(await resolveHoldingTextIds({ userId: USER_A, dek, needle: "cash" })).toEqual([11]);
  });

  it("no DEK, empty needle, or no match returns an empty id set", async () => {
    const dek = generateDEK();
    seedHoldings(dek);
    expect(await resolveHoldingTextIds({ userId: USER_A, dek: null, needle: "apple" })).toEqual([]);
    expect(await resolveHoldingTextIds({ userId: USER_A, dek, needle: "" })).toEqual([]);
    expect(await resolveHoldingTextIds({ userId: USER_A, dek, needle: "tesla" })).toEqual([]);
  });
});

// ─── parity with the client oracle (P1 scenario matrix) ──────────────────────

const TEXT_COLS = ["payee", "note", "tags"] as const;

function needlesOf(s: TxScenario): Omit<TxTextNeedles, "hasDek"> {
  const f = s.filters as Record<string, unknown>;
  const out: Omit<TxTextNeedles, "hasDek"> = {};
  if (typeof f.search === "string" && f.search) out.search = f.search;
  if (typeof f.tag === "string" && f.tag) out.tag = f.tag;
  for (const cf of s.colFilters ?? []) {
    const c = cf as unknown as { type?: string; columnId?: string; value?: unknown };
    if (c.type === "text" && c.columnId && (TEXT_COLS as readonly string[]).includes(c.columnId)) {
      out[c.columnId as "payee" | "note" | "tags"] = String(c.value ?? "");
    }
  }
  return out;
}

function withoutTextFilters(s: TxScenario): Pick<TxScenario, "filters" | "colFilters"> {
  const filters = { ...(s.filters as Record<string, unknown>) };
  delete filters.search;
  delete filters.tag;
  const colFilters = (s.colFilters ?? []).filter((cf) => {
    const c = cf as unknown as { type?: string; columnId?: string };
    return !(c.type === "text" && c.columnId && (TEXT_COLS as readonly string[]).includes(c.columnId));
  });
  return { filters: filters as TxScenario["filters"], colFilters };
}

describe("matchTxText vs client oracle (text-filter scenarios)", () => {
  const ROWS = buildTxPagingFixture();
  const textScenarios = SCENARIOS.filter((s) => Object.keys(needlesOf(s)).length > 0);
  const divergent = new Set(EXPECTED_DIVERGENCES.flatMap((d) => d.scenarios));

  it("covers the text-filter scenarios of the matrix", () => {
    expect(textScenarios.length).toBeGreaterThanOrEqual(10);
    for (const id of divergent) {
      expect(SCENARIOS.some((s) => s.id === id)).toBe(true);
    }
  });

  for (const s of textScenarios) {
    if (divergent.has(s.id)) {
      it(`${s.id}: documented divergence from the oracle (whitelisted, still differs)`, () => {
        const full = oracleFilterSort(ROWS, s.filters, s.sortPref, s.colFilters).map((r) => r.id);
        const rest = withoutTextFilters(s);
        const actual = oracleFilterSort(ROWS, rest.filters, s.sortPref, rest.colFilters)
          .filter((r) => matchTxText(r, plain(needlesOf(s))))
          .map((r) => r.id);
        expect(actual).not.toEqual(full);
      });
    } else {
      it(`${s.id}: matchTxText-selected ids equal oracle-selected ids`, () => {
        const full = oracleFilterSort(ROWS, s.filters, s.sortPref, s.colFilters).map((r) => r.id);
        const rest = withoutTextFilters(s);
        const actual = oracleFilterSort(ROWS, rest.filters, s.sortPref, rest.colFilters)
          .filter((r) => matchTxText(r, plain(needlesOf(s))))
          .map((r) => r.id);
        expect(actual).toEqual(full);
      });
    }
  }
});
