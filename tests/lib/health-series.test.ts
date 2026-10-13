/**
 * Month-by-month financial-health series (dashboard Financial Health / Debt-to-Income cards).
 *
 *  - the pure scoring functions are the exact formulas the live calculation uses (the live value is pinned by
 *    financial-health.test.ts, which still passes after the refactor);
 *  - healthPointForMonth / buildHealthSeries evaluate those formulas on a month-end's inputs;
 *  - calculateFinancialHealth({ historyMonths }) returns the series with its last point tied to the live figures, and is
 *    byte-for-byte unchanged (no `history`, no extra queries) when historyMonths is omitted.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  buildHealthSeries, composeHealthScore, buildCandidates, healthPointForMonth, healthSeriesPoints, HEALTH_WEIGHTS,
  scoreAgeOfMoney, scoreBudgetAdherence, scoreDti, scoreEmergencyFund, scoreNetWorthTrend, scoreSavingsRate,
  type HealthMonthInputs,
} from "@/lib/health/score";
import { computeAgeOfMoney } from "@/lib/age-of-money";

vi.mock("@/lib/fx-service", () => ({ getRate: async () => 1 }));
vi.mock("@/lib/age-of-money", async (orig) => ({
  ...(await orig<typeof import("@/lib/age-of-money")>()),
  calculateAgeOfMoney: async () => ({ ageInDays: 0, trend: 0, history: [] }),
}));
vi.mock("@/lib/holdings-value", () => ({
  getHoldingsValueByAccount: async () => new Map(),
  verifyHoldingDecryptHealth: async () => ({ failed: 0, total: 0 }),
}));

import { calculateFinancialHealth } from "@/lib/financial-health";

const base: HealthMonthInputs = {
  month: "2026-09", income3m: 20000, expenses3m: 12000, income12m: 60000, debtPayments12m: 6000, dtiReliable: true,
  liquidAssets: 18000, netWorth: 100000, netWorthPast: 95000, enoughHistory: true, budgetsOnTrack: 3, budgetsTotal: 4,
  ageOfMoneyDays: 20, ageOfMoneyTrend: 2,
};

describe("scoring functions", () => {
  it("savings rate: 500x the rate, clamped, null rate without income", () => {
    expect(scoreSavingsRate(10000, 8000)).toEqual({ score: 100, detail: "20% savings rate", ratePct: 20 });
    expect(scoreSavingsRate(10000, 9500).score).toBeCloseTo(25);
    expect(scoreSavingsRate(10000, 12000).score).toBe(0);
    expect(scoreSavingsRate(0, 100)).toEqual({ score: 0, detail: "No income data", ratePct: null });
  });

  it("DTI: (1 - ratio) * 100; no income with debt scores 0, no income and no debt scores 100", () => {
    const d = scoreDti(60000, 6000, true);
    expect([d.score, d.pct, d.detail]).toEqual([90, 10, "10% debt-to-income (12m)"]);
    expect(scoreDti(0, 0, true).score).toBe(100);
    expect(scoreDti(0, 500, true)).toMatchObject({ score: 0, pct: null, detail: "No income data (12m)" });
  });

  it("emergency fund: months of expenses covered / 6", () => {
    expect(scoreEmergencyFund(18000, 3000)).toEqual({ score: 100, detail: "6.0 months covered" });
    expect(scoreEmergencyFund(1000, 0).score).toBe(50);
    expect(scoreEmergencyFund(0, 0).score).toBe(0);
  });

  it("net worth trend: 50 + 5 x magnitude, excluded without enough history", () => {
    const up = scoreNetWorthTrend(105, 100, false);
    expect(up.detail).toMatchObject({ direction: "up", magnitudePct: 4.8 });
    expect(up.score).toBeCloseTo(74);
    expect(scoreNetWorthTrend(105, 100, true)).toMatchObject({ excluded: true, score: 0 });
  });

  it("budgets and age of money", () => {
    expect(scoreBudgetAdherence(3, 4)).toEqual({ score: 75, detail: "3/4 on track", excluded: false });
    expect(scoreBudgetAdherence(0, 0).excluded).toBe(true);
    expect(scoreAgeOfMoney(15, 3)).toEqual({ score: 50, detail: "15 days (+3d trend)", excluded: false });
    expect(scoreAgeOfMoney(0, 0).excluded).toBe(true);
  });

  it("weights are canonical and sum to 1", () => {
    expect(Object.values(HEALTH_WEIGHTS).reduce((a, b) => a + b, 0)).toBeCloseTo(1);
  });

  it("composeHealthScore renormalizes when components are excluded", () => {
    const comps = buildCandidates({
      savings: scoreSavingsRate(10000, 8000), dti: scoreDti(60000, 0, true), emergency: scoreEmergencyFund(18000, 3000),
      netWorth: scoreNetWorthTrend(1, 1, true), budget: scoreBudgetAdherence(0, 0), ageOfMoney: scoreAgeOfMoney(0, 0),
    });
    const out = composeHealthScore(comps);
    expect(out.score).toBe(100);
    expect(out.excludedComponents.map((e) => e.name)).toEqual(["Net Worth Trend", "Budget Adherence", "Age of Money"]);
    expect(out.components.reduce((s, c) => s + c.weight, 0)).toBeCloseTo(1, 2);
  });
});

describe("healthPointForMonth / buildHealthSeries", () => {
  it("evaluates the six components on a month's inputs", () => {
    const p = healthPointForMonth(base);
    expect(p).toMatchObject({ month: "2026-09", savingsRatePct: 40, dtiPct: 10 });
    // savings 100 (0.25), dti 90 (0.2), emergency 100 (0.15; 18000 / 4000 / 6 -> 75), nw ~74, budget 75, aom 66.7
    expect(p.score).toBeGreaterThan(70);
    expect(p.score).toBeLessThanOrEqual(100);
  });

  it("a month whose net worth is unknown drops that component instead of faking it", () => {
    const withNw = healthPointForMonth(base);
    const without = healthPointForMonth({ ...base, netWorth: null });
    expect(without.score).not.toBe(withNw.score);
    expect(without.score).toBeGreaterThan(0);
  });

  it("is sorted oldest first and DTI is null (not 0) without income", () => {
    const s = buildHealthSeries([
      { ...base, month: "2026-09" },
      { ...base, month: "2026-07", income12m: 0, debtPayments12m: 500, income3m: 0, expenses3m: 0 },
      { ...base, month: "2026-08" },
    ]);
    expect(s.map((p) => p.month)).toEqual(["2026-07", "2026-08", "2026-09"]);
    expect(s[0].dtiPct).toBeNull();
    expect(s[0].savingsRatePct).toBeNull();
    const pts = healthSeriesPoints(s);
    expect(pts.score).toHaveLength(3);
    expect(pts.dti.map((p) => p.month)).toEqual(["2026-08", "2026-09"]);
    expect(pts.savings.map((p) => p.month)).toEqual(["2026-08", "2026-09"]);
  });

  it("a worse month scores lower", () => {
    expect(healthPointForMonth({ ...base, expenses3m: 19500 }).score).toBeLessThan(healthPointForMonth(base).score);
    expect(healthPointForMonth({ ...base, debtPayments12m: 30000 }).dtiPct).toBe(50);
  });
});

describe("computeAgeOfMoney (pure FIFO core)", () => {
  it("matches expenses to the oldest income first", () => {
    const income = [{ date: "2026-01-01", amount: 1000 }, { date: "2026-02-01", amount: 1000 }];
    const r = computeAgeOfMoney(income, [{ date: "2026-02-11", amount: -500 }], []);
    expect(r.ageInDays).toBe(41);
    expect(computeAgeOfMoney([], [{ date: "2026-02-11", amount: -500 }], []).ageInDays).toBe(0);
  });
});

// ── calculateFinancialHealth with history, over a fake db ─────────────────────────────────────────────────────
function paramValues(q: unknown): string[] {
  const chunks = (q as { queryChunks?: unknown[] })?.queryChunks ?? [];
  const out: string[] = [];
  for (const c of chunks) {
    if (c && typeof c === "object" && "value" in (c as object) && !Array.isArray((c as { value: unknown }).value)) {
      const v = (c as { value: unknown }).value;
      if (typeof v === "string" || typeof v === "number") out.push(String(v));
    }
  }
  return out;
}
function textOf(q: unknown): string {
  const chunks = (q as { queryChunks?: unknown[] })?.queryChunks ?? [];
  let repr = "";
  for (const chunk of chunks) {
    if (typeof chunk === "string") repr += chunk;
    else if (chunk && typeof chunk === "object") {
      const rec = chunk as Record<string, unknown>;
      if (Array.isArray(rec.value)) for (const v of rec.value) if (typeof v === "string") repr += v;
    }
  }
  return repr;
}

/** Income 5000 every month; expenses 3000 until 2026-06, 4500 from then on. Cash account gains the difference. */
const FLOW_MONTHS = ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10"];
const expenseOf = (m: string) => (m >= "2026-06" ? 4500 : 3000);

function fakeDb() {
  const calls: string[] = [];
  const execute = vi.fn(async (q: unknown) => {
    const t = textOf(q);
    const params = paramValues(q);
    calls.push(t);
    if (t.includes("TO_CHAR(t.date::date, 'YYYY-MM') AS month, c.type AS cat_type")) {
      const from = (params.find((p) => /^\d{4}-\d{2}-\d{2}$/.test(p)) ?? "0000-00-00").slice(0, 7);
      return {
        rows: FLOW_MONTHS.filter((m) => m >= from).flatMap((m) => [
          { month: m, cat_type: "I", currency: "USD", total: 5000 },
          { month: m, cat_type: "E", currency: "USD", total: -expenseOf(m) },
        ]),
      };
    }
    if (t.includes("FROM loans l")) return { rows: [] };
    if (t.includes("residual_value")) return { rows: [] };
    if (t.includes("c.type = 'I'") && t.includes("GROUP BY COALESCE")) {
      return { rows: [{ currency: "USD", total: 5000 * 10 }] };
    }
    if (t.includes("FILTER (WHERE t.date <")) return { rows: [] };
    if (t.includes("TO_CHAR(t.date::date, 'YYYY-MM') AS month, SUM(t.amount) AS total")) {
      let run = 0;
      return {
        rows: FLOW_MONTHS.map((m) => { run = 5000 - expenseOf(m); return { id: 1, type: "A", group: "Cash", currency: "USD", is_investment: false, month: m, total: run }; }),
      };
    }
    if (t.includes("t.date <= ") && t.includes("a.is_investment")) {
      return { rows: [{ id: 1, currency: "USD", is_investment: false, balance: 9000 }] };
    }
    if (t.includes("a.is_investment") && t.includes("GROUP BY a.id, a.type")) {
      return { rows: [{ id: 1, type: "A", group: "Cash", currency: "USD", is_investment: false, balance: 11000 }] };
    }
    if (t.includes("MIN(t.date)")) return { rows: [{ oldest: "2026-01-02" }] };
    return { rows: [] };
  });
  return { db: { execute }, calls };
}

describe("calculateFinancialHealth — historyMonths", () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-13T12:00:00Z")); });
  afterEach(() => { vi.useRealTimers(); });

  it("omitted: no history field and no extra queries", async () => {
    const a = fakeDb();
    const off = await calculateFinancialHealth({ db: a.db, userId: "u", dek: null, reportingCurrency: "USD" });
    expect(off.history).toBeUndefined();
    const b = fakeDb();
    await calculateFinancialHealth({ db: b.db, userId: "u", dek: null, reportingCurrency: "USD", historyMonths: 3 });
    expect(b.calls.length).toBeGreaterThan(a.calls.length);
  });

  it("returns n + 1 monthly points, oldest first, the last one equal to the live figures", async () => {
    const { db } = fakeDb();
    const live = await calculateFinancialHealth({ db, userId: "u", dek: null, reportingCurrency: "USD" });
    const withHistory = await calculateFinancialHealth({ db, userId: "u", dek: null, reportingCurrency: "USD", historyMonths: 6 });
    expect(withHistory.score).toBe(live.score);
    expect(withHistory.savingsRatePct).toBe(live.savingsRatePct);
    expect(withHistory.dti).toEqual(live.dti);
    const h = withHistory.history!;
    expect(h.map((p) => p.month)).toEqual(["2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10"]);
    const last = h[h.length - 1];
    expect([last.score, last.savingsRatePct, last.dtiPct]).toEqual([live.score, live.savingsRatePct, live.dti.pct]);
  });

  it("the savings rate falls when expenses jump (window = the month and the three before it)", async () => {
    const { db } = fakeDb();
    const { history } = await calculateFinancialHealth({ db, userId: "u", dek: null, reportingCurrency: "USD", historyMonths: 6 });
    const by = Object.fromEntries(history!.map((p) => [p.month, p.savingsRatePct]));
    expect(by["2026-05"]).toBe(40); // Feb-May: 5000 income, 3000 expenses
    expect(by["2026-06"]).toBeLessThan(40);
    expect(by["2026-09"]).toBe(10); // Jun-Sep: 5000 income, 4500 expenses
    // and the score follows
    const score = Object.fromEntries(history!.map((p) => [p.month, p.score]));
    expect(score["2026-09"]).toBeLessThan(score["2026-05"]);
  });

  it("a failing history query never takes the live score down", async () => {
    const { db } = fakeDb();
    const real = db.execute;
    db.execute = vi.fn(async (q: unknown) => {
      if (textOf(q).includes("FROM portfolio_snapshots")) throw new Error("boom");
      if (textOf(q).includes("SELECT t.date AS date")) throw new Error("boom");
      return real(q);
    });
    const r = await calculateFinancialHealth({ db, userId: "u", dek: null, reportingCurrency: "USD", historyMonths: 3 });
    expect(r.score).toBeGreaterThanOrEqual(0);
    expect(r.history).toBeUndefined();
  });
});
