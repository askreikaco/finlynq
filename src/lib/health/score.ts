/**
 * Pure scoring for the 6-component financial-health score. One definition, two callers:
 *   - calculateFinancialHealth (src/lib/financial-health.ts): the CURRENT value (REST + MCP; tests pin it);
 *   - buildHealthSeries below: the same formulas evaluated at each past month-end, for the dashboard's
 *     Financial Health / Debt-to-Income cards (monthly sparkline, % badge, signed difference).
 *
 * Nothing here touches the database or FX: callers pass already-converted figures. The functions are the exact
 * formulas that used to be inline in calculateFinancialHealth (same rounding, same exclusions, same renormalization).
 */

import type { MonthPoint } from "../metrics/period";

/** Canonical weights (must sum to 1.0). */
export const HEALTH_WEIGHTS = {
  savingsRate: 0.25,
  dti: 0.2,
  emergencyFund: 0.15,
  netWorthTrend: 0.15,
  budgetAdherence: 0.15,
  ageOfMoney: 0.1,
} as const;

export type NetWorthTrendDetail = {
  direction: "up" | "down" | "flat";
  magnitudePct: number;
  descriptor: string;
};

export type HealthComponent = {
  name: string;
  score: number;
  weight: number;
  weighted: number;
  detail: string;
  detailRich?: NetWorthTrendDetail;
};

export type HealthExclusion = { name: string; reason: string; detail: string };

export type HealthGrade = "Excellent" | "Good" | "Fair" | "Needs Work";

export function gradeFor(score: number): HealthGrade {
  return score >= 80 ? "Excellent" : score >= 60 ? "Good" : score >= 40 ? "Fair" : "Needs Work";
}

// ── 1. Savings Rate (3-month window) ─────────────────────────────────────
export function scoreSavingsRate(income: number, expenses: number): { score: number; detail: string; ratePct: number | null } {
  const score = income > 0 ? Math.min(100, Math.max(0, ((income - expenses) / income) * 500)) : 0;
  const detail = income > 0 ? `${Math.round(((income - expenses) / income) * 100)}% savings rate` : "No income data";
  const ratePct = income > 0 ? Math.round(((income - expenses) / income) * 100) : null;
  return { score, detail, ratePct };
}

// ── 2. Debt-to-Income (trailing 12 months) ───────────────────────────────
export function scoreDti(income12m: number, debtPayments12m: number, reliable: boolean): {
  score: number; detail: string; ratio: number | null; pct: number | null; reliable: boolean;
} {
  const ratio = income12m > 0 ? debtPayments12m / income12m : null;
  const score = ratio !== null ? Math.min(100, Math.max(0, (1 - ratio) * 100)) : debtPayments12m === 0 ? 100 : 0;
  const detail =
    ratio !== null
      ? `${Math.round(ratio * 100)}% debt-to-income (12m)`
      : debtPayments12m === 0
        ? "No debt payments (12m)"
        : "No income data (12m)";
  return { score, detail, ratio, pct: ratio !== null ? Math.round(ratio * 100) : null, reliable };
}

// ── 3. Emergency Fund ────────────────────────────────────────────────────
export function scoreEmergencyFund(liquidAssets: number, avgMonthlyExpenses: number): { score: number; detail: string } {
  const score =
    avgMonthlyExpenses > 0
      ? Math.min(100, Math.max(0, (liquidAssets / avgMonthlyExpenses / 6) * 100))
      : liquidAssets > 0
        ? 50
        : 0;
  const detail = avgMonthlyExpenses > 0 ? `${(liquidAssets / avgMonthlyExpenses).toFixed(1)} months covered` : "No expense data";
  return { score, detail };
}

// ── 4. Net Worth Trend (3-month delta) ───────────────────────────────────
export function scoreNetWorthTrend(nwToday: number, nwPast: number, insufficientHistory: boolean): {
  score: number; detail: NetWorthTrendDetail; excluded: boolean;
} {
  const nwAbsBase = Math.max(Math.abs(nwToday), Math.abs(nwPast), 1);
  const nwDelta = nwToday - nwPast;
  const magnitudePct = insufficientHistory ? 0 : Math.round((nwDelta / nwAbsBase) * 1000) / 10;
  const direction: NetWorthTrendDetail["direction"] = insufficientHistory
    ? "flat"
    : Math.abs(magnitudePct) < 0.5
      ? "flat"
      : magnitudePct > 0
        ? "up"
        : "down";
  const descriptor = insufficientHistory
    ? "Not enough history"
    : direction === "flat"
      ? "Flat over the last 3 months"
      : `${direction === "up" ? "Up" : "Down"} ${Math.abs(magnitudePct).toFixed(1)}% over the last 3 months`;
  // Score: -10% magnitude -> 0, +10% -> 100, flat -> 50.
  const score = insufficientHistory ? 0 : Math.min(100, Math.max(0, 50 + magnitudePct * 5));
  return { score, detail: { direction, magnitudePct, descriptor }, excluded: insufficientHistory };
}

// ── 5. Budget Adherence ──────────────────────────────────────────────────
export function scoreBudgetAdherence(onTrack: number, total: number): { score: number; detail: string; excluded: boolean } {
  return {
    score: total > 0 ? (onTrack / total) * 100 : 0,
    detail: total > 0 ? `${onTrack}/${total} on track` : "No budgets set",
    excluded: total === 0,
  };
}

// ── 6. Age of Money ──────────────────────────────────────────────────────
export function scoreAgeOfMoney(ageDays: number, trend: number): { score: number; detail: string; excluded: boolean } {
  let score = 50;
  let detail = "Insufficient data";
  if (ageDays > 0) {
    score = Math.min(100, Math.max(0, (ageDays / 30) * 100));
    detail = `${ageDays} days`;
    if (trend > 0) detail += ` (+${trend}d trend)`;
    else if (trend < 0) detail += ` (${trend}d trend)`;
  }
  return { score, detail, excluded: ageDays <= 0 };
}

export type HealthCandidate = {
  name: string;
  scoreRaw: number;
  weightCanonical: number;
  detail: string;
  detailRich?: NetWorthTrendDetail;
  excluded: boolean;
  excludeReason?: string;
};

/** Drop the excluded components, renormalize the kept weights, round once. Returns the 0-100 total and the pieces. */
export function composeHealthScore(candidates: HealthCandidate[]): {
  score: number;
  components: HealthComponent[];
  excludedComponents: HealthExclusion[];
} {
  const keptWeightSum = candidates.filter((c) => !c.excluded).reduce((s, c) => s + c.weightCanonical, 0);
  type WithRaw = HealthComponent & { weightedRaw: number };
  const kept: WithRaw[] = candidates
    .filter((c) => !c.excluded)
    .map((c) => {
      const weight = keptWeightSum > 0 ? c.weightCanonical / keptWeightSum : 0;
      const weightedRaw = c.scoreRaw * weight;
      const out: WithRaw = {
        name: c.name,
        score: Math.round(c.scoreRaw),
        weight: Math.round(weight * 1000) / 1000,
        weighted: Math.round(weightedRaw),
        detail: c.detail,
        weightedRaw,
      };
      if (c.detailRich) out.detailRich = c.detailRich;
      return out;
    });
  const totalRaw = kept.reduce((s, c) => s + c.weightedRaw, 0);
  return {
    score: Math.round(Math.min(100, Math.max(0, totalRaw))),
    components: kept.map(({ weightedRaw: _wr, ...rest }) => rest),
    excludedComponents: candidates
      .filter((c) => c.excluded)
      .map((c) => ({ name: c.name, reason: c.excludeReason ?? "excluded", detail: c.detail })),
  };
}

/** The six candidates from the six component results (the order and names the payload has always used). */
export function buildCandidates(c: {
  savings: ReturnType<typeof scoreSavingsRate>;
  dti: ReturnType<typeof scoreDti>;
  emergency: ReturnType<typeof scoreEmergencyFund>;
  netWorth: ReturnType<typeof scoreNetWorthTrend>;
  budget: ReturnType<typeof scoreBudgetAdherence>;
  ageOfMoney: ReturnType<typeof scoreAgeOfMoney>;
}): HealthCandidate[] {
  return [
    { name: "Savings Rate", scoreRaw: c.savings.score, weightCanonical: HEALTH_WEIGHTS.savingsRate, detail: c.savings.detail, excluded: false },
    {
      name: "Debt-to-Income",
      scoreRaw: c.dti.score,
      weightCanonical: HEALTH_WEIGHTS.dti,
      detail: !c.dti.reliable
        ? `${c.dti.detail} — card payments above the balance carried are counted as spending, not debt service`
        : c.dti.detail,
      excluded: false,
      excludeReason: undefined,
    },
    { name: "Emergency Fund", scoreRaw: c.emergency.score, weightCanonical: HEALTH_WEIGHTS.emergencyFund, detail: c.emergency.detail, excluded: false },
    {
      name: "Net Worth Trend",
      scoreRaw: c.netWorth.score,
      weightCanonical: HEALTH_WEIGHTS.netWorthTrend,
      detail: c.netWorth.detail.descriptor,
      detailRich: c.netWorth.detail,
      excluded: c.netWorth.excluded,
      excludeReason: c.netWorth.excluded ? "insufficient_history" : undefined,
    },
    {
      name: "Budget Adherence",
      scoreRaw: c.budget.score,
      weightCanonical: HEALTH_WEIGHTS.budgetAdherence,
      detail: c.budget.detail,
      excluded: c.budget.excluded,
      excludeReason: c.budget.excluded ? "no_budgets" : undefined,
    },
    {
      name: "Age of Money",
      scoreRaw: c.ageOfMoney.score,
      weightCanonical: HEALTH_WEIGHTS.ageOfMoney,
      detail: c.ageOfMoney.detail,
      excluded: c.ageOfMoney.excluded,
      excludeReason: c.ageOfMoney.excluded ? "insufficient_data" : undefined,
    },
  ];
}

// ───────────────────────── monthly series ─────────────────────────

/** Everything one month-end needs, already converted to the reporting currency. */
export type HealthMonthInputs = {
  /** "YYYY-MM": the month whose last day is the as-of date. */
  month: string;
  /** Income / expenses over the 3 months ending that month (savings rate + emergency-fund runway). */
  income3m: number;
  expenses3m: number;
  /** Trailing 12 months ending that month: income and scheduled/realized debt service. */
  income12m: number;
  debtPayments12m: number;
  dtiReliable: boolean;
  /** Cash-group, non-investment balances at month end. */
  liquidAssets: number;
  /** Net worth at month end and 3 months earlier; null when it cannot be derived (the trend component is then dropped). */
  netWorth: number | null;
  netWorthPast: number | null;
  /** The oldest transaction is >= 60 days before month end. */
  enoughHistory: boolean;
  /** Budgets of that month: on track / total (month complete). */
  budgetsOnTrack: number;
  budgetsTotal: number;
  /** FIFO age of money as of month end (0 = not computable). */
  ageOfMoneyDays: number;
  ageOfMoneyTrend: number;
};

export type HealthMonthPoint = {
  month: string;
  score: number;
  savingsRatePct: number | null;
  dtiPct: number | null;
};

/** One month's score: the same six formulas as the live calculation, evaluated on that month's inputs. */
export function healthPointForMonth(i: HealthMonthInputs): HealthMonthPoint {
  const savings = scoreSavingsRate(i.income3m, i.expenses3m);
  const dti = scoreDti(i.income12m, i.debtPayments12m, i.dtiReliable);
  const emergency = scoreEmergencyFund(i.liquidAssets, i.expenses3m / 3);
  const netWorth =
    i.netWorth != null && i.netWorthPast != null
      ? scoreNetWorthTrend(i.netWorth, i.netWorthPast, !i.enoughHistory)
      : { score: 0, detail: { direction: "flat" as const, magnitudePct: 0, descriptor: "Not enough history" }, excluded: true };
  const budget = scoreBudgetAdherence(i.budgetsOnTrack, i.budgetsTotal);
  const ageOfMoney = scoreAgeOfMoney(i.ageOfMoneyDays, i.ageOfMoneyTrend);
  const { score } = composeHealthScore(buildCandidates({ savings, dti, emergency, netWorth, budget, ageOfMoney }));
  return { month: i.month, score, savingsRatePct: savings.ratePct, dtiPct: dti.pct };
}

/** Oldest first. */
export function buildHealthSeries(inputs: readonly HealthMonthInputs[]): HealthMonthPoint[] {
  return [...inputs].sort((a, b) => a.month.localeCompare(b.month)).map(healthPointForMonth);
}

/** The three monthly series the cards use (a month with no figure, e.g. DTI without income, is simply absent). */
export function healthSeriesPoints(history: readonly HealthMonthPoint[] | null | undefined): {
  score: MonthPoint[]; dti: MonthPoint[]; savings: MonthPoint[];
} {
  const h = history ?? [];
  return {
    score: h.map((p) => ({ month: p.month, value: p.score })),
    dti: h.filter((p) => p.dtiPct != null).map((p) => ({ month: p.month, value: p.dtiPct as number })),
    savings: h.filter((p) => p.savingsRatePct != null).map((p) => ({ month: p.month, value: p.savingsRatePct as number })),
  };
}
