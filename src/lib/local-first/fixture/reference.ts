/**
 * Pure reference queries over a synthetic FixtureDataset (local-first P1, PKG-08).
 * No server imports ('@/db', '@/lib/queries', fx-service DB paths). Helpers that the server
 * computes elsewhere are MIRRORED below with the source line quoted in each comment.
 * Parity against the server functions is PKG-09's job; this file is the local oracle.
 */

import type { FixtureDataset } from "./generate";

export const DISPLAY_CURRENCY = "CAD";
/** Fixed rate map for the fixture: CAD per 1 unit of each currency. */
export const FIXED_RATE_MAP: ReadonlyMap<string, number> = new Map<string, number>([
  ["CAD", 1],
  ["USD", 1.37],
]);

/** Inclusive YYYY-MM-DD window (string compare is correct for this format). */
export interface DateWindow {
  from: string;
  to: string;
}

export interface BalanceOptions {
  includeArchived?: boolean;
  includeInvisible?: boolean;
}

export interface AccountBalanceRow {
  accountId: string;
  accountType: string;
  accountGroup: string;
  currency: string;
  archived: boolean;
  isInvestment: boolean;
  invisible: boolean;
  balance: number;
}

export interface CategoryTotalRow {
  categoryId: string;
  categoryGroup: string;
  categoryType: "E";
  total: number;
}

export interface IncomeExpenseRow {
  month: string;
  type: "E" | "I";
  currency: string;
  total: number;
}

export interface NetWorthRow {
  month: string;
  totalAssets: number;
  totalLiabilities: number;
  netWorth: number;
}

// Mirror of src/lib/utils/number.ts:19 (round2, re-exported by src/lib/currency-conversion.ts:18-23).
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// Mirror of src/lib/fx-service.ts:592-594 convertCurrency (round2 per conversion).
function convertCurrency(amount: number, rate: number): number {
  return round2(amount * rate);
}

// Mirror of src/lib/fx-service.ts:698-706 convertWithRateMap (unknown currency falls back to rate 1).
export function convertWithRateMap(amount: number, fromCurrency: string, rateMap: ReadonlyMap<string, number>): number {
  const code = fromCurrency.trim().toUpperCase();
  const rate = rateMap.get(code) ?? 1;
  return convertCurrency(amount, rate);
}

// Mirror of src/lib/account-visibility.ts:17-18 countsInTotals and :30-41 sumAssetsLiabilities.
export function sumAssetsLiabilities<T extends { invisible?: boolean | null; accountType?: string | null }>(
  rows: readonly T[],
  value: (row: T) => number,
): { totalAssets: number; totalLiabilities: number; netWorth: number } {
  let totalAssets = 0;
  let totalLiabilities = 0;
  for (const r of rows) {
    if (r.invisible === true) continue;
    if (r.accountType === "A") totalAssets += value(r);
    else if (r.accountType === "L") totalLiabilities += value(r);
  }
  return { totalAssets, totalLiabilities, netWorth: totalAssets + totalLiabilities };
}

/**
 * Mirror of src/lib/queries.ts:847-883 getAccountBalances: SUM(amount) per account.
 * queries.ts:852 excludes archived unless includeArchived; queries.ts:853 excludes invisible
 * unless includeInvisible. Ordered by type, group (queries.ts:876), id as tie-break.
 */
export function accountBalances(data: FixtureDataset, opts: BalanceOptions = {}): AccountBalanceRow[] {
  const sums = new Map<string, number>();
  for (const t of data.transactions) {
    sums.set(t.accountId, (sums.get(t.accountId) ?? 0) + t.amount);
  }
  const rows: AccountBalanceRow[] = [];
  for (const a of data.accounts) {
    if (!opts.includeArchived && a.archived) continue;
    if (!opts.includeInvisible && a.invisible) continue;
    rows.push({
      accountId: a.id,
      accountType: a.type,
      accountGroup: a.group,
      currency: a.currency,
      archived: a.archived,
      isInvestment: a.isInvestment,
      invisible: a.invisible,
      balance: sums.get(a.id) ?? 0,
    });
  }
  const key = (r: AccountBalanceRow) => `${r.accountType}|${r.accountGroup}|${r.accountId}`;
  rows.sort((x, y) => (key(x) < key(y) ? -1 : key(x) > key(y) ? 1 : 0));
  return rows;
}

/**
 * Mirror of src/lib/queries.ts:915-938 getSpendingByCategory: categories.type = 'E' within the
 * inclusive date window. Null-category rows are excluded (inner match on category type).
 */
export function categoryTotalsE(data: FixtureDataset, w: DateWindow): CategoryTotalRow[] {
  const cats = new Map(data.categories.map((c) => [c.id, c] as const));
  const totals = new Map<string, number>();
  for (const t of data.transactions) {
    if (t.date < w.from || t.date > w.to) continue;
    if (t.categoryId === null) continue;
    const c = cats.get(t.categoryId);
    if (!c || c.type !== "E") continue;
    totals.set(c.id, (totals.get(c.id) ?? 0) + t.amount);
  }
  return [...totals.entries()]
    .sort((x, y) => (x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : 0))
    .map(([categoryId, total]) => ({
      categoryId,
      categoryGroup: cats.get(categoryId)!.group,
      categoryType: "E" as const,
      total,
    }));
}

/**
 * Mirror of src/lib/queries.ts:970-993 getIncomeVsExpenses: month = date YYYY-MM
 * (queries.ts:13-17), category type IN ('E','I'), grouped by month, type, transaction currency.
 */
export function incomeVsExpenses(data: FixtureDataset, w: DateWindow): IncomeExpenseRow[] {
  const cats = new Map(data.categories.map((c) => [c.id, c] as const));
  const totals = new Map<string, IncomeExpenseRow>();
  for (const t of data.transactions) {
    if (t.date < w.from || t.date > w.to) continue;
    if (t.categoryId === null) continue;
    const c = cats.get(t.categoryId);
    if (!c || (c.type !== "E" && c.type !== "I")) continue;
    const month = t.date.slice(0, 7);
    const key = `${month}|${c.type}|${t.currency}`;
    const row = totals.get(key) ?? { month, type: c.type, currency: t.currency, total: 0 };
    row.total += t.amount;
    totals.set(key, row);
  }
  return [...totals.values()].sort((x, y) => {
    if (x.month !== y.month) return x.month < y.month ? -1 : 1;
    if (x.type !== y.type) return x.type < y.type ? -1 : 1;
    return x.currency < y.currency ? -1 : x.currency > y.currency ? 1 : 0;
  });
}

/**
 * Net worth at each month that has at least one transaction (queries.ts:1094-1109
 * getNetWorthOverTime groups by month with tx). Cumulative balance through the month end, per
 * account, excluding invisible accounts (queries.ts COALESCE(invisible,false)=false), converted
 * with convertWithRateMap and summed with sumAssetsLiabilities.
 */
export function netWorthByMonth(data: FixtureDataset, rateMap: ReadonlyMap<string, number> = FIXED_RATE_MAP): NetWorthRow[] {
  const months = [...new Set(data.transactions.map((t) => t.date.slice(0, 7)))].sort();
  const out: NetWorthRow[] = [];
  for (const month of months) {
    const sums = new Map<string, number>();
    for (const t of data.transactions) {
      if (t.date.slice(0, 7) > month) continue;
      sums.set(t.accountId, (sums.get(t.accountId) ?? 0) + t.amount);
    }
    const rows = data.accounts.map((a) => ({
      accountType: a.type as string,
      invisible: a.invisible,
      converted: convertWithRateMap(sums.get(a.id) ?? 0, a.currency, rateMap),
    }));
    const s = sumAssetsLiabilities(rows, (r) => r.converted);
    out.push({ month, totalAssets: s.totalAssets, totalLiabilities: s.totalLiabilities, netWorth: s.netWorth });
  }
  return out;
}

/** One row per tx month x visible-account currency, in native currency (no FX). */
export interface NetWorthCurrencyRow {
  month: string; // YYYY-MM
  currency: string;
  runningTotal: number; // cumulative native amount through month end
}

/**
 * Native-currency running total per month x currency. No conversion, so no round2 granularity.
 * Same filters as getNetWorthOverTime / NET_WORTH_BY_MONTH_SQL: invisible accounts excluded,
 * archived NOT excluded. One row for every (tx month, visible currency); a currency with no
 * transaction yet through that month has 0.
 */
export function netWorthByMonthPerCurrency(data: FixtureDataset): NetWorthCurrencyRow[] {
  const months = [...new Set(data.transactions.map((t) => t.date.slice(0, 7)))].sort();
  const visible = new Map(data.accounts.filter((a) => a.invisible !== true).map((a) => [a.id, a]));
  const currencies = [...new Set([...visible.values()].map((a) => a.currency))].sort();
  const out: NetWorthCurrencyRow[] = [];
  for (const month of months) {
    for (const currency of currencies) {
      let runningTotal = 0;
      for (const t of data.transactions) {
        if (t.date.slice(0, 7) > month) continue;
        const a = visible.get(t.accountId);
        if (a && a.currency === currency) runningTotal += t.amount;
      }
      out.push({ month, currency, runningTotal });
    }
  }
  return out;
}

/**
 * Hero net worth as the dashboard computes it: getAccountBalances(includeArchived, includeInvisible)
 * (src/app/api/dashboard/route.ts:67-70), each balance converted with convertWithRateMap, then
 * sumAssetsLiabilities (invisible rows skipped there).
 */
export function heroNetWorth(
  data: FixtureDataset,
  rateMap: ReadonlyMap<string, number> = FIXED_RATE_MAP,
): { totalAssets: number; totalLiabilities: number; netWorth: number; displayCurrency: string } {
  const rows = accountBalances(data, { includeArchived: true, includeInvisible: true }).map((r) => ({
    accountType: r.accountType,
    invisible: r.invisible,
    converted: convertWithRateMap(r.balance, r.currency, rateMap),
  }));
  const s = sumAssetsLiabilities(rows, (r) => r.converted);
  return { ...s, displayCurrency: DISPLAY_CURRENCY };
}
