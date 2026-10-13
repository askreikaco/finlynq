/**
 * @vitest-environment jsdom
 */
// Metric cards with charts: /loans, /goals, /budgets and /dashboard render the shared MetricCard with a monthly
// sparkline, a % badge and a signed difference line vs the previous period (default: this month vs last month;
// ?range= compares with the preceding period of the same length). No history = value only, never a fake chart.
import * as React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor, within } from "@testing-library/react";
import {
  aggregate, compareCaption, monthsBetween, parseRangeSelection, pctChange, previousPeriod, resolvePeriod, seriesWindow,
} from "@/lib/metrics/period";
import { formatDelta } from "@/lib/metrics/delta";
import { buildLoanSeries } from "@/lib/metrics/loan-series";

const H = vi.hoisted(() => ({ search: "", push: vi.fn(), replace: vi.fn() }));

vi.mock("next/link", () => ({
  default: ({ children, href, ...p }: React.PropsWithChildren<{ href: string }>) => React.createElement("a", { href, ...p }, children),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: H.push, replace: H.replace, back: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(H.search),
  useParams: () => ({}),
  usePathname: () => "/",
}));
vi.mock("@/components/currency-provider", () => ({ useDisplayCurrency: () => ({ displayCurrency: "USD", isLoading: false }) }));
vi.mock("@/components/onboarding-tips", () => ({ OnboardingTips: () => null }));
vi.mock("@/components/currency-audit-banner", () => ({ CurrencyAuditBanner: () => null }));
vi.mock("@/components/onboarding-wizard", () => ({ OnboardingWizard: () => null }));
vi.mock("@/hooks/use-dev-mode", () => ({ useDevMode: () => false }));
vi.mock("@/lib/utils/date", async (orig) => ({
  ...(await orig<typeof import("@/lib/utils/date")>()),
  localDateISO: () => "2026-10-09",
}));
// A marker per sparkline so the tests can count the points it was given.
vi.mock("@/components/sparkline", () => ({
  Sparkline: ({ data }: { data: number[] }) => <div data-spark={data.length} />,
}));
for (const p of [
  "action-center", "weekly-recap", "quick-import", "income-expense-chart", "spending-category-chart", "available-to-spend",
  "insights-section", "net-worth-hero-card",
]) {
  vi.mock(`@/app/(app)/dashboard/_components/${p}`, () => ({}));
}
vi.mock("@/components/net-worth-history-chart", () => ({ NetWorthHistoryChart: () => null }));
vi.mock("@/components/subscriptions/due-card", () => ({ DueCard: () => null }));
vi.mock("recharts", () => {
  const Leaf = () => null;
  const Wrap = ({ children }: { children?: React.ReactNode }) => React.createElement("div", null, children);
  return {
    ResponsiveContainer: Wrap, LineChart: Wrap, AreaChart: Wrap, BarChart: Wrap, ComposedChart: Wrap,
    Line: Leaf, Area: Leaf, Bar: Leaf, Cell: Leaf, XAxis: Leaf, YAxis: Leaf, Tooltip: Leaf, Legend: Leaf,
    ReferenceLine: Leaf, CartesianGrid: Leaf,
  };
});

import BudgetsPage from "@/app/(app)/budgets/page";
import GoalsPage from "@/app/(app)/goals/page";
import LoansPage from "@/app/(app)/loans/page";

function json(body: unknown) {
  return { ok: true, status: 200, json: async () => body };
}

// ---------------------------------------------------------------- pure period math
describe("period math", () => {
  it("default is the current month vs the previous month", () => {
    const p = resolvePeriod({ range: "this_month" }, "2026-10-09");
    expect([p.start, p.end, p.months]).toEqual(["2026-10-01", "2026-10-31", ["2026-10"]]);
    const prev = previousPeriod(p);
    expect([prev.start, prev.end, prev.months]).toEqual(["2026-09-01", "2026-09-30", ["2026-09"]]);
  });

  it("January rolls back into the previous year", () => {
    expect(previousPeriod(resolvePeriod({ range: "this_month" }, "2026-01-15")).months).toEqual(["2025-12"]);
  });

  it("a baseMonth anchors the presets (budgets month navigator)", () => {
    expect(resolvePeriod({ range: "this_month" }, "2026-10-09", "2026-03").months).toEqual(["2026-03"]);
    expect(resolvePeriod({ range: "last_month" }, "2026-10-09", "2026-03").months).toEqual(["2026-02"]);
  });

  it("last 3 months compares with the 3 months before it (same length)", () => {
    const p = resolvePeriod({ range: "last_3_months" }, "2026-10-09");
    expect(p.months).toEqual(["2026-08", "2026-09", "2026-10"]);
    expect(previousPeriod(p).months).toEqual(["2026-05", "2026-06", "2026-07"]);
  });

  it("year to date compares with the same number of months before January", () => {
    const p = resolvePeriod({ range: "ytd" }, "2026-03-09");
    expect(p.months).toEqual(["2026-01", "2026-02", "2026-03"]);
    expect(previousPeriod(p).months).toEqual(["2025-10", "2025-11", "2025-12"]);
  });

  it("a custom whole-month range shifts by months, a custom day range shifts by its length in days", () => {
    const whole = resolvePeriod({ range: "custom", from: "2026-04-01", to: "2026-06-30" }, "2026-10-09");
    expect(previousPeriod(whole).months).toEqual(["2026-01", "2026-02", "2026-03"]);
    const days = resolvePeriod({ range: "custom", from: "2026-10-10", to: "2026-10-19" }, "2026-10-25");
    const prev = previousPeriod(days);
    expect([prev.start, prev.end]).toEqual(["2026-09-30", "2026-10-09"]);
    expect(prev.months).toEqual(["2026-09", "2026-10"]);
  });

  it("parses the URL and rejects bad input back to the default", () => {
    const get = (o: Record<string, string>) => (k: string) => o[k] ?? null;
    expect(parseRangeSelection(get({}))).toEqual({ range: "this_month" });
    expect(parseRangeSelection(get({ range: "nonsense" }))).toEqual({ range: "this_month" });
    expect(parseRangeSelection(get({ range: "ytd" }))).toEqual({ range: "ytd" });
    expect(parseRangeSelection(get({ range: "custom", from: "2026-02-30", to: "2026-03-01" }))).toEqual({ range: "this_month" });
    expect(parseRangeSelection(get({ range: "custom", from: "2026-05-02", to: "2026-05-01" }))).toEqual({ range: "this_month" });
    expect(parseRangeSelection(get({ range: "custom", from: "2026-05-01", to: "2026-05-20" }))).toEqual({ range: "custom", from: "2026-05-01", to: "2026-05-20" });
  });

  it("aggregates flows by sum and stocks by the last month; pctChange never divides by zero", () => {
    const pts = [{ month: "2026-08", value: 10 }, { month: "2026-09", value: 20 }, { month: "2026-10", value: 30 }];
    expect(aggregate(pts, ["2026-09", "2026-10"], "sum")).toBe(50);
    expect(aggregate(pts, ["2026-09", "2026-10"], "last")).toBe(30);
    expect(aggregate(pts, ["2026-01"], "sum")).toBeNull();
    expect(aggregate(pts, ["2026-12"], "last")).toBeNull();
    expect(pctChange(120, 100)).toBeCloseTo(20);
    expect(pctChange(80, 100)).toBeCloseTo(-20);
    expect(pctChange(5, 0)).toBeNull();
    expect(pctChange(5, null)).toBeNull();
  });

  it("the fetch window covers both periods and a 6 month sparkline", () => {
    expect(seriesWindow(resolvePeriod({ range: "this_month" }, "2026-10-09"))).toEqual({ from: "2026-05", to: "2026-10" });
    expect(seriesWindow(resolvePeriod({ range: "ytd" }, "2026-10-09"))).toEqual({ from: "2025-03", to: "2026-10" });
    expect(compareCaption({ range: "this_month" })).toBe("vs last month");
    expect(compareCaption({ range: "ytd" })).toBe("vs previous period");
    expect(monthsBetween("2026-11-01", "2027-01-31")).toEqual(["2026-11", "2026-12", "2027-01"]);
  });
});

describe("formatDelta (the shared signed-difference line)", () => {
  it("money: positive and negative", () => {
    expect(formatDelta({ cur: 1200, prev: 1000, kind: "money", currency: "USD", caption: "vs last month" })).toBe("+$200.00 vs last month");
    expect(formatDelta({ cur: 800, prev: 1000, kind: "money", currency: "USD", caption: "vs last month" })).toBe("-$200.00 vs last month");
  });
  it("points, percentage points and counts", () => {
    expect(formatDelta({ cur: 73, prev: 70, kind: "points", caption: "vs last month" })).toBe("+3 pts vs last month");
    expect(formatDelta({ cur: 10.5, prev: 12, kind: "pp", caption: "vs previous period" })).toBe("-1.5 pp vs previous period");
    expect(formatDelta({ cur: 4, prev: 3, kind: "count", caption: "vs last month" })).toBe("+1 vs last month");
  });
  it("no previous period = no delta line", () => {
    expect(formatDelta({ cur: 5, prev: null, kind: "money", currency: "USD", caption: "vs last month" })).toBeNull();
    expect(formatDelta({ cur: null, prev: 5, kind: "money", currency: "USD", caption: "vs last month" })).toBeNull();
  });
});

describe("buildLoanSeries", () => {
  const loan = {
    principal: 12000, annualRate: 0, termMonths: 12, startDate: "2026-01-01", paymentAmount: null, paymentFrequency: "monthly",
    extraPayment: 0, residualValue: null, currency: "USD", remainingBalance: 3000, remainingBalanceDisplay: 3000,
    monthlyEquivalentPaymentDisplay: 1000,
  };
  it("balance falls month by month from the schedule", () => {
    const s = buildLoanSeries([loan], ["2026-01", "2026-02", "2026-03"], "USD")!;
    expect(s.balance[0].value).toBeGreaterThan(s.balance[1].value);
    expect(s.balance[1].value).toBeGreaterThan(s.balance[2].value);
    expect(s.payment[0].value).toBeCloseTo(1000, 0);
  });
  it("is null when a loan cannot be converted (no partial total)", () => {
    expect(buildLoanSeries([{ ...loan, currency: "VND", remainingBalance: 0, remainingBalanceDisplay: null, monthlyEquivalentPaymentDisplay: null }], ["2026-01"], "USD")).toBeNull();
  });
});

// ---------------------------------------------------------------- pages
const card = (id: string) => screen.getByTestId(`metric-${id}`);
const sparkCount = (id: string) => card(id).querySelectorAll("[data-spark]").length;
const hasBadge = (id: string) => card(id).querySelector('[class*="rounded-full"]') != null;
const badge = (id: string) => card(id).querySelector('[class*="rounded-full"]') as HTMLElement;

beforeEach(() => {
  H.search = "";
  H.push.mockReset();
  H.replace.mockReset();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const BUDGET = { id: 1, categoryId: 10, categoryName: "Groceries", categoryGroup: "Food", month: "2026-10", amount: 500, rolloverAmount: 0, currency: "USD" };

function stubBudgets(series: Array<{ month: string; budget: number; spent: number }>) {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const u = String(url);
    if (u.startsWith("/api/budgets/series")) return json({ displayCurrency: "USD", series });
    if (u.startsWith("/api/budgets")) return json([BUDGET]);
    if (u.startsWith("/api/dashboard")) return json({ spendingByCategory: [{ categoryId: 10, total: -120 }], incomeVsExpenses: [] });
    if (u.startsWith("/api/age-of-money")) return json({ error: "none" });
    return json([]);
  }));
}
const BUDGET_SERIES = [
  { month: "2026-05", budget: 500, spent: 90 }, { month: "2026-06", budget: 500, spent: 95 }, { month: "2026-07", budget: 500, spent: 100 },
  { month: "2026-08", budget: 500, spent: 105 }, { month: "2026-09", budget: 500, spent: 100 }, { month: "2026-10", budget: 500, spent: 120 },
];

describe("/budgets metric cards", () => {
  it("every summary metric is a MetricCard; spent has sparkline, % vs previous month, inverted tone and a delta line", async () => {
    H.search = "month=2026-10";
    stubBudgets(BUDGET_SERIES);
    render(<BudgetsPage />);
    await waitFor(() => expect(sparkCount("total-spent")).toBeGreaterThan(0));
    for (const id of ["total-budget", "total-spent", "remaining"]) expect(card(id)).toBeTruthy();
    expect(card("total-spent").textContent).toContain("+20.0%");
    // less is better: spending up = red
    expect(badge("total-spent").className).toContain("text-destructive");
    expect(card("total-spent").textContent).toMatch(/\+\$20\.00 vs last month/);
    // budget is flat 500 -> 500: 0% and green
    expect(badge("total-budget").className).toContain("text-pos");
    expect(card("remaining").textContent).toMatch(/-\$20\.00 vs last month/);
    expect(badge("remaining").className).toContain("text-destructive");
  });

  it("no history = value only: no sparkline, no badge, no delta line", async () => {
    H.search = "month=2026-10";
    stubBudgets([]);
    render(<BudgetsPage />);
    await screen.findByTestId("metric-total-budget");
    await waitFor(() => expect(screen.getByRole("button", { name: /Groceries/ })).toBeTruthy());
    for (const id of ["total-budget", "total-spent", "remaining"]) {
      expect(sparkCount(id)).toBe(0);
      expect(hasBadge(id)).toBe(false);
      expect(card(id).textContent).not.toMatch(/vs (last month|previous period)/);
    }
  });

  it("?range changes the comparison period: last 3 months sums the months and compares with the 3 before", async () => {
    H.search = "month=2026-10&range=last_3_months";
    stubBudgets(BUDGET_SERIES);
    render(<BudgetsPage />);
    await waitFor(() => expect(card("total-spent").textContent).toContain("vs previous period"));
    // Aug+Sep+Oct = 325 vs May+Jun+Jul = 285
    expect(card("total-spent").textContent).toMatch(/\+\$40\.00 vs previous period/);
    expect(card("total-spent").textContent).toContain("+14.0%");
    expect(screen.getByLabelText("Time range")).toBeTruthy();
  });
});

describe("/goals metric cards", () => {
  const GOAL = {
    id: 3, name: "Emergency fund", type: "emergency_fund", targetAmount: 1000, currentAmount: 250, currency: "USD",
    deadline: "2027-01-01", status: "active", progress: 25, remaining: 750, monthlyNeeded: 0, accountIds: [1], accounts: ["Bank"],
    accountName: null, priority: 0, note: "", targetAmountDisplay: 1000, currentAmountDisplay: 250,
  };
  function stubGoals(series: unknown) {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      const u = String(url);
      if (u.startsWith("/api/goals/series")) return json({ displayCurrency: "USD", series });
      if (u.startsWith("/api/goals")) return json([GOAL]);
      return json({});
    }));
  }

  it("current progress has a real series, badge and delta; target and completed are value only", async () => {
    stubGoals([
      { month: "2026-07", current: 100 }, { month: "2026-08", current: 150 }, { month: "2026-09", current: 200 }, { month: "2026-10", current: 250 },
    ]);
    render(<GoalsPage />);
    await waitFor(() => expect(sparkCount("current-progress")).toBeGreaterThan(0));
    expect(card("current-progress").textContent).toContain("+25.0%");
    expect(card("current-progress").textContent).toMatch(/\+\$50\.00 vs last month/);
    expect(badge("current-progress").className).toContain("text-pos");
    for (const id of ["total-target", "completed"]) {
      expect(sparkCount(id)).toBe(0);
      expect(hasBadge(id)).toBe(false);
    }
    expect(card("completed").textContent).toContain("0 / 1");
  });

  it("series null (not derivable) = no chart, no fake badge", async () => {
    stubGoals(null);
    render(<GoalsPage />);
    await screen.findByTestId("metric-current-progress");
    expect(sparkCount("current-progress")).toBe(0);
    expect(hasBadge("current-progress")).toBe(false);
  });
});

describe("/loans metric cards", () => {
  const LOAN = {
    id: 5, name: "Car loan", type: "loan", principal: 12000, annualRate: 0, termMonths: 12,
    startDate: "2026-01-01", paymentFrequency: "monthly", extraPayment: 0, paymentAmount: null,
    residualValue: null, monthlyPayment: 1000, paymentPerPeriod: 1000, monthlyEquivalentPayment: 1000,
    totalInterest: 0, payoffDate: "2026-12-01", remainingBalance: 3000, balanceSource: null,
    principalPaid: 9000, interestPaid: 0, periodsRemaining: 3, accountName: null, accountId: null,
    currency: "USD", displayCurrency: "USD", remainingBalanceDisplay: 3000, monthlyEquivalentPaymentDisplay: 1000,
  };
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => (String(url).startsWith("/api/loans") ? json([LOAN]) : json([]))));
  });

  it("total debt: sparkline from the amortization schedule, falling balance = green (inverted), delta line", async () => {
    render(<LoansPage />);
    await screen.findByTestId("metric-total-debt");
    expect(sparkCount("total-debt")).toBeGreaterThan(0);
    expect(card("total-debt").textContent).toMatch(/-\$1,000\.00 vs last month/);
    expect(card("total-debt").textContent).toContain("-");
    expect(badge("total-debt").className).toContain("text-pos");
    for (const id of ["monthly-payments", "active-loans"]) expect(card(id)).toBeTruthy();
    expect(card("active-loans").textContent).toContain("1");
  });

  it("?range=ytd compares with the preceding period", async () => {
    H.search = "range=ytd";
    render(<LoansPage />);
    await screen.findByTestId("metric-total-debt");
    await waitFor(() => expect(card("total-debt").textContent).toContain("vs previous period"));
  });

  it("a loan that cannot be converted gives value only", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) =>
      String(url).startsWith("/api/loans") ? json([{ ...LOAN, currency: "VND", remainingBalanceDisplay: null, monthlyEquivalentPaymentDisplay: null }]) : json([])));
    render(<LoansPage />);
    await screen.findByTestId("metric-total-debt");
    expect(sparkCount("total-debt")).toBe(0);
    expect(hasBadge("total-debt")).toBe(false);
  });
});

// ---------------------------------------------------------------- dashboard
describe("/dashboard metric cards", () => {
  const cur = "2026-10";
  const shift = (n: number) => {
    const d = new Date(Date.UTC(2026, 9 + n, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  };
  // getCurrentMonth() uses the real clock; build the months relative to it.
  const real = new Date();
  const base = `${real.getFullYear()}-${String(real.getMonth() + 1).padStart(2, "0")}`;
  const rel = (n: number) => {
    const d = new Date(Date.UTC(Number(base.slice(0, 4)), Number(base.slice(5)) - 1 + n, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  };
  void cur; void shift;

  async function renderDashboard(rows: Array<{ n: number; income: number; expenses: number }>, search = "") {
    H.search = search;
    const incomeVsExpenses = rows.flatMap((r) => [
      { month: rel(r.n), type: "I", total: r.income },
      { month: rel(r.n), type: "E", total: -r.expenses },
    ]);
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      const u = String(url);
      if (u.includes("/api/settings/dashboard-layout")) return json(null);
      if (u.includes("/api/dashboard")) return json({ balances: [], incomeVsExpenses, netWorthOverTime: [], spendingByCategory: [], displayCurrency: "USD" });
      if (u.includes("/api/health-score")) return json({ score: 72, grade: "B", components: [], savingsRatePct: 15, dti: { pct: 20, reliable: true } });
      if (u.includes("/api/auth/session")) return json({ authenticated: true, onboardingComplete: true });
      return json({});
    }));
    const { default: DashboardPage } = await import("@/app/(app)/dashboard/page");
    render(<DashboardPage />);
    await screen.findByText("Monthly Income");
  }
  const tile = (label: string) => screen.getByText(label).closest(".gradient-border") as HTMLElement;

  it("Monthly Income: % badge AND a signed value difference; the covered month moves to the note; sparkline", async () => {
    await renderDashboard([
      { n: -3, income: 900, expenses: 500 }, { n: -2, income: 1000, expenses: 500 }, { n: -1, income: 1200, expenses: 600 }, { n: 0, income: 100, expenses: 50 },
    ]);
    const t = tile("Monthly Income");
    expect(t.textContent).toContain("+20.0%");
    expect(t.textContent).toMatch(/\+\$200\.00 vs last month/);
    expect(t.textContent).toMatch(/20\d\d/); // the month label is still visible
    expect(t.querySelectorAll("[data-spark]").length).toBeGreaterThan(0);
  });

  it("negative delta, and Monthly Expenses is inverted (up = red)", async () => {
    await renderDashboard([
      { n: -3, income: 900, expenses: 400 }, { n: -2, income: 1200, expenses: 500 }, { n: -1, income: 1000, expenses: 600 }, { n: 0, income: 100, expenses: 50 },
    ]);
    const inc = tile("Monthly Income");
    expect(inc.textContent).toContain("-16.7%");
    expect(inc.textContent).toMatch(/-\$200\.00 vs last month/);
    const exp = tile("Monthly Expenses");
    expect(exp.textContent).toContain("+20.0%");
    expect((exp.querySelector('[class*="rounded-full"]') as HTMLElement).className).toContain("text-destructive");
  });

  it("no previous month = no badge and no delta line", async () => {
    await renderDashboard([{ n: -1, income: 1000, expenses: 500 }, { n: 0, income: 100, expenses: 50 }]);
    const t = tile("Monthly Income");
    expect(t.textContent).not.toMatch(/vs last month/);
    expect(t.querySelector('[class*="rounded-full"]')).toBeNull();
  });

  it("savings rate gets a series + pp delta; financial health and DTI stay value only", async () => {
    await renderDashboard([
      { n: -3, income: 1000, expenses: 800 }, { n: -2, income: 1000, expenses: 700 }, { n: -1, income: 1000, expenses: 600 }, { n: 0, income: 100, expenses: 50 },
    ]);
    const s = tile("Savings Rate");
    expect(s.textContent).toMatch(/\+10 pp vs last month/);
    expect(s.querySelectorAll("[data-spark]").length).toBeGreaterThan(0);
    for (const label of ["Financial Health", "Debt-to-Income"]) {
      expect(tile(label).querySelectorAll("[data-spark]").length).toBe(0);
      expect(tile(label).querySelector('[class*="rounded-full"]')).toBeNull();
    }
  });

  it("?range=last_3_months compares with the preceding 3 months and shows the range control", async () => {
    await renderDashboard(
      [-6, -5, -4, -3, -2, -1, 0].map((n) => ({ n, income: 1000 + (n + 6) * 100, expenses: 500 })),
      "range=last_3_months",
    );
    const t = tile("Monthly Income");
    await waitFor(() => expect(t.textContent).toContain("vs previous period"));
    expect(screen.getByLabelText("Time range")).toBeTruthy();
    void within;
  });
});
