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
import {
  buildNetWorthHistory,
  computeGoalProgress,
  convertReportingSlice,
  getCashSnapshotsInRange,
  getIncomeVsExpenses,
  getInvestmentSnapshotsInRange,
  getLinkedAccountBalances,
  getOwnerAccountBalances,
  getOwnerBudgets,
  getOwnerGoals,
  getOwnerHoldings,
  getOwnerLoans,
  getOwnerSpendSlices,
  summarizeLoan,
  type AccountSnapshot,
  type LiveAccountValue,
  type NetWorthPeriod,
  type OwnerAccountRow,
  type SpendSlice,
} from "../read-queries";
import type { FxContext } from "./fx";
import type { PartialReason, SectionsDto } from "./dto";

export interface MemberCtx {
  ownerId: string;
  fx: FxContext;
  today: string;
  period: NetWorthPeriod;
  /** section -> (entity id -> decrypted label). Missing entries render as generic labels. */
  labels: Map<FamilySection, Map<number, string>>;
  partial: Set<PartialReason>;
  generic: { used: boolean };
  memo: { valuation?: Promise<Valuation[]>; invSnaps?: Promise<AccountSnapshot[]> };
}

const r2 = (n: number) => Math.round(n * 100) / 100;

function labelOf(ctx: MemberCtx, section: FamilySection, id: number, ordinal: number, noun: string) {
  const found = ctx.labels.get(section)?.get(id);
  if (found) return { label: found, labelIsGeneric: false };
  ctx.generic.used = true;
  return { label: `${noun} ${ordinal}`, labelIsGeneric: true };
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
    const rows = await getInvestmentSnapshotsInRange(ctx.ownerId, "1900-01-01", ctx.today);
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
    const rows = await getOwnerAccountBalances(ctx.ownerId);
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
  const vals = await valuation(ctx);
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
    getCashSnapshotsInRange(ctx.ownerId, "1900-01-01", ctx.today),
    invSnapshots(ctx),
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
  await ctx.fx.prepare([...cash.map((s) => s.currency), ...invRaw.map((s) => s.currency)]);
  const usable = (s: AccountSnapshot) => ctx.fx.rate(s.currency) != null;
  if (cash.some((s) => !usable(s)) || invRaw.some((s) => !usable(s))) ctx.partial.add("fx_rate_missing");

  const liveCash = new Map<number, LiveAccountValue>();
  for (const v of vals) {
    if (v.row.isInvestment || v.converted == null || v.balance == null) continue;
    liveCash.set(v.row.id, { value: v.balance, currency: v.row.currency });
  }
  const hist = buildNetWorthHistory({
    period: ctx.period,
    displayCurrency: ctx.fx.display,
    rateMap: ctx.fx.map,
    cashSnapshots: cash.filter(usable),
    liveCashByAccount: liveCash,
    snapshots: invRaw.filter(usable),
    today: ctx.today,
  });

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

  const holdingsRaw = (await getOwnerHoldings(ctx.ownerId)).filter((h) => !h.isCash && Math.abs(h.quantity) > 1e-9);
  const holdings = holdingsRaw.map((h, i) => {
    const l = labelOf(ctx, "investments", h.id, i + 1, "Holding");
    return {
      ref: `h${i + 1}`,
      label: l.label,
      labelIsGeneric: l.labelIsGeneric,
      currency: h.currency,
      quantity: h.quantity,
      isCrypto: h.isCrypto,
    };
  });

  const invRaw = await invSnapshots(ctx);
  await ctx.fx.prepare(invRaw.map((s) => s.currency));
  const trend = buildNetWorthHistory({
    period: ctx.period,
    displayCurrency: ctx.fx.display,
    rateMap: ctx.fx.map,
    cashSnapshots: [],
    snapshots: invRaw.filter((s) => ctx.fx.rate(s.currency) != null),
    today: ctx.today,
  }).series.map((p) => ({ date: p.date, value: r2(p.value) }));

  return { holdingsValue: r2(value), asOf, accountsPriced: priced, accountsUnpriced: unpriced, holdings, trend };
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

// ─── cashflow ──────────────────────────────────────────────────────────────────────────────────

const WINDOW_MONTHS = 12;

export async function buildCashflow(ctx: MemberCtx): Promise<NonNullable<SectionsDto["cashflow"]>> {
  const [y, m] = ctx.today.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1 - (WINDOW_MONTHS - 1), 1));
  const start = first.toISOString().slice(0, 10);
  const rows = await getIncomeVsExpenses(ctx.ownerId, start, `${ctx.today.slice(0, 7)}-31`);
  await ctx.fx.prepare(rows.map((r) => r.currency));
  const months = new Map<string, { income: number; expenses: number }>();
  let income = 0;
  let expenses = 0;
  for (const r of rows) {
    const v = sliceValue(ctx.fx, {
      categoryId: null,
      currency: r.currency,
      reportingCurrency: r.reportingCurrency,
      totalAmount: r.totalAmount == null ? null : Number(r.totalAmount),
      totalReporting: r.totalReporting == null ? null : Number(r.totalReporting),
    });
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
  const monthly = [...months.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, v]) => ({ month, income: r2(v.income), expenses: r2(v.expenses) }));
  return { windowMonths: WINDOW_MONTHS, income: r2(income), expenses: r2(expenses), monthly };
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
