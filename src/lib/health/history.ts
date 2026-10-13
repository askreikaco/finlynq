/**
 * Month-end inputs for the financial-health series (see ./score.ts buildHealthSeries).
 *
 * calculateFinancialHealth({ historyMonths: n }) calls this to evaluate the SAME six components at each of the n
 * previous month ends, from a handful of grouped, plaintext queries (no per-month recomputation, no DEK):
 *   - income / expenses per month (savings rate, emergency-fund runway, DTI income)
 *   - per-account ledger balances per month (liquid assets, net worth); investment accounts are marked with the stored
 *     daily portfolio snapshots when the live calculation is on a market basis
 *   - the debt-service window of each month end (same computeDebtService + loadUntrackedLiabilities as the live DTI)
 *   - budgets of each month vs that month's spending
 *   - FIFO age of money as of each month end (pure computeAgeOfMoney)
 * Money is converted at today's rates, exactly like the live figure, so the series is on one basis with it. A month
 * whose net worth cannot be derived (an investment account without a snapshot) drops the net-worth-trend component,
 * like a live account with too little history.
 */

import { sql } from "drizzle-orm";
import { computeAgeOfMoney, type AgeOfMoneyRow } from "../age-of-money";
import { isCashGroup } from "../accounts/groups";
import { monthsBetween, shiftMonth } from "../metrics/period";
import { computeDebtService, type DebtServiceLoan } from "./debt-service";
import type { HealthMonthInputs } from "./score";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DbLike = { execute: (q: ReturnType<typeof sql>) => Promise<any> };

function asRows(result: unknown): Array<Record<string, unknown>> {
  if (result && typeof result === "object") {
    if ("rows" in result && Array.isArray((result as { rows?: unknown }).rows)) {
      return (result as { rows: Array<Record<string, unknown>> }).rows;
    }
    if (Array.isArray(result)) return result as Array<Record<string, unknown>>;
  }
  return [];
}

const monthEndDate = (month: string): string => {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
};
const yearBefore = (date: string): string => {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y - 1, m - 1, d)).toISOString().slice(0, 10);
};
const dayDiff = (a: string, b: string): number => Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86400000);

export type HealthHistoryDeps = {
  db: DbLike;
  userId: string;
  reporting: string;
  /** Today's rate into the reporting currency (the live figure's basis). */
  fxFor: (currency: string) => Promise<number>;
  loans: DebtServiceLoan[];
  /** Live net-worth basis: "market" marks investment accounts with snapshots; "ledger" keeps net contributions. */
  marketApplied: boolean;
  loadUntracked: (from: string, to: string) => Promise<Parameters<typeof computeDebtService>[0]["untrackedLiabilities"]>;
  /** "YYYY-MM-DD" today and how many previous month ends to evaluate. */
  today: string;
  months: number;
};

export async function loadHealthMonthInputs(d: HealthHistoryDeps): Promise<HealthMonthInputs[]> {
  const { db, userId, reporting, fxFor, today } = d;
  const n = Math.max(0, Math.min(24, Math.floor(d.months)));
  if (n === 0) return [];
  const current = today.slice(0, 7);
  const past = Array.from({ length: n }, (_, i) => shiftMonth(current, -(n - i)));
  const earliest = past[0];

  // ── income / expenses per month (window start: 12 whole months before the earliest month, +3 for its savings window)
  const flowFrom = `${shiftMonth(earliest, -11)}-01`;
  const flowRows = asRows(await db.execute(sql`
    SELECT TO_CHAR(t.date::date, 'YYYY-MM') AS month, c.type AS cat_type,
           COALESCE(t.currency, a.currency) AS currency, SUM(t.amount) AS total
    FROM transactions t
    LEFT JOIN categories c ON t.category_id = c.id
    LEFT JOIN accounts a ON a.id = t.account_id
    WHERE t.user_id = ${userId} AND t.date >= ${flowFrom} AND c.type IN ('E','I')
    GROUP BY TO_CHAR(t.date::date, 'YYYY-MM'), c.type, COALESCE(t.currency, a.currency)
  `)) as Array<{ month: string; cat_type: string; currency: string | null; total: number | string }>;
  const income = new Map<string, number>();
  const expenses = new Map<string, number>();
  for (const r of flowRows) {
    const converted = Number(r.total) * (await fxFor(String(r.currency ?? reporting)));
    if (r.cat_type === "I") income.set(r.month, (income.get(r.month) ?? 0) + converted);
    if (r.cat_type === "E") expenses.set(r.month, (expenses.get(r.month) ?? 0) + Math.abs(converted));
  }
  const sumMonths = (m: Map<string, number>, from: string, to: string) =>
    monthsBetween(from, to).reduce((s, k) => s + (m.get(k) ?? 0), 0);

  // ── ledger balance per account per month (cumulative below)
  const balRows = asRows(await db.execute(sql`
    SELECT a.id, a.type, a."group", a.currency, a.is_investment,
           TO_CHAR(t.date::date, 'YYYY-MM') AS month, SUM(t.amount) AS total
    FROM accounts a JOIN transactions t ON t.account_id = a.id AND t.user_id = ${userId}
    WHERE a.user_id = ${userId} AND a.invisible = false
    GROUP BY a.id, a.type, a."group", a.currency, a.is_investment, TO_CHAR(t.date::date, 'YYYY-MM')
  `)) as Array<{ id: number | string; type: string; group: string; currency: string | null; is_investment: boolean | null; month: string; total: number | string }>;
  type Acct = { id: number; type: string; group: string; fx: number; isInvestment: boolean; byMonth: Map<string, number> };
  const accounts = new Map<number, Acct>();
  for (const r of balRows) {
    const id = Number(r.id);
    let a = accounts.get(id);
    if (!a) {
      a = { id, type: r.type, group: r.group, fx: await fxFor(String(r.currency ?? reporting)), isInvestment: r.is_investment === true, byMonth: new Map() };
      accounts.set(id, a);
    }
    a.byMonth.set(r.month, (a.byMonth.get(r.month) ?? 0) + Number(r.total));
  }
  const ledgerAt = (a: Acct, month: string): number => {
    let s = 0;
    for (const [m, v] of a.byMonth) if (m <= month) s += v;
    return s;
  };

  // ── investment snapshots (market basis only): latest snapshot on/before a date, within 10 days
  const snaps = new Map<number, Array<{ date: string; value: number }>>();
  if (d.marketApplied) {
    const snapFrom = `${shiftMonth(earliest, -3)}-01`;
    const snapRows = asRows(await db.execute(sql`
      SELECT s.account_id, s.snap_date, s.market_value, s.currency
      FROM portfolio_snapshots s JOIN accounts a ON a.id = s.account_id
      WHERE s.user_id = ${userId} AND a.invisible = false AND a.is_investment = true
        AND s.account_id IS NOT NULL AND s.snap_date >= ${snapFrom} AND s.snap_date <= ${today}
      ORDER BY s.snap_date
    `)) as Array<{ account_id: number | string; snap_date: string; market_value: number | string; currency: string | null }>;
    for (const r of snapRows) {
      const id = Number(r.account_id);
      const v = Number(r.market_value) * (await fxFor(String(r.currency ?? reporting)));
      (snaps.get(id) ?? snaps.set(id, []).get(id)!).push({ date: String(r.snap_date), value: v });
    }
  }
  const snapAt = (accountId: number, asOf: string): number | null => {
    const rows = snaps.get(accountId);
    if (!rows) return null;
    let hit: { date: string; value: number } | null = null;
    for (const r of rows) if (r.date <= asOf) hit = r; else break;
    return hit && dayDiff(asOf, hit.date) <= 10 ? hit.value : null;
  };
  /** Net worth at a month end; null when an investment account cannot be marked at that date (market basis). */
  const netWorthAt = (month: string): number | null => {
    const asOf = monthEndDate(month);
    let total = 0;
    for (const a of accounts.values()) {
      if (a.isInvestment && d.marketApplied) {
        if (ledgerAt(a, month) === 0 && !snaps.has(a.id)) continue;
        const v = snapAt(a.id, asOf);
        if (v == null) return null;
        total += v;
      } else {
        total += ledgerAt(a, month) * a.fx;
      }
    }
    return total;
  };
  const liquidAt = (month: string): number => {
    let total = 0;
    for (const a of accounts.values()) {
      if (a.type === "A" && !a.isInvestment && isCashGroup(a.group)) total += ledgerAt(a, month) * a.fx;
    }
    return total;
  };

  // ── oldest transaction (insufficient-history rule: >= 60 days before the as-of date)
  const oldestRow = asRows(await db.execute(sql`SELECT MIN(t.date) AS oldest FROM transactions t WHERE t.user_id = ${userId}`)) as Array<{ oldest: string | null }>;
  const oldest = oldestRow[0]?.oldest ?? null;

  // ── budgets of each month vs that month's spending (one grouped query)
  const budgetRows = asRows(await db.execute(sql`
    SELECT b.month AS month, b.amount AS budget,
           COALESCE(ABS(SUM(CASE WHEN t.date >= (b.month || '-01') AND t.date <= (b.month || '-31') THEN t.amount ELSE 0 END)), 0) AS spent
    FROM budgets b
    JOIN categories c ON b.category_id = c.id AND c.user_id = ${userId}
    LEFT JOIN transactions t ON t.category_id = c.id AND t.user_id = ${userId}
    WHERE b.user_id = ${userId} AND b.month >= ${earliest} AND b.month <= ${past[past.length - 1]}
    GROUP BY b.id, b.month, b.amount
  `)) as Array<{ month: string; budget: number | string; spent: number | string }>;
  const budgetsBy = new Map<string, { onTrack: number; total: number }>();
  for (const r of budgetRows) {
    const e = budgetsBy.get(r.month) ?? { onTrack: 0, total: 0 };
    e.total += 1;
    if (Number(r.spent) <= Math.abs(Number(r.budget))) e.onTrack += 1;
    budgetsBy.set(r.month, e);
  }

  // ── age of money as of each month end: all income, and the 20 newest expenses before each as-of date
  const incomeAom = asRows(await db.execute(sql`
    SELECT t.date AS date, t.amount AS amount
    FROM transactions t LEFT JOIN categories c ON t.category_id = c.id
    WHERE t.user_id = ${userId} AND c.type = 'I' ORDER BY t.date ASC
  `)) as Array<{ date: string; amount: number | string }>;
  const aomIncome: AgeOfMoneyRow[] = incomeAom.map((r) => ({ date: String(r.date), amount: Number(r.amount) }));
  const firstAsOf = monthEndDate(earliest);
  const cutoffRows = asRows(await db.execute(sql`
    SELECT t.date AS date FROM transactions t LEFT JOIN categories c ON t.category_id = c.id
    WHERE t.user_id = ${userId} AND c.type = 'E' AND t.date <= ${firstAsOf}
    ORDER BY t.date DESC LIMIT 1 OFFSET 19
  `)) as Array<{ date: string }>;
  const cutoff = cutoffRows[0]?.date ?? "0000-01-01";
  const expenseAom = asRows(await db.execute(sql`
    SELECT t.date AS date, t.amount AS amount
    FROM transactions t LEFT JOIN categories c ON t.category_id = c.id
    WHERE t.user_id = ${userId} AND c.type = 'E' AND t.date >= ${cutoff} ORDER BY t.date DESC
  `)) as Array<{ date: string; amount: number | string }>;
  const aomExpenses: AgeOfMoneyRow[] = expenseAom.map((r) => ({ date: String(r.date), amount: Number(r.amount) }));

  // ── per month end
  const out: HealthMonthInputs[] = [];
  for (const month of past) {
    const asOf = monthEndDate(month);
    const threeStart = shiftMonth(month, -3); // the live "3-month" window: three whole months before + the month itself
    const debtStart = yearBefore(asOf);

    const untracked = await d.loadUntracked(debtStart, asOf);
    const rates = new Map<string, number>();
    const need = new Set<string>();
    for (const l of d.loans) need.add(String(l.currency ?? reporting));
    for (const a of untracked) {
      need.add(String(a.currency ?? reporting));
      for (const p of a.payments) need.add(String(p.currency ?? reporting));
    }
    for (const c of need) rates.set(c, await fxFor(c));
    const debt = computeDebtService({
      loans: d.loans,
      untrackedLiabilities: untracked,
      windowStart: debtStart,
      windowEnd: asOf,
      convert: (amount, currency) => amount * (rates.get(String(currency ?? reporting)) ?? 1),
    });

    const nw = netWorthAt(month);
    const nwPast = netWorthAt(shiftMonth(month, -3));
    const incomeUpTo = aomIncome.filter((r) => r.date <= asOf);
    const expensesUpTo = aomExpenses.filter((r) => r.date <= asOf);
    const aom = computeAgeOfMoney(incomeUpTo, expensesUpTo.slice(0, 10), expensesUpTo.slice(10, 20));
    const b = budgetsBy.get(month);

    out.push({
      month,
      income3m: sumMonths(income, threeStart, month),
      expenses3m: sumMonths(expenses, threeStart, month),
      income12m: sumMonths(income, shiftMonth(month, -11), month),
      debtPayments12m: debt.total,
      dtiReliable: debt.reliable,
      liquidAssets: liquidAt(month),
      netWorth: nw,
      netWorthPast: nwPast,
      enoughHistory: oldest != null && dayDiff(asOf, oldest) >= 60,
      budgetsOnTrack: b?.onTrack ?? 0,
      budgetsTotal: b?.total ?? 0,
      ageOfMoneyDays: aom.ageInDays,
      ageOfMoneyTrend: aom.trend,
    });
  }
  return out;
}
