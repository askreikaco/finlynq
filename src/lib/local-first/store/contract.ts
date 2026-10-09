/**
 * Contract suite for LocalStore (local-first prototype P1, PKG-07).
 * Exported as a function that takes a store factory, so any engine can run it.
 * Expected values are hand-computed from FIXTURE below (see the comment block per case).
 */
import { describe, it, expect } from "vitest";
import type { LocalStore, AccountRow, CategoryRow, TransactionRow, BalanceRow, CategoryTotalRow, MonthTypeRow, MonthCurrencyRow } from "./types";
import { LOCAL_SCHEMA_VERSION } from "./schema";

export interface StoreContractFactory {
  /** Returns an UNOPENED store over new, empty storage. */
  fresh(): Promise<LocalStore>;
  /** Optional. Returns an UNOPENED store over the same storage as the last fresh(). */
  reopen?(): Promise<LocalStore>;
}

export const FIXTURE_ACCOUNTS: AccountRow[] = [
  { id: "acc-chk", type: "A", group: "Bank", currency: "CAD", name: "Checking", archived: false, isInvestment: false, invisible: false },
  { id: "acc-card", type: "L", group: "Card", currency: "CAD", name: "Old card", archived: true, isInvestment: false, invisible: false },
  { id: "acc-hid", type: "A", group: "Bank", currency: "USD", name: "Hidden", archived: false, isInvestment: false, invisible: true },
  { id: "acc-oldhid", type: "A", group: "Bank", currency: "USD", name: "Old hidden", archived: true, isInvestment: false, invisible: true },
];

export const FIXTURE_CATEGORIES: CategoryRow[] = [
  { id: "cat-food", type: "E", group: "Living", name: "Food" },
  { id: "cat-salary", type: "I", group: "Income", name: "Salary" },
  { id: "cat-refund", type: "R", group: "Other", name: "Refund" },
];

// Columns: id, date, account, category, currency, amount.
// null account = account-less row; null category = uncategorised row.
export const FIXTURE_TRANSACTIONS: TransactionRow[] = [
  { id: "tx-01", date: "2026-01-05", accountId: "acc-chk", categoryId: "cat-food", currency: "CAD", amount: -50 },
  { id: "tx-02", date: "2026-01-31", accountId: "acc-chk", categoryId: "cat-food", currency: "CAD", amount: -30 },
  { id: "tx-03", date: "2026-02-01", accountId: "acc-chk", categoryId: "cat-food", currency: "CAD", amount: -20 },
  { id: "tx-04", date: "2026-01-15", accountId: "acc-chk", categoryId: "cat-salary", currency: "CAD", amount: 1000 },
  { id: "tx-05", date: "2026-01-20", accountId: "acc-hid", categoryId: "cat-food", currency: "USD", amount: -10 },
  { id: "tx-06", date: "2026-01-10", accountId: "acc-card", categoryId: "cat-refund", currency: "CAD", amount: 5 },
  { id: "tx-07", date: "2026-01-12", accountId: null, categoryId: "cat-food", currency: "CAD", amount: -7 },
  { id: "tx-08", date: "2026-01-18", accountId: "acc-oldhid", categoryId: null, currency: "USD", amount: 200 },
  { id: "tx-09", date: "2026-02-10", accountId: "acc-card", categoryId: null, currency: "CAD", amount: -300 },
  { id: "tx-10", date: "2026-02-14", accountId: "acc-chk", categoryId: "cat-salary", currency: "CAD", amount: 100 },
  { id: "tx-11", date: "2026-01-31", accountId: "acc-hid", categoryId: "cat-salary", currency: "USD", amount: 40 },
];

/** Expected values, derived by hand from FIXTURE_TRANSACTIONS. */
const EXPECTED_BALANCE: Record<string, number> = {
  "acc-chk": 1000, // -50 -30 -20 +1000 +100
  "acc-card": -295, // +5 -300
  "acc-hid": 30, // -10 +40
  "acc-oldhid": 200, // +200
};

function byKey<T>(rows: T[], key: (r: T) => string): Map<string, T> {
  const m = new Map<string, T>();
  for (const r of rows) m.set(key(r), r);
  return m;
}

function balancesAsMap(rows: BalanceRow[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) out[r.accountId] = Math.round(r.balance * 100) / 100;
  return out;
}

async function seeded(factory: StoreContractFactory): Promise<LocalStore> {
  const s = await factory.fresh();
  await s.open();
  await s.upsertRows("accounts", FIXTURE_ACCOUNTS);
  await s.upsertRows("categories", FIXTURE_CATEGORIES);
  await s.upsertRows("transactions", FIXTURE_TRANSACTIONS);
  return s;
}

export function runLocalStoreContract(label: string, factory: StoreContractFactory): void {
  describe(`LocalStore contract: ${label}`, { timeout: 120_000 }, () => {
    it("counts match the hand-built fixture (4 accounts, 3 categories, 11 transactions)", async () => {
      const s = await seeded(factory);
      try {
        expect(await s.counts()).toEqual({ accounts: 4, categories: 3, transactions: 11 });
      } finally {
        await s.close();
      }
    });

    it("schema_version is 1", async () => {
      const s = await factory.fresh();
      await s.open();
      try {
        expect(await s.schemaVersion()).toBe(LOCAL_SCHEMA_VERSION);
        expect(LOCAL_SCHEMA_VERSION).toBe(1);
      } finally {
        await s.close();
      }
    });

    it("batched upsert of 1201 rows (crosses two 500-row chunk boundaries) counts exactly", async () => {
      const s = await factory.fresh();
      await s.open();
      try {
        const bulk: TransactionRow[] = [];
        for (let i = 0; i < 1201; i++) {
          bulk.push({ id: `bulk-${i}`, date: "2026-03-01", accountId: "acc-chk", categoryId: "cat-food", currency: "CAD", amount: -1 });
        }
        await s.upsertRows("accounts", FIXTURE_ACCOUNTS);
        await s.upsertRows("transactions", bulk);
        expect((await s.counts()).transactions).toBe(1201);
        expect(balancesAsMap(await s.accountBalances({ includeArchived: false, includeInvisible: false }))).toEqual({ "acc-chk": -1201 });
      } finally {
        await s.close();
      }
    });

    it("upsert by id replaces the row; duplicate ids in one call: last one wins", async () => {
      const s = await seeded(factory);
      try {
        // tx-01 -50 -> -55 (replace). Balance of acc-chk: 1000 -> 995.
        await s.upsertRows("transactions", [{ ...FIXTURE_TRANSACTIONS[0], amount: -60 }, { ...FIXTURE_TRANSACTIONS[0], amount: -55 }]);
        expect((await s.counts()).transactions).toBe(11);
        const bal = balancesAsMap(await s.accountBalances({ includeArchived: false, includeInvisible: false }));
        expect(bal["acc-chk"]).toBe(995);
      } finally {
        await s.close();
      }
    });

    it("account balances: all four archived/invisible option combinations", async () => {
      const s = await seeded(factory);
      try {
        // (archived, invisible) = (false,false): only acc-chk
        expect(balancesAsMap(await s.accountBalances({ includeArchived: false, includeInvisible: false }))).toEqual({
          "acc-chk": EXPECTED_BALANCE["acc-chk"],
        });
        // (true,false): acc-chk + archived acc-card
        expect(balancesAsMap(await s.accountBalances({ includeArchived: true, includeInvisible: false }))).toEqual({
          "acc-chk": EXPECTED_BALANCE["acc-chk"],
          "acc-card": EXPECTED_BALANCE["acc-card"],
        });
        // (false,true): acc-chk + invisible acc-hid
        expect(balancesAsMap(await s.accountBalances({ includeArchived: false, includeInvisible: true }))).toEqual({
          "acc-chk": EXPECTED_BALANCE["acc-chk"],
          "acc-hid": EXPECTED_BALANCE["acc-hid"],
        });
        // (true,true): all four
        expect(balancesAsMap(await s.accountBalances({ includeArchived: true, includeInvisible: true }))).toEqual(EXPECTED_BALANCE);
      } finally {
        await s.close();
      }
    });

    it("spending by category: type E only, window inclusive at both ends", async () => {
      const s = await seeded(factory);
      try {
        // Jan 1..Jan 31: E rows are tx-01 -50, tx-02 -30 (Jan 31, end inclusive), tx-05 -10, tx-07 -7 = -97.
        // tx-03 (Feb 1) excluded. Salary (I), refund (R) and null-category rows excluded.
        const jan: CategoryTotalRow[] = await s.spendingByCategory("2026-01-01", "2026-01-31");
        expect(jan).toHaveLength(1);
        expect(jan[0].categoryId).toBe("cat-food");
        expect(jan[0].categoryType).toBe("E");
        expect(Math.round(jan[0].total * 100) / 100).toBe(-97);
        // Single day Jan 5: start and end both inclusive -> tx-01 only = -50.
        const day = await s.spendingByCategory("2026-01-05", "2026-01-05");
        expect(day.map((r) => Math.round(r.total * 100) / 100)).toEqual([-50]);
        // Single day Feb 1 -> tx-03 only = -20.
        const feb1 = await s.spendingByCategory("2026-02-01", "2026-02-01");
        expect(feb1.map((r) => Math.round(r.total * 100) / 100)).toEqual([-20]);
      } finally {
        await s.close();
      }
    });

    it("income vs expenses: per month, type and currency (E and I only)", async () => {
      const s = await seeded(factory);
      try {
        const key = (r: MonthTypeRow) => `${r.month}|${r.type}|${r.currency}`;
        // Jan window: E CAD -87 (-50-30-7), E USD -10, I CAD 1000, I USD 40 (Jan 31 included). R and null-category excluded.
        const jan = byKey(await s.incomeVsExpenses("2026-01-01", "2026-01-31"), key);
        expect(jan.size).toBe(4);
        expect(Math.round(jan.get("2026-01|E|CAD")!.total * 100) / 100).toBe(-87);
        expect(Math.round(jan.get("2026-01|E|USD")!.total * 100) / 100).toBe(-10);
        expect(Math.round(jan.get("2026-01|I|CAD")!.total * 100) / 100).toBe(1000);
        expect(Math.round(jan.get("2026-01|I|USD")!.total * 100) / 100).toBe(40);
        // Jan..Feb window: adds Feb E CAD -20 (tx-03) and Feb I CAD 100 (tx-10).
        const full = byKey(await s.incomeVsExpenses("2026-01-01", "2026-02-28"), key);
        expect(full.size).toBe(6);
        expect(Math.round(full.get("2026-02|E|CAD")!.total * 100) / 100).toBe(-20);
        expect(Math.round(full.get("2026-02|I|CAD")!.total * 100) / 100).toBe(100);
      } finally {
        await s.close();
      }
    });

    it("net worth by month: excludes invisible accounts, keeps account-less rows", async () => {
      const s = await seeded(factory);
      try {
        // Excluded (invisible acc-hid, acc-oldhid): tx-05, tx-08, tx-11. Archived acc-card is NOT excluded here.
        // Jan CAD: tx-01 -50, tx-02 -30, tx-04 +1000, tx-06 +5 = 925.
        // Jan null (account-less tx-07): -7.   Feb CAD: tx-03 -20, tx-09 -300, tx-10 +100 = -220.
        const rows: MonthCurrencyRow[] = await s.netWorthByMonth();
        const m = byKey(rows, (r) => `${r.month}|${r.currency ?? "null"}`);
        expect(rows).toHaveLength(3);
        expect(Math.round(m.get("2026-01|CAD")!.cumulative * 100) / 100).toBe(925);
        expect(Math.round(m.get("2026-01|null")!.cumulative * 100) / 100).toBe(-7);
        expect(Math.round(m.get("2026-02|CAD")!.cumulative * 100) / 100).toBe(-220);
        expect(m.has("2026-01|USD")).toBe(false);
      } finally {
        await s.close();
      }
    });

    it("deleteRows removes the listed ids only", async () => {
      const s = await seeded(factory);
      try {
        await s.deleteRows("transactions", ["tx-07", "tx-08"]);
        expect((await s.counts()).transactions).toBe(9);
      } finally {
        await s.close();
      }
    });

    it("wipe empties all data tables and keeps schema_version", async () => {
      const s = await seeded(factory);
      try {
        await s.wipe();
        expect(await s.counts()).toEqual({ accounts: 0, categories: 0, transactions: 0 });
        expect(await s.netWorthByMonth()).toEqual([]);
        expect(await s.schemaVersion()).toBe(1);
      } finally {
        await s.close();
      }
    });

    it("closed store rejects calls", async () => {
      const s = await seeded(factory);
      await s.close();
      await expect(s.counts()).rejects.toThrow();
    });

    it.skipIf(!factory.reopen)("close then reopen on the same storage keeps the data (persistent backends)", async () => {
      const s1 = await factory.fresh();
      await s1.open();
      await s1.upsertRows("accounts", FIXTURE_ACCOUNTS);
      await s1.upsertRows("categories", FIXTURE_CATEGORIES);
      await s1.upsertRows("transactions", FIXTURE_TRANSACTIONS);
      await s1.close();

      const reopen = factory.reopen;
      if (!reopen) throw new Error("reopen not provided");
      const s2 = await reopen();
      await s2.open();
      try {
        expect(await s2.counts()).toEqual({ accounts: 4, categories: 3, transactions: 11 });
        expect(await s2.schemaVersion()).toBe(1);
        expect(balancesAsMap(await s2.accountBalances({ includeArchived: true, includeInvisible: true }))).toEqual(EXPECTED_BALANCE);
      } finally {
        await s2.close();
      }
    });
  });
}
