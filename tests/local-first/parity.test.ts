/**
 * Parity harness (local-first P1, PKG-09). SYNTHETIC fixture only (seed 7, n 7000).
 * Three sides, compared at cents (Math.round(x*100)) with key-set equality and group-count thresholds:
 *   (i)   server query functions (src/lib/queries.ts) on the PGlite server oracle
 *   (ii)  LocalStore (PgliteStore) loaded through the importer op path
 *   (iii) fixture/reference.ts pure functions
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { generate, type FixtureDataset, type FixtureTransaction } from "@/lib/local-first/fixture/generate";
import * as ref from "@/lib/local-first/fixture/reference";
import { PgliteStore } from "@/lib/local-first/store/pglite-store";
import type { TransactionRow } from "@/lib/local-first/store/types";
import { importFixture } from "@/lib/local-first/importer/import-fixture";
import { deriveLogKeys, deriveRootKey, type LogKeys } from "@/lib/local-first/crypto/kdf";
import { getAccountBalances, getSpendingByCategory, getIncomeVsExpenses, getNetWorthOverTime } from "@/lib/queries";
import { convertWithRateMap } from "@/lib/fx-service";
import { sumAssetsLiabilities } from "@/lib/account-visibility";
import { createServerOracle, ORACLE_USER_ID, type ServerOracle } from "./helpers/server-oracle";

/** Comparator: amounts are compared at cents. */
const cents = (x: number): number => Math.round(x * 100);

type Keyed = Map<string, number>;

/** Run statistics, printed once in afterAll as METRIC lines. */
const stats = { comparisons: 0, keysCompared: 0, mismatches: 0 };

/** Keys present on one side only, or whose cents differ. Sorted. */
function centsDiff(a: Keyed, b: Keyed): string[] {
  const out: string[] = [];
  const all = new Set([...a.keys(), ...b.keys()]);
  for (const k of all) {
    const x = a.get(k);
    const y = b.get(k);
    if (x === undefined || y === undefined || cents(x) !== cents(y)) out.push(k);
  }
  stats.comparisons++;
  stats.keysCompared += all.size;
  stats.mismatches += out.length;
  return out.sort();
}

function sameKeySet(a: Keyed, b: Keyed): boolean {
  if (a.size !== b.size) return false;
  for (const k of a.keys()) if (!b.has(k)) return false;
  return true;
}

function addTo(m: Keyed, key: string, v: number): void {
  m.set(key, (m.get(key) ?? 0) + v);
}

function monthSpan(from: string, to: string): number {
  const [y1, m1] = from.split("-").map(Number);
  const [y2, m2] = to.split("-").map(Number);
  return (y2 - y1) * 12 + (m2 - m1) + 1;
}

const BALANCE_COMBOS = [
  { includeArchived: false, includeInvisible: false, expectedRows: 6 },
  { includeArchived: true, includeInvisible: false, expectedRows: 7 },
  { includeArchived: false, includeInvisible: true, expectedRows: 7 },
  { includeArchived: true, includeInvisible: true, expectedRows: 8 },
];
const SPEND_WINDOWS = [
  { from: "2024-01-01", to: "2024-12-31" },
  { from: "2025-03-01", to: "2025-09-30" },
  { from: "2024-01-01", to: "2026-12-31" },
];
const INCOME_WINDOWS = [
  { from: "2025-01-01", to: "2025-12-31" },
  { from: "2024-06-01", to: "2026-06-30" },
];

/** Test-only key material (cheap Argon2 params; the production set A is not used in tests). */
async function testKeys(logId: string): Promise<LogKeys> {
  const root = deriveRootKey("parity-synthetic-passphrase", new Uint8Array(16).fill(7), { m: 64, t: 1, p: 1, dkLen: 32 });
  return deriveLogKeys(root, logId);
}

/** Fixture transaction -> LocalRow (same shape the importer writes). */
function localTxRow(t: FixtureTransaction, amount: number = t.amount): TransactionRow {
  return {
    id: t.id,
    serverId: t.serverId,
    date: t.date,
    accountId: t.accountId,
    categoryId: t.categoryId,
    currency: t.currency,
    amount,
    enteredCurrency: t.enteredCurrency,
    enteredAmount: t.enteredAmount,
    enteredFxRate: t.enteredFxRate,
    payee: t.payee,
    note: t.note,
    tags: t.tags,
    linkId: t.linkId,
  };
}

describe("server oracle vs LocalStore vs reference (synthetic P1 fixture)", { timeout: 300_000 }, () => {
  const data: FixtureDataset = generate({ seed: 7, n: 7000 });
  const accountById = new Map(data.accounts.map((a) => [a.id, a] as const));
  let oracle: ServerOracle;
  let store: PgliteStore;
  let accountSid: Map<string, number>;
  let categorySid: Map<string, number>;
  const rateMap = new Map(ref.FIXED_RATE_MAP);

  beforeAll(async () => {
    oracle = await createServerOracle(data);
    accountSid = oracle.accountServerId;
    categorySid = oracle.categoryServerId;
    store = new PgliteStore({ backend: "memory" });
    await store.open();
  }, 300_000);

  afterAll(async () => {
    console.log(`METRIC parity_comparisons=${stats.comparisons} keys_compared=${stats.keysCompared} mismatches=${stats.mismatches}`);
    await store?.close();
    await oracle?.close();
  }, 300_000);

  it("(ii) importer loads every fixture row through the op path in 15 batches", async () => {
    const result = await importFixture({ store, keys: await testKeys("parity-log"), dataset: data, batchSize: 500 });
    expect(result.ops).toBe(7020);
    expect(result.batches).toBe(15);
    expect(result.counts).toEqual({ accounts: 8, categories: 12, transactions: 7000 });
    expect(result.stateHash.length).toBeGreaterThan(0);
  });

  it("(i) the server oracle holds the fixture rows and the generated DDL", async () => {
    // 310 + 4 for lf_op_frame (create, FK, unique, index) added by local-first L1.
    expect(oracle.statementCount).toBe(314);
    const r = await oracle.client.query<{ a: number; c: number; t: number }>(
      "SELECT (SELECT count(*) FROM accounts)::int AS a, (SELECT count(*) FROM categories)::int AS c, (SELECT count(*) FROM transactions)::int AS t",
    );
    expect(r.rows[0]).toEqual({ a: 8, c: 12, t: 7000 });
  });

  for (const combo of BALANCE_COMBOS) {
    it(`accountBalances(archived=${combo.includeArchived}, invisible=${combo.includeInvisible}) matches at cents`, async () => {
      const server = new Map((await getAccountBalances(ORACLE_USER_ID, combo)).map((r) => [String(r.accountId), Number(r.balance)] as const));
      const local = new Map((await store.accountBalances(combo)).map((r) => [String(accountSid.get(r.accountId)), r.balance] as const));
      const refm = new Map(ref.accountBalances(data, combo).map((r) => [String(accountSid.get(r.accountId)), r.balance] as const));
      expect(server.size).toBe(combo.expectedRows);
      expect(local.size).toBe(combo.expectedRows);
      expect(refm.size).toBe(combo.expectedRows);
      expect(sameKeySet(server, local)).toBe(true);
      expect(sameKeySet(server, refm)).toBe(true);
      expect(centsDiff(server, refm)).toEqual([]);
      expect(centsDiff(local, refm)).toEqual([]);
      expect([...server.values()].some((v) => cents(v) !== 0)).toBe(true);
    });
  }

  for (const w of SPEND_WINDOWS) {
    it(`spendingByCategory ${w.from}..${w.to} matches at cents`, async () => {
      const server = new Map((await getSpendingByCategory(ORACLE_USER_ID, w.from, w.to)).map((r) => [String(r.categoryId), Number(r.total)] as const));
      const local = new Map((await store.spendingByCategory(w.from, w.to)).map((r) => [String(categorySid.get(r.categoryId ?? "")), r.total] as const));
      const refm = new Map(ref.categoryTotalsE(data, w).map((r) => [String(categorySid.get(r.categoryId)), r.total] as const));
      expect(refm.size).toBeGreaterThanOrEqual(6); // six E categories in the fixture
      expect(sameKeySet(server, refm)).toBe(true);
      expect(sameKeySet(local, refm)).toBe(true);
      expect(centsDiff(server, refm)).toEqual([]);
      expect(centsDiff(local, refm)).toEqual([]);
    });
  }

  for (const w of INCOME_WINDOWS) {
    it(`incomeVsExpenses ${w.from}..${w.to} matches at cents`, async () => {
      const server = new Map<string, number>();
      for (const r of await getIncomeVsExpenses(ORACLE_USER_ID, w.from, w.to)) addTo(server, `${r.month}|${r.type}|${r.currency}`, Number(r.totalAmount));
      const local = new Map<string, number>();
      for (const r of await store.incomeVsExpenses(w.from, w.to)) addTo(local, `${r.month}|${r.type}|${r.currency}`, r.total);
      const refm = new Map<string, number>();
      for (const r of ref.incomeVsExpenses(data, w)) addTo(refm, `${r.month}|${r.type}|${r.currency}`, r.total);
      expect(refm.size).toBeGreaterThanOrEqual(Math.floor(0.9 * monthSpan(w.from, w.to) * 4));
      expect(sameKeySet(server, refm)).toBe(true);
      expect(sameKeySet(local, refm)).toBe(true);
      expect(centsDiff(server, refm)).toEqual([]);
      expect(centsDiff(local, refm)).toEqual([]);
    });
  }

  it("netWorthOverTime per month x currency (native, no FX) matches at cents on every cell", async () => {
    // server/local values are per-month SUM(amount) per currency (NOT running totals).
    const server = new Map<string, number>();
    for (const r of await getNetWorthOverTime(ORACLE_USER_ID)) addTo(server, `${r.month}|${r.currency}`, Number(r.cumulative));
    const local = new Map<string, number>();
    for (const r of await store.netWorthByMonth()) addTo(local, `${r.month}|${r.currency}`, r.cumulative);
    expect(server.size).toBeGreaterThanOrEqual(Math.floor(0.9 * monthSpan("2024-01-01", "2026-12-31") * 2));
    expect(sameKeySet(server, local)).toBe(true);
    expect(centsDiff(server, local)).toEqual([]);

    // Running totals per currency in NATIVE currency, compared cell by cell (every month x currency).
    // Not converted per month: convertCurrency rounds each conversion to cents (round2), and the
    // reference converts per account while the server would convert per currency, so converted
    // per-month totals differ by design at the cent level. Converted totals are checked at the
    // last month by the hero test below.
    const refRows = ref.netWorthByMonthPerCurrency(data);
    const months = [...new Set(refRows.map((r) => r.month))].sort();
    expect(months.length).toBe(monthSpan("2024-01-01", "2026-12-31"));
    const currencies = [...new Set(refRows.map((r) => r.currency))].sort();
    const refGrid: Keyed = new Map(refRows.map((r) => [`${r.month}|${r.currency}`, r.runningTotal]));
    const serverMonths = new Set([...server.keys()].map((k) => k.split("|")[0]));
    for (const m of serverMonths) expect(months.includes(m), `ASSERT server month ${m} in reference`).toBe(true);
    for (const k of server.keys()) expect(currencies.includes(k.split("|")[1]), `ASSERT server currency in key ${k}`).toBe(true);

    // Independent naive recomputation: one pass over transactions sorted by date, no helper reuse.
    const acct = new Map(data.accounts.map((a) => [a.id, a]));
    const byDate = [...data.transactions].sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : 0));
    const naive: Keyed = new Map();
    const runNaive = new Map<string, number>();
    let cursor = 0;
    for (const m of months) {
      while (cursor < byDate.length && byDate[cursor].date.slice(0, 7) <= m) {
        const t = byDate[cursor++];
        const a = acct.get(t.accountId);
        if (a && a.invisible !== true) addTo(runNaive, a.currency, t.amount);
      }
      for (const c of currencies) naive.set(`${m}|${c}`, runNaive.get(c) ?? 0);
    }
    expect(centsDiff(refGrid, naive), "ASSERT helper matches naive recomputation").toEqual([]);

    // Server and local running totals on the same full grid.
    const runGrid = (monthly: Keyed): Keyed => {
      const out: Keyed = new Map();
      const run = new Map<string, number>();
      for (const m of months) {
        for (const c of currencies) {
          addTo(run, c, monthly.get(`${m}|${c}`) ?? 0);
          out.set(`${m}|${c}`, run.get(c) ?? 0);
        }
      }
      return out;
    };
    expect(centsDiff(runGrid(server), refGrid), "ASSERT server running total == reference, every month x currency").toEqual([]);
    expect(centsDiff(runGrid(local), refGrid), "ASSERT local running total == reference, every month x currency").toEqual([]);
    expect(refGrid.size).toBe(months.length * currencies.length);
  });

  it("hero net worth (sumAssetsLiabilities over convertWithRateMap) matches at cents", async () => {
    const all = { includeArchived: true, includeInvisible: true };
    const serverRows = await getAccountBalances(ORACLE_USER_ID, all);
    const server = sumAssetsLiabilities(
      serverRows.map((r) => ({
        accountType: r.accountType,
        invisible: r.invisible,
        converted: convertWithRateMap(Number(r.balance), r.currency ?? "", rateMap),
      })),
      (r) => r.converted,
    );
    const localRows = await store.accountBalances(all);
    const local = sumAssetsLiabilities(
      localRows.map((r) => ({
        accountType: r.accountType,
        invisible: r.invisible,
        converted: convertWithRateMap(r.balance, r.currency ?? "", rateMap),
      })),
      (r) => r.converted,
    );
    const refHero = ref.heroNetWorth(data, ref.FIXED_RATE_MAP);
    expect(refHero.displayCurrency).toBe("CAD");
    for (const field of ["totalAssets", "totalLiabilities", "netWorth"] as const) {
      expect(cents(server[field])).toBe(cents(local[field]));
      expect(cents(server[field])).toBe(cents(refHero[field]));
    }
    const refMonths = ref.netWorthByMonth(data);
    expect(cents(refMonths[refMonths.length - 1].netWorth)).toBe(cents(refHero.netWorth));
  });

  it("positive control: +0.01 on one local transaction gives exactly one mismatch on its account", async () => {
    const t = data.transactions.find((tx) => {
      const a = accountById.get(tx.accountId);
      return a !== undefined && !a.archived && !a.invisible;
    });
    if (t === undefined) throw new Error("no visible, non-archived transaction in fixture");
    const expectedKey = String(accountSid.get(t.accountId));
    const serverMap = new Map((await getAccountBalances(ORACLE_USER_ID, { includeArchived: false, includeInvisible: false })).map((r) => [String(r.accountId), Number(r.balance)] as const));
    const localMap = async () =>
      new Map((await store.accountBalances({ includeArchived: false, includeInvisible: false })).map((r) => [String(accountSid.get(r.accountId)), r.balance] as const));
    try {
      await store.upsertRows("transactions", [localTxRow(t, t.amount + 0.01)]);
      const diffs = centsDiff(serverMap, await localMap());
      expect(diffs.length).toBe(1);
      expect(diffs).toEqual([expectedKey]);
    } finally {
      await store.upsertRows("transactions", [localTxRow(t)]);
    }
    expect(centsDiff(serverMap, await localMap())).toEqual([]);
  });
});
