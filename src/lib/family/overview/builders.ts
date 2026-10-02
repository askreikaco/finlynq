/**
 * Section builders for the Family Wealth overview. One builder per registry section
 * (FAMILY_SECTIONS_V1); assemble.ts calls a builder ONLY for sections the share grants.
 *
 * Rules (enforced by tests/family/family-p4-guards.test.ts):
 *  - data comes only from ../read-queries (read-only barrel) + the pure FX context;
 *  - builders never see a DEK or a key: names arrive as pre-decrypted label maps (sidecar for a
 *    shared owner, own rows for "me") and fall back to generic "Account 1" style labels;
 *  - numbers are converted into the VIEWER's display currency; a missing rate/price yields null +
 *    a partial reason, never a 1:1 conversion.
 *
 * Valuation basis mirrors the owner's own surfaces (reports balance-sheet / dashboard hero):
 * all accounts incl. archived, assets = type A, liabilities = |type L|, net = assets - liabilities.
 * Deliberate difference: investment accounts use the latest stored portfolio_snapshots value
 * (DEK-free; symbols are ciphertext so live pricing needs the owner's DEK, which a viewer never
 * has). It is the same market value the nightly builder derives with the existing price logic,
 * at most one day stale, and carries its own asOf.
 */
import type { FamilySection } from "../sections";
import { sharedRead } from "./shared-reads";
import {
  buildNetWorthHistory,
  computeDebtService,
  computeGoalProgress,
  convertReportingSlice,
  getCashSnapshotsInRange,
  getIncomeVsExpenses,
  getIncomeVsExpensesDaily,
  getInvestmentSnapshotsInRange,
  getLinkedAccountBalances,
  getOwnerAccountBalances,
  getOwnerBudgets,
  getOwnerGoals,
  getOwnerLoans,
  getOwnerPortfolioPerformance,
  getOwnerSpendSlices,
  getOwnerUntrackedLiabilities,
  summarizeLoan,
  type AccountSnapshot,
  type DebtServiceLoan,
  type LiveAccountValue,
  type OwnerAccountRow,
  type OwnerLoanRow,
  type SpendSlice,
  type UntrackedLiabilityAccount,
} from "../read-queries";
import type { FxContext } from "./fx";
import type { OverviewPeriod, PartialReason, SectionsDto } from "./dto";

export interface MemberCtx {
  ownerId: string;
  fx: FxContext;
  today: string;
  period: OverviewPeriod;
  /** sections this member grants the viewer (cross-section cards such as DTI check it) */
  granted: readonly FamilySection[];
  /** section -> (entity id -> decrypted label). Missing entries render as generic labels. */
  labels: Map<FamilySection, Map<number, string>>;
  partial: Set<PartialReason>;
  generic: { used: boolean };
  memo: { valuation?: Promise<Valuation[]>; invSnaps?: Promise<AccountSnapshot[]> };
  /** step timings ("label=Nms", durations only, never values) for the [family] timing log */
  steps?: string[];
  /** a manual Refresh: shared reads (shared-reads.ts) only reuse a sibling request's fresh load */
  refresh?: boolean;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Time one step into ctx.steps (durations only). */
async function timed<T>(ctx: MemberCtx, label: string, fn: () => Promise<T> | T): Promise<T> {
  const t0 = Date.now();
  try {
    return await fn();
  } finally {
    (ctx.steps ??= []).push(`${label}=${Date.now() - t0}ms`);
  }
}

function labelOf(ctx: MemberCtx, section: FamilySection, id: number, ordinal: number, noun: string) {
  const found = ctx.labels.get(section)?.get(id);
  if (found) return { label: found, labelIsGeneric: false };
  ctx.generic.used = true;
  return { label: `${noun} ${ordinal}`, labelIsGeneric: true };
}

// ─── ranges (pure) ─────────────────────────────────────────────────────────────────────────────

const pad2 = (n: number) => String(n).padStart(2, "0");

/** First day of the month `back` months before today's month (UTC, YYYY-MM-01). */
function monthStart(today: string, back: number): string {
  const [y, m] = today.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 - back, 1));
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-01`;
}

/**
 * First day of the selected range for flow figures (cashflow, savings rate, Income vs Expenses);
 * null = all time. "month" = month-to-date, "year" = year-to-date; the legacy rolling windows keep
 * their calendar-month alignment (6 / 12 months incl. the current one).
 */
export function rangeStart(period: OverviewPeriod, today: string): string | null {
  switch (period) {
    case "month":
      return `${today.slice(0, 7)}-01`;
    case "year":
      return `${today.slice(0, 4)}-01-01`;
    case "6m":
      return monthStart(today, 5);
    case "1y":
      return monthStart(today, 11);
    case "all":
      return null;
  }
}

/** buildNetWorthHistory window for a range: calendar ranges start on their first day. */
export function historyWindow(
  period: OverviewPeriod,
  today: string,
): { period: "6m" | "1y" | "all"; firstDay?: string } {
  if (period === "6m" || period === "1y" || period === "all") return { period };
  return { period: "1y", firstDay: rangeStart(period, today) as string };
}

/** /api/portfolio/performance period key for a range (mtd = month-to-date). */
export function performancePeriodKey(period: OverviewPeriod): string {
  return period === "month" ? "mtd" : period === "year" ? "ytd" : period;
}

/** Calendar months touched from `from` (YYYY-MM-DD) to today, inclusive. */
export function monthsSpanned(from: string, today: string): number {
  const [fy, fm] = from.split("-").map(Number);
  const [ty, tm] = today.split("-").map(Number);
  return Math.max(1, (ty - fy) * 12 + (tm - fm) + 1);
}

/** Even-stride downsample that always keeps the first and the last point. */
export function downsample<T>(points: T[], max: number): T[] {
  if (points.length <= max || max < 2) return points;
  const out: T[] = [];
  const step = (points.length - 1) / (max - 1);
  for (let i = 0; i < max; i++) out.push(points[Math.round(i * step)]);
  return out;
}

/** Savings rate exactly as the dashboard (financial-health.ts): round((I - E) / I * 100), null without income. */
export function savingsRatePct(income: number, expenses: number): number | null {
  return income > 0 ? Math.round(((income - expenses) / income) * 100) : null;
}

/** Debt-to-income exactly as the dashboard: round(debt12m / income12m * 100), null without income. */
export function dtiPct(debtPayments12m: number, income12m: number): number | null {
  return income12m > 0 ? Math.round((debtPayments12m / income12m) * 100) : null;
}

// ─── valuation (shared by net_worth, accounts, investments, goals) ─────────────────────────────

export type Valuation = {
  row: OwnerAccountRow;
  /** balance in the account currency; null = not priced */
  balance: number | null;
  basis: "ledger" | "market_snapshot" | "unpriced";
  asOf: string | null;
  converted: number | null;
  /** why converted is null */
  missing: "investment_unpriced" | "fx_rate_missing" | null;
};

function invSnapshots(ctx: MemberCtx): Promise<AccountSnapshot[]> {
  return (ctx.memo.invSnaps ??= (async () => {
    const rows = await timed(ctx, "invSnaps.query", () =>
      sharedRead("invSnaps", ctx.ownerId, ctx.today, { refresh: ctx.refresh }, () =>
        getInvestmentSnapshotsInRange(ctx.ownerId, "1900-01-01", ctx.today),
      ),
    );
    return rows
      .filter((r) => r.accountId != null)
      .map((r) => ({
        accountId: r.accountId as number,
        snapDate: r.snapDate,
        marketValue: Number(r.marketValue),
        currency: r.currency,
        nativeMarketValue: r.nativeMarketValue == null ? null : Number(r.nativeMarketValue),
        nativeCurrency: r.nativeCurrency,
      }));
  })());
}

function valuation(ctx: MemberCtx): Promise<Valuation[]> {
  return (ctx.memo.valuation ??= (async () => {
    const rows = await timed(ctx, "val.balances", () =>
      sharedRead("balances", ctx.ownerId, ctx.today, { refresh: ctx.refresh }, () => getOwnerAccountBalances(ctx.ownerId)),
    );
    const hasInv = rows.some((r) => r.isInvestment);
    const snaps = hasInv ? await invSnapshots(ctx) : [];
    const latest = new Map<number, AccountSnapshot>();
    for (const s of snaps) {
      const cur = latest.get(s.accountId);
      if (!cur || s.snapDate >= cur.snapDate) latest.set(s.accountId, s);
    }
    await ctx.fx.prepare([
      ...rows.map((r) => r.currency),
      ...[...latest.values()].flatMap((s) => [s.currency, s.nativeCurrency]),
    ]);

    return rows.map((row): Valuation => {
      if (!row.isInvestment) {
        const converted = ctx.fx.convert(row.ledgerBalance, row.currency);
        return {
          row,
          balance: row.ledgerBalance,
          basis: "ledger",
          asOf: null,
          converted,
          missing: converted == null ? "fx_rate_missing" : null,
        };
      }
      // An investment account's ledger sum is net contributions, NOT its value: never used.
      const snap = latest.get(row.id);
      if (!snap) {
        return { row, balance: null, basis: "unpriced", asOf: null, converted: null, missing: "investment_unpriced" };
      }
      const useNative = snap.nativeMarketValue != null && snap.nativeCurrency;
      const amount = useNative ? (snap.nativeMarketValue as number) : snap.marketValue;
      const ccy = (useNative ? snap.nativeCurrency : snap.currency) as string;
      let balance: number | null;
      if (ccy.toUpperCase() === row.currency.toUpperCase()) balance = amount;
      else {
        const cross = ctx.fx.cross(ccy, row.currency);
        balance = cross == null ? null : amount * cross;
      }
      const converted = ctx.fx.convert(balance, row.currency);
      return {
        row,
        balance,
        basis: "market_snapshot",
        asOf: snap.snapDate,
        converted,
        missing: converted == null ? "fx_rate_missing" : null,
      };
    });
  })());
}

// ─── net_worth ─────────────────────────────────────────────────────────────────────────────────

export async function buildNetWorth(ctx: MemberCtx): Promise<NonNullable<SectionsDto["net_worth"]>> {
  const vals = await timed(ctx, "nw.valuation", () => valuation(ctx));
  let assets = 0;
  let liabilities = 0;
  for (const v of vals) {
    if (v.converted == null) {
      ctx.partial.add(v.missing ?? "fx_rate_missing");
      continue;
    }
    if (v.row.type === "A") assets += v.converted;
    else if (v.row.type === "L") liabilities += Math.abs(v.converted);
  }

  const [cashRaw, invRaw] = await Promise.all([
    timed(ctx, "nw.cashSnaps", () =>
      sharedRead("cashSnaps", ctx.ownerId, ctx.today, { refresh: ctx.refresh }, () =>
        getCashSnapshotsInRange(ctx.ownerId, "1900-01-01", ctx.today),
      ),
    ),
    timed(ctx, "nw.invSnaps", () => invSnapshots(ctx)),
  ]);
  const cash: AccountSnapshot[] = cashRaw
    .filter((r) => r.accountId != null)
    .map((r) => ({
      accountId: r.accountId as number,
      snapDate: r.snapDate,
      marketValue: Number(r.marketValue),
      currency: r.currency,
      nativeMarketValue: r.nativeMarketValue == null ? null : Number(r.nativeMarketValue),
      nativeCurrency: r.nativeCurrency,
    }));
  await timed(ctx, "nw.fx", () => ctx.fx.prepare([...cash.map((s) => s.currency), ...invRaw.map((s) => s.currency)]));
  const usable = (s: AccountSnapshot) => ctx.fx.rate(s.currency) != null;
  if (cash.some((s) => !usable(s)) || invRaw.some((s) => !usable(s))) ctx.partial.add("fx_rate_missing");

  const liveCash = new Map<number, LiveAccountValue>();
  for (const v of vals) {
    if (v.row.isInvestment || v.converted == null || v.balance == null) continue;
    liveCash.set(v.row.id, { value: v.balance, currency: v.row.currency });
  }
  const tHist = Date.now();
  const hist = buildNetWorthHistory({
    ...historyWindow(ctx.period, ctx.today),
    displayCurrency: ctx.fx.display,
    rateMap: ctx.fx.map,
    cashSnapshots: cash.filter(usable),
    liveCashByAccount: liveCash,
    snapshots: invRaw.filter(usable),
    today: ctx.today,
  });
  (ctx.steps ??= []).push(`nw.history(cpu)=${Date.now() - tHist}ms rows=${cash.length + invRaw.length}`);

  return {
    assets: r2(assets),
    liabilities: r2(liabilities),
    net: r2(assets - liabilities),
    history: hist.series.map((p) => ({ date: p.date, value: r2(p.value) })),
    historyFxApproximation: hist.fxApproximation,
  };
}

// ─── accounts ──────────────────────────────────────────────────────────────────────────────────

export async function buildAccounts(ctx: MemberCtx): Promise<NonNullable<SectionsDto["accounts"]>> {
  const vals = await valuation(ctx);
  const accounts = vals.map((v, i) => {
    if (v.converted == null) ctx.partial.add(v.missing ?? "fx_rate_missing");
    const l = labelOf(ctx, "accounts", v.row.id, i + 1, "Account");
    return {
      ref: `a${i + 1}`,
      label: l.label,
      labelIsGeneric: l.labelIsGeneric,
      type: v.row.type,
      group: v.row.group,
      archived: v.row.archived,
      currency: v.row.currency,
      balance: v.balance == null ? null : r2(v.balance),
      converted: v.converted,
      basis: v.basis,
      asOf: v.asOf,
    };
  });
  const groupTotals = new Map<string, { group: string; type: string; converted: number }>();
  for (const a of accounts) {
    if (a.converted == null) continue;
    const key = `${a.type}|${a.group}`;
    const cur = groupTotals.get(key) ?? { group: a.group, type: a.type, converted: 0 };
    cur.converted = r2(cur.converted + a.converted);
    groupTotals.set(key, cur);
  }
  return { accounts, groups: [...groupTotals.values()] };
}

// ─── investments ───────────────────────────────────────────────────────────────────────────────

/** Points kept per performance series (the /portfolio chart itself plots at most 200). */
const MAX_PERFORMANCE_POINTS = 400;

export async function buildInvestments(ctx: MemberCtx): Promise<NonNullable<SectionsDto["investments"]>> {
  const vals = (await valuation(ctx)).filter((v) => v.row.isInvestment);
  let value = 0;
  let priced = 0;
  let unpriced = 0;
  let asOf: string | null = null;
  for (const v of vals) {
    if (v.converted == null) {
      unpriced++;
      ctx.partial.add(v.missing ?? "investment_unpriced");
      continue;
    }
    priced++;
    value += v.converted;
    if (v.asOf && (!asOf || v.asOf > asOf)) asOf = v.asOf;
  }

  // The /portfolio Performance card, run for the owner (aggregate snapshot rows, DEK-free).
  const perf = await timed(ctx, "inv.performance", () =>
    getOwnerPortfolioPerformance(ctx.ownerId, performancePeriodKey(ctx.period), ctx.today),
  );
  await ctx.fx.prepare(perf.series.map((p) => p.currency));
  const series: Array<{ date: string; marketValue: number; costBasis: number }> = [];
  for (const p of perf.series) {
    const marketValue = ctx.fx.convert(p.marketValue, p.currency);
    const costBasis = ctx.fx.convert(p.costBasis, p.currency);
    if (marketValue == null || costBasis == null) {
      ctx.partial.add("fx_rate_missing");
      continue;
    }
    series.push({ date: p.date, marketValue, costBasis });
  }

  return {
    holdingsValue: r2(value),
    asOf,
    accountsPriced: priced,
    accountsUnpriced: unpriced,
    performance: {
      from: perf.from,
      to: perf.to,
      series: downsample(series, MAX_PERFORMANCE_POINTS),
      // Returns can be NaN/Infinity (e.g. an all-time window that starts at a
      // zero balance); JSON/zod reject those, so they travel as null ("—").
      twrr: { period: finiteOrNull(perf.twrr.period), annualized: finiteOrNull(perf.twrr.annualized) },
      mwrr: { irr: finiteOrNull(perf.mwrr.irr), converged: perf.mwrr.converged },
      gapsFilledDays: perf.gapsFilledDays,
    },
  };
}

// ─── goals ─────────────────────────────────────────────────────────────────────────────────────

export async function buildGoals(ctx: MemberCtx): Promise<NonNullable<SectionsDto["goals"]>> {
  const goals = await getOwnerGoals(ctx.ownerId);
  if (goals.length === 0) return { goals: [] };
  const vals = await valuation(ctx);
  await ctx.fx.prepare(goals.map((g) => g.currency));

  // Per-account value in the account currency; NaN (not 0) when unpriced so progress is withheld.
  const valueByAccount = new Map<number, number>(vals.map((v) => [v.row.id, v.balance ?? Number.NaN]));
  const progress = await computeGoalProgress(
    ctx.ownerId,
    null,
    goals.map((g) => ({
      id: g.id,
      type: g.type,
      currency: g.currency,
      targetAmount: g.targetAmount,
      deadline: g.deadline,
      accountIds: g.accountIds,
    })),
    { valueByAccount, fx: async (from, to) => ctx.fx.cross(from, to) ?? Number.NaN },
  );

  const byId = new Map(vals.map((v) => [v.row.id, v]));
  const out = goals.map((g, i) => {
    const l = labelOf(ctx, "goals", g.id, i + 1, "Goal");
    const p = progress.get(g.id);
    const ok = p != null && Number.isFinite(p.currentAmount) && Number.isFinite(p.progress);
    if (!ok) {
      const unpriced = g.accountIds.some((id) => byId.get(id)?.missing === "investment_unpriced");
      ctx.partial.add(unpriced ? "investment_unpriced" : "fx_rate_missing");
    }
    return {
      ref: `g${i + 1}`,
      label: l.label,
      labelIsGeneric: l.labelIsGeneric,
      type: g.type,
      status: g.status,
      currency: g.currency,
      targetAmount: g.targetAmount,
      currentAmount: ok ? p.currentAmount : null,
      progress: ok ? p.progress : null,
      remaining: ok ? p.remaining : null,
      monthlyNeeded: ok ? p.monthlyNeeded : null,
      deadline: g.deadline,
    };
  });
  return { goals: out };
}

// ─── loans ─────────────────────────────────────────────────────────────────────────────────────

export async function buildLoans(ctx: MemberCtx): Promise<NonNullable<SectionsDto["loans"]>> {
  const loans = await getOwnerLoans(ctx.ownerId);
  if (loans.length === 0) return { loans: [] };
  const linked = [...new Set(loans.map((l) => l.accountId).filter((x): x is number => x != null))];
  const acct = await getLinkedAccountBalances(ctx.ownerId, linked);
  await ctx.fx.prepare(loans.map((l) => l.currency));
  const out = loans.map((loan, i) => {
    const l = labelOf(ctx, "loans", loan.id, i + 1, "Loan");
    const s = summarizeLoan(loan, acct, ctx.today);
    const ok = !("integrity" in s);
    const remaining = ok ? s.remainingBalance : null;
    const converted = ctx.fx.convert(remaining, loan.currency);
    if (remaining != null && converted == null) ctx.partial.add("fx_rate_missing");
    return {
      ref: `l${i + 1}`,
      label: l.label,
      labelIsGeneric: l.labelIsGeneric,
      type: loan.type,
      currency: loan.currency,
      principal: loan.principal,
      annualRate: loan.annualRate,
      remainingBalance: remaining,
      remainingBalanceConverted: converted,
      balanceSource: ok ? s.balanceSource : null,
      monthlyPayment: ok ? s.monthlyPayment : null,
      payoffDate: ok ? s.payoffDate : null,
    };
  });
  return { loans: out };
}

// ─── budgets ───────────────────────────────────────────────────────────────────────────────────

function sliceValue(fx: FxContext, row: SpendSlice): number | null {
  const stored = row.reportingCurrency?.toUpperCase() === fx.display && row.totalReporting != null;
  if (!stored && fx.rate(row.currency ?? fx.display) == null) return null;
  return convertReportingSlice(row, fx.display, fx.map);
}

export async function buildBudgets(ctx: MemberCtx): Promise<NonNullable<SectionsDto["budgets"]>> {
  const month = ctx.today.slice(0, 7);
  const budgets = await getOwnerBudgets(ctx.ownerId, month);
  if (budgets.length === 0) return { month, budgets: [] };
  const slices = await getOwnerSpendSlices(ctx.ownerId, `${month}-01`, `${month}-31`);
  await ctx.fx.prepare([...budgets.map((b) => b.currency), ...slices.map((s) => s.currency)]);

  const actual = new Map<number, { sum: number; missing: boolean }>();
  for (const s of slices) {
    if (s.categoryId == null) continue;
    const cur = actual.get(s.categoryId) ?? { sum: 0, missing: false };
    const v = sliceValue(ctx.fx, s);
    if (v == null) cur.missing = true;
    else cur.sum += v;
    actual.set(s.categoryId, cur);
  }
  const out = budgets.map((b, i) => {
    const l = labelOf(ctx, "budgets", b.categoryId, i + 1, "Category");
    const budgeted = ctx.fx.convert(b.amount, b.currency);
    const a = actual.get(b.categoryId);
    const actualVal = a ? (a.missing ? null : r2(-a.sum)) : 0;
    if (budgeted == null || (a && a.missing)) ctx.partial.add("fx_rate_missing");
    return { ref: `b${i + 1}`, label: l.label, labelIsGeneric: l.labelIsGeneric, budgeted, actual: actualVal };
  });
  return { month, budgets: out };
}

// ─── cashflow (+ savings rate, debt-to-income) ────────────────────────────────────────────────

type FlowRow = {
  type: string | null;
  currency: string | null;
  reportingCurrency: string | null;
  totalAmount: number | string | null;
  totalReporting: number | string | null;
};

function flowValue(fx: FxContext, r: FlowRow): number | null {
  return sliceValue(fx, {
    categoryId: null,
    currency: r.currency,
    reportingCurrency: r.reportingCurrency,
    totalAmount: r.totalAmount == null ? null : Number(r.totalAmount),
    totalReporting: r.totalReporting == null ? null : Number(r.totalReporting),
  });
}

export async function buildCashflow(ctx: MemberCtx): Promise<NonNullable<SectionsDto["cashflow"]>> {
  const from = rangeStart(ctx.period, ctx.today);
  const end = `${ctx.today.slice(0, 7)}-31`;
  const twelveStart = trailingTwelveStart(ctx.today);
  const [rows, dailyRows, twelveRows] = await Promise.all([
    getIncomeVsExpenses(ctx.ownerId, from ?? "1900-01-01", end),
    ctx.period === "month" ? getIncomeVsExpensesDaily(ctx.ownerId, from as string, end) : Promise.resolve([]),
    // Savings rate (and DTI income) always use the trailing 12 months, whatever the period filter.
    getIncomeVsExpenses(ctx.ownerId, twelveStart, "9999-12-31"),
  ]);
  await ctx.fx.prepare([...rows, ...dailyRows, ...twelveRows].map((r) => r.currency));

  const months = new Map<string, { income: number; expenses: number }>();
  let income = 0;
  let expenses = 0;
  for (const r of rows) {
    const v = flowValue(ctx.fx, r);
    if (v == null) {
      ctx.partial.add("fx_rate_missing");
      continue;
    }
    const cur = months.get(r.month) ?? { income: 0, expenses: 0 };
    if (r.type === "I") {
      cur.income += v;
      income += v;
    } else {
      cur.expenses += -v;
      expenses += -v;
    }
    months.set(r.month, cur);
  }
  // dashboard savings-rate basis: expenses summed as |slice| (financial-health.ts), trailing 12 months
  let savingsIncome = 0;
  let savingsExpenses = 0;
  for (const r of twelveRows) {
    const v = flowValue(ctx.fx, r);
    if (v == null) {
      ctx.partial.add("fx_rate_missing");
      continue;
    }
    if (r.type === "I") savingsIncome += v;
    else savingsExpenses += Math.abs(v);
  }
  const monthly = [...months.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, v]) => ({ month, income: r2(v.income), expenses: r2(v.expenses) }));

  const days = new Map<string, { income: number; expenses: number }>();
  for (const r of dailyRows) {
    const v = flowValue(ctx.fx, r);
    if (v == null) continue; // already flagged by the monthly pass (same slices)
    const cur = days.get(r.day) ?? { income: 0, expenses: 0 };
    if (r.type === "I") cur.income += v;
    else cur.expenses += -v;
    days.set(r.day, cur);
  }
  const daily = [...days.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => ({ date, income: r2(v.income), expenses: r2(v.expenses) }));

  const windowMonths = from
    ? monthsSpanned(from, ctx.today)
    : monthly.length > 0
      ? monthsSpanned(`${monthly[0].month}-01`, ctx.today)
      : 0;

  return {
    from,
    windowMonths,
    income: r2(income),
    expenses: r2(expenses),
    monthly,
    daily,
    savings: {
      income: r2(savingsIncome),
      expenses: r2(savingsExpenses),
      ratePct: savingsRatePct(savingsIncome, savingsExpenses),
    },
    // DTI discloses debt service: only when the member ALSO shares loans.
    debtToIncome: ctx.granted.includes("loans") ? await buildDebtToIncome(ctx, twelveStart, twelveRows) : null,
  };
}

function toDebtLoan(l: OwnerLoanRow): DebtServiceLoan {
  return {
    id: l.id,
    accountId: l.accountId,
    currency: l.currency ?? null,
    principal: Number(l.principal),
    annualRate: Number(l.annualRate),
    termMonths: l.termMonths == null ? null : Number(l.termMonths),
    startDate: String(l.startDate),
    paymentAmount: l.paymentAmount == null ? null : Number(l.paymentAmount),
    paymentFrequency: l.paymentFrequency ?? null,
    extraPayment: l.extraPayment == null ? null : Number(l.extraPayment),
    residualValue: l.residualValue == null ? null : Number(l.residualValue),
  };
}

/**
 * The dashboard's Debt-to-Income (financial-health.ts + health/debt-service.ts) for the owner:
 * trailing-12-month debt service / trailing-12-month income, converted at the VIEWER's rates.
 * A missing rate yields pct null + partial (never a 1:1 conversion).
 */
function trailingTwelveStart(today: string): string {
  const [y, m, d] = today.split("-").map(Number);
  return new Date(Date.UTC(y - 1, m - 1, d)).toISOString().slice(0, 10);
}

async function buildDebtToIncome(
  ctx: MemberCtx,
  twelveStart: string,
  incomeRows: FlowRow[],
): Promise<NonNullable<NonNullable<SectionsDto["cashflow"]>["debtToIncome"]>> {
  const [loans, untracked] = await Promise.all([
    getOwnerLoans(ctx.ownerId),
    getOwnerUntrackedLiabilities(ctx.ownerId, twelveStart, ctx.today),
  ]);
  const debtLoans = loans.map(toDebtLoan);
  const debtCcys = [
    ...debtLoans.map((l) => l.currency),
    ...untracked.flatMap((a: UntrackedLiabilityAccount) => [a.currency, ...a.payments.map((p) => p.currency)]),
  ].map((c) => c ?? ctx.fx.display);
  await ctx.fx.prepare([...incomeRows.map((r) => r.currency), ...debtCcys]);

  let fxMissing = debtCcys.some((c) => ctx.fx.rate(c) == null);
  let income12m = 0;
  for (const r of incomeRows) {
    if (r.type !== "I") continue;
    const v = flowValue(ctx.fx, r);
    if (v == null) fxMissing = true;
    else income12m += v;
  }
  if (fxMissing) {
    ctx.partial.add("fx_rate_missing");
    return { pct: null, reliable: true, debtPayments12m: 0, income12m: 0 };
  }

  const service = computeDebtService({
    loans: debtLoans,
    untrackedLiabilities: untracked,
    windowStart: twelveStart,
    windowEnd: ctx.today,
    convert: (amount, currency) => amount * (ctx.fx.rate(currency ?? ctx.fx.display) as number),
  });
  return {
    pct: dtiPct(service.total, income12m),
    reliable: service.reliable,
    debtPayments12m: r2(service.total),
    income12m: r2(income12m),
  };
}

/** Registry dispatch: one builder per FAMILY_SECTIONS_V1 entry (exhaustive by type). */
export const SECTION_BUILDERS: { [S in FamilySection]: (ctx: MemberCtx) => Promise<NonNullable<SectionsDto[S]>> } = {
  net_worth: buildNetWorth,
  accounts: buildAccounts,
  investments: buildInvestments,
  goals: buildGoals,
  budgets: buildBudgets,
  loans: buildLoans,
  cashflow: buildCashflow,
};

/** A finite number, else null (NaN / ±Infinity can't be serialized). */
export function finiteOrNull(n: number | null | undefined): number | null {
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}
