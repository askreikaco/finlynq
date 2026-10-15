/**
 * @vitest-environment jsdom
 */
// Metric cards with charts: /loans, /goals, /categories (budget totals) and /dashboard render the shared MetricCard with a monthly
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

const H = vi.hoisted(() => ({ search: "", params: {} as Record<string, string>, push: vi.fn(), replace: vi.fn() }));

vi.mock("next/link", () => ({
  default: ({ children, href, ...p }: React.PropsWithChildren<{ href: string }>) => React.createElement("a", { href, ...p }, children),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: H.push, replace: H.replace, back: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(H.search),
  useParams: () => H.params,
  usePathname: () => "/",
}));
vi.mock("@/components/currency-provider", () => ({ useDisplayCurrency: () => ({ displayCurrency: "USD", isLoading: false }) }));
vi.mock("@/components/notice/feeds", () => ({ NoticeFeed: () => null }));
vi.mock("@/lib/client/user-storage", async (orig) => ({
  ...(await orig<typeof import("@/lib/client/user-storage")>()),
  useSessionUserId: () => ({ userId: "mc-user", ready: true }),
}));
vi.mock("@/components/dropdown-order-provider", () => ({ useDropdownOrder: () => <T,>(items: T[]) => items }));
vi.mock("@/lib/hooks/useActiveCurrencies", () => ({ useActiveCurrencies: () => ["USD"] }));
vi.mock("@/components/inbox/mode-picker", () => ({ ModePicker: () => null }));
vi.mock("@/components/inbox/import-prefs-picker", () => ({ ImportPrefsPicker: () => null }));
vi.mock("@/app/(app)/transactions/_components/transactions-workspace", () => ({ TransactionsWorkspace: () => null }));
vi.mock("@/components/portfolio/PerformanceChart", async (orig) => ({
  ...(await orig<typeof import("@/components/portfolio/PerformanceChart")>()),
  PerformanceChart: () => null,
}));
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
vi.mock("@/app/(app)/dashboard/_components/action-center", () => ({ ActionCenter: () => null }));
vi.mock("@/app/(app)/dashboard/_components/weekly-recap", () => ({ WeeklyRecap: () => null }));
vi.mock("@/app/(app)/dashboard/_components/quick-import", () => ({ QuickImport: () => null }));
vi.mock("@/app/(app)/dashboard/_components/income-expense-chart", () => ({ IncomeExpenseChart: () => null }));
vi.mock("@/app/(app)/dashboard/_components/spending-category-chart", () => ({ SpendingCategoryChart: () => null }));
vi.mock("@/app/(app)/dashboard/_components/available-to-spend", () => ({ AvailableToSpend: () => null }));
vi.mock("@/app/(app)/dashboard/_components/insights-section", () => ({ InsightsSection: () => null }));
vi.mock("@/components/net-worth-history-chart", () => ({ NetWorthHistoryChart: () => null }));
vi.mock("@/components/subscriptions/due-card", () => ({ DueCard: () => null }));
vi.mock("recharts", () => {
  const Leaf = () => null;
  const Wrap = ({ children }: { children?: React.ReactNode }) => React.createElement("div", null, children);
  return {
    ResponsiveContainer: Wrap, LineChart: Wrap, AreaChart: Wrap, BarChart: Wrap, ComposedChart: Wrap, PieChart: Wrap, Pie: Wrap,
    Line: Leaf, Area: Leaf, Bar: Leaf, Cell: Leaf, XAxis: Leaf, YAxis: Leaf, Tooltip: Leaf, Legend: Leaf,
    ReferenceLine: Leaf, CartesianGrid: Leaf,
  };
});

import CategoriesPageContent from "@/app/(app)/categories/_page-content";

const BudgetsPage = () => <CategoriesPageContent />;
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
  H.params = {};
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
    if (u.startsWith("/api/reports/categories")) return json({ data: REPORT });
    return json([]);
  }));
}
const REPORT = {
  month: "2026-10", partial: true, windowMonths: ["2026-09", "2026-10"], total: 120, averageTotal: null, displayCurrency: "USD", type: "E",
  categories: [{ id: 10, name: "Groceries", group: "Food", amount: 120, share: 1, average: null, change: null, budget: 500, trend: [100, 120] }],
};
const BUDGET_SERIES = [
  { month: "2026-05", budget: 500, spent: 90 }, { month: "2026-06", budget: 500, spent: 95 }, { month: "2026-07", budget: 500, spent: 100 },
  { month: "2026-08", budget: 500, spent: 105 }, { month: "2026-09", budget: 500, spent: 100 }, { month: "2026-10", budget: 500, spent: 120 },
];

describe("/categories budget metric cards", () => {
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
    await waitFor(() => expect(screen.getByText("Food")).toBeTruthy());
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

  async function renderDashboard(
    rows: Array<{ n: number; income: number; expenses: number }>,
    search = "",
    extra: { health?: Record<string, unknown>; budgetSeries?: unknown; netWorthOverTime?: unknown } = {},
  ) {
    H.search = search;
    const incomeVsExpenses = rows.flatMap((r) => [
      { month: rel(r.n), type: "I", total: r.income },
      { month: rel(r.n), type: "E", total: -r.expenses },
    ]);
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      const u = String(url);
      if (u.includes("/api/settings/dashboard-layout")) return json(null);
      if (u.includes("/api/budgets/series")) return json({ displayCurrency: "USD", series: extra.budgetSeries ?? [] });
      if (u.includes("/api/dashboard")) return json({ balances: [], incomeVsExpenses, netWorthOverTime: extra.netWorthOverTime ?? [], spendingByCategory: [], displayCurrency: "USD" });
      if (u.includes("/api/health-score")) return json({ score: 72, grade: "B", components: [], savingsRatePct: 15, dti: { pct: 20, reliable: true }, ...extra.health });
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

  it("savings rate: the big value, badge and pp delta share ONE basis (reference month vs the month before); the 3-month figure is the note", async () => {
    await renderDashboard([
      { n: -3, income: 1000, expenses: 800 }, { n: -2, income: 1000, expenses: 700 }, { n: -1, income: 1000, expenses: 600 }, { n: 0, income: 100, expenses: 50 },
    ]);
    const s = tile("Savings Rate");
    // reference month (last complete) = 40% vs the month before 30%
    expect(s.textContent).toContain("40%");
    expect(s.textContent).toMatch(/\+10 pp vs last month/);
    expect(s.textContent).toContain("+33.3%");
    expect(s.textContent).toContain("last 3 months: 15%");
    expect(s.querySelectorAll("[data-spark]").length).toBeGreaterThan(0);
  });

  it("without a health history, Financial Health and Debt-to-Income stay value only (never a fake chart)", async () => {
    await renderDashboard([{ n: -1, income: 1000, expenses: 600 }, { n: 0, income: 100, expenses: 50 }]);
    for (const label of ["Financial Health", "Debt-to-Income"]) {
      expect(tile(label).querySelectorAll("[data-spark]").length).toBe(0);
      expect(tile(label).querySelector('[class*="rounded-full"]')).toBeNull();
      expect(tile(label).textContent).not.toMatch(/vs last month/);
    }
  });

  const HIST = (score: number[], dti: Array<number | null>) =>
    score.map((sc, i) => ({ month: rel(i - (score.length - 1)), score: sc, savingsRatePct: 10, dtiPct: dti[i] }));

  it("Financial Health: monthly sparkline, % badge and '+N pts vs last month' from the per-month score history", async () => {
    await renderDashboard([{ n: -1, income: 1000, expenses: 600 }, { n: 0, income: 100, expenses: 50 }], "", {
      health: { score: 72, history: HIST([60, 64, 68, 70, 72], [30, 28, 26, 22, 20]) },
    });
    const t = tile("Financial Health");
    expect(t.textContent).toMatch(/\+2 pts vs last month/);
    expect(t.textContent).toContain("+2.9%");
    expect(t.querySelectorAll("[data-spark]").length).toBeGreaterThan(0);
    expect(t.textContent).toContain("B"); // the grade stays visible
  });

  it("Debt-to-Income: pp delta, lower is better (green), sparkline", async () => {
    await renderDashboard([{ n: -1, income: 1000, expenses: 600 }, { n: 0, income: 100, expenses: 50 }], "", {
      health: { history: HIST([60, 64, 68, 70, 72], [30, 28, 26, 22, 20]) },
    });
    const t = tile("Debt-to-Income");
    expect(t.textContent).toContain("20%");
    expect(t.textContent).toMatch(/-2 pp vs last month/);
    expect((t.querySelector('[class*="rounded-full"]') as HTMLElement).className).toContain("text-pos");
    expect(t.querySelectorAll("[data-spark]").length).toBeGreaterThan(0);
  });

  it("?range=last_3_months compares the score at the end of the range with the end of the previous one", async () => {
    await renderDashboard([{ n: -1, income: 1000, expenses: 600 }, { n: 0, income: 100, expenses: 50 }], "range=last_3_months", {
      health: { score: 72, history: HIST([50, 52, 56, 60, 64, 68, 70, 72], [30, 30, 28, 26, 24, 22, 21, 20]) },
    });
    const t = tile("Financial Health");
    // now 72 vs the score three months earlier (the end of the previous 3-month period) 64
    await waitFor(() => expect(t.textContent).toMatch(/\+8 pts vs previous period/));
  });

  it("Budgets: % of the budget spent with the monthly series, pp delta vs last month and the amounts in the note", async () => {
    await renderDashboard([{ n: -1, income: 1000, expenses: 600 }, { n: 0, income: 100, expenses: 50 }], "", {
      budgetSeries: [
        { month: rel(-3), budget: 500, spent: 400 }, { month: rel(-2), budget: 500, spent: 350 },
        { month: rel(-1), budget: 500, spent: 300 }, { month: rel(0), budget: 500, spent: 400 },
      ],
    });
    const t = tile("Budgets");
    expect(t.textContent).toContain("80%");
    expect(t.textContent).toMatch(/\+20 pp vs last month/);
    expect(t.textContent).toContain("+33.3%");
    expect(t.textContent).toContain("$400.00 of $500.00");
    expect(t.querySelectorAll("[data-spark]").length).toBeGreaterThan(0);
    // spending more of the budget is bad: up = red
    expect((t.querySelector('[class*="rounded-full"]') as HTMLElement).className).toContain("text-destructive");
  });

  it("Budgets without budgets: value only", async () => {
    await renderDashboard([{ n: -1, income: 1000, expenses: 600 }, { n: 0, income: 100, expenses: 50 }]);
    const t = tile("Budgets");
    expect(t.textContent).toContain("No budgets set");
    expect(t.querySelectorAll("[data-spark]").length).toBe(0);
    expect(t.querySelector('[class*="rounded-full"]')).toBeNull();
  });

  it("Total Net Worth follows the same range control (running total of the monthly deltas)", async () => {
    const nw = [-3, -2, -1, 0].map((n) => ({ month: rel(n), currency: "USD", cumulative: 100 }));
    await renderDashboard([{ n: -1, income: 1000, expenses: 600 }, { n: 0, income: 100, expenses: 50 }], "range=last_3_months", { netWorthOverTime: nw });
    const hero = screen.getByText("Total Net Worth").closest(".gradient-border") as HTMLElement;
    // 400 now vs 100 at the end of the previous period
    await waitFor(() => expect(hero.textContent).toMatch(/\+\$300\.00 vs previous period/));
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

// ---------------------------------------------------------------- series builders (src/lib/metrics/series.ts)
import {
  cardProps, countByMonth, cumulate, fillForward, makeCardResolver, monthEndBalances, ratioSeries, resolveRatioCard, runningTotal, stockFromEvents,
  sumByMonth, valueAt,
} from "@/lib/metrics/series";
import { buildPortfolioSeries } from "@/lib/metrics/portfolio-series";

describe("series builders", () => {
  it("runningTotal turns monthly deltas into a balance carried forward through empty months", () => {
    const pts = runningTotal([{ month: "2026-08", cumulative: 100 }, { month: "2026-10", cumulative: 50 }], "2026-11");
    expect(pts).toEqual([
      { month: "2026-08", value: 100 }, { month: "2026-09", value: 100 }, { month: "2026-10", value: 150 }, { month: "2026-11", value: 150 },
    ]);
    expect(runningTotal([], "2026-10")).toEqual([]);
  });

  it("monthEndBalances keeps the last known balance of each month", () => {
    expect(monthEndBalances([{ date: "2026-08-03", value: 10 }, { date: "2026-08-20", value: 12 }, { date: "2026-09-02", value: 20 }], "2026-10")).toEqual([
      { month: "2026-08", value: 12 }, { month: "2026-09", value: 20 }, { month: "2026-10", value: 20 },
    ]);
  });

  it("sumByMonth / countByMonth are dense (real zeros between rows) and honour fromMonth", () => {
    const rows = [{ d: "2026-08-02", v: 5 }, { d: "2026-10-05", v: 7 }, { d: "2026-10-09", v: 1 }];
    expect(sumByMonth(rows, (r) => r.d, (r) => r.v, "2026-10")).toEqual([
      { month: "2026-08", value: 5 }, { month: "2026-09", value: 0 }, { month: "2026-10", value: 8 },
    ]);
    expect(sumByMonth(rows, (r) => r.d, (r) => r.v, "2026-10", "2026-07")[0]).toEqual({ month: "2026-07", value: 0 });
    expect(countByMonth(rows, (r) => r.d, "2026-10").map((p) => p.value)).toEqual([1, 0, 2]);
    expect(sumByMonth([], (r: { d: string }) => r.d, () => 1)).toEqual([]);
  });

  it("cumulate / valueAt / fillForward / stockFromEvents / ratioSeries", () => {
    const flow = [{ month: "2026-08", value: 5 }, { month: "2026-09", value: 0 }, { month: "2026-10", value: 8 }];
    expect(cumulate(flow).map((p) => p.value)).toEqual([5, 5, 13]);
    expect(valueAt(cumulate(flow), "2026-07")).toBe(0);
    expect(valueAt(cumulate(flow), "2026-09")).toBe(5);
    expect(fillForward([{ month: "2026-08", value: 1 }, { month: "2026-10", value: 3 }]).map((p) => p.value)).toEqual([1, 1, 3]);
    const ev = [{ s: "2026-08-01", e: "2026-10-15", v: 10 }, { s: "2026-09-01", e: null, v: 4 }];
    expect(stockFromEvents(ev, (x) => x.s, (x) => x.v, (x) => x.e, "2026-10").map((p) => p.value)).toEqual([10, 14, 4]);
    expect(ratioSeries([{ month: "2026-09", value: 30 }, { month: "2026-10", value: 5 }], [{ month: "2026-09", value: 100 }, { month: "2026-10", value: 0 }])).toEqual([{ month: "2026-09", value: 30 }]);
  });

  it("makeCardResolver: page value for the default period, badge + delta + spark from the series; no series = value only", () => {
    const range = { selection: { range: "this_month" as const }, explicit: false, period: resolvePeriod({ range: "this_month" }, "2026-10-09") };
    const pts = [{ month: "2026-07", value: 10 }, { month: "2026-08", value: 20 }, { month: "2026-09", value: 100 }, { month: "2026-10", value: 150 }];
    const c = makeCardResolver(range, "USD")(pts, "last", 155);
    expect(c.value).toBe(155);
    expect(c.delta).toBe("+$50.00 vs last month");
    expect(c.badgePct).toBeCloseTo(50);
    expect(c.sparkData).toEqual([10, 20, 100, 150]);
    expect(cardProps(c)).toMatchObject({ sub: "+$50.00 vs last month", sparkData: [10, 20, 100, 150] });
    const none = makeCardResolver(range, "USD")([], "last", 155);
    expect(none).toMatchObject({ value: 155, delta: null, badgePct: null });
    expect(none.sparkData).toBeUndefined();
    expect(cardProps(none)).toEqual({ badgePct: null });
    const ranged = makeCardResolver({ selection: { range: "last_3_months" }, explicit: true, period: resolvePeriod({ range: "last_3_months" }, "2026-10-09") }, "USD")(pts, "sum", 999);
    // an explicit range uses the series figure, not the page value: Aug+Sep+Oct vs the months of May-Jul that have data (Jul)
    expect(ranged.value).toBe(270);
    expect(ranged.delta).toBe("+$260.00 vs previous period");
  });

  it("resolveRatioCard: value, badge, pp delta and sparkline share one basis", () => {
    const period = resolvePeriod({ range: "this_month" }, "2026-10-09");
    const inc = [{ month: "2026-08", value: 1000 }, { month: "2026-09", value: 1000 }, { month: "2026-10", value: 1000 }];
    const net = [{ month: "2026-08", value: 200 }, { month: "2026-09", value: 300 }, { month: "2026-10", value: 400 }];
    const r = resolveRatioCard({ num: net, den: inc, period, caption: "vs last month" });
    expect(r.value).toBe(40);
    expect(r.delta).toBe("+10 pp vs last month");
    expect(r.badgePct).toBeCloseTo(33.33, 1);
    expect(r.sparkData).toEqual([20, 30, 40]);
    expect(resolveRatioCard({ num: net, den: [{ month: "2026-10", value: 0 }], period, caption: "x" })).toMatchObject({ value: null, delta: null, badgePct: null });
  });

  it("buildPortfolioSeries: snapshots in the display currency only; partial dividend / gain data gives no series", () => {
    const perf = { currency: "USD", series: [
      { date: "2026-08-31", marketValue: 900, costBasis: 800 }, { date: "2026-09-30", marketValue: 1000, costBasis: 850 }, { date: "2026-10-05", marketValue: 1100, costBasis: 850 },
    ] };
    const s = buildPortfolioSeries({
      perf,
      dividends: [{ date: "2026-09-10", reportingAmount: 20, reportingCurrency: "USD" }],
      gains: [{ closeDate: "2026-10-01", realizedGainInBase: 50 }],
      displayCurrency: "USD", throughMonth: "2026-10",
    });
    expect(s.value.map((p) => p.value)).toEqual([900, 1000, 1100]);
    expect(s.cost.map((p) => p.value)).toEqual([800, 850, 850]);
    expect(s.unrealized.map((p) => p.value)).toEqual([100, 150, 250]);
    expect(s.dividends.map((p) => p.value)).toEqual([0, 20, 20]); // a lifetime total is 0 before its first row
    expect(s.realized.map((p) => p.value)).toEqual([0, 50]);
    expect(s.totalReturn.map((p) => p.value)).toEqual([100, 170, 320]);
    const other = buildPortfolioSeries({ perf: { ...perf, currency: "VND" }, dividends: [{ date: "2026-09-10", reportingAmount: null, reportingCurrency: null }], gains: null, displayCurrency: "USD", throughMonth: "2026-10" });
    expect(other.value).toEqual([]);
    expect(other.dividends).toEqual([]);
    expect(other.totalReturn).toEqual([]);
  });
});

// ---------------------------------------------------------------- accounts
describe("/accounts metric cards", () => {
  const balances = [
    { accountId: 1, accountName: "Bank", accountType: "A", accountGroup: "Banks", currency: "USD", balance: 300, convertedBalance: 300 },
    { accountId: 2, accountName: "Visa", accountType: "L", accountGroup: "Credit Card", currency: "USD", balance: -50, convertedBalance: -50 },
  ];
  const mk = (rows: Array<[string, number]>) => rows.map(([month, cumulative]) => ({ month, currency: "USD", cumulative }));
  const assetsOverTime = mk([["2026-04", 100], ["2026-05", 20], ["2026-06", 20], ["2026-07", 20], ["2026-08", 20], ["2026-09", 70], ["2026-10", 50]]);
  const liabilitiesOverTime = mk([["2026-04", -10], ["2026-05", -10], ["2026-06", -10], ["2026-07", -10], ["2026-08", -5], ["2026-09", -3], ["2026-10", -2]]);
  const netWorthOverTime = mk([["2026-04", 90], ["2026-05", 10], ["2026-06", 10], ["2026-07", 10], ["2026-08", 15], ["2026-09", 67], ["2026-10", 48]]);

  async function renderAccounts(payload: Record<string, unknown>) {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => (String(url).includes("/api/dashboard") ? json(payload) : json({}))));
    const { default: AccountsPage } = await import("@/app/(app)/accounts/page");
    render(<AccountsPage />);
    await screen.findByText("Total Assets");
  }
  const tileOf = (label: string) => screen.getByText(label).closest(".gradient-border") as HTMLElement;

  it("Net Worth, Total Assets and Total Liabilities: series, % badge and signed difference vs last month", async () => {
    await renderAccounts({ balances, netWorthOverTime, assetsOverTime, liabilitiesOverTime });
    const assets = tileOf("Total Assets");
    expect(assets.querySelectorAll("[data-spark]").length).toBeGreaterThan(0);
    expect(assets.textContent).toMatch(/\+\$50\.00 vs last month/);
    expect(assets.textContent).toContain("+20.0%"); // 250 -> 300
    const nw = tileOf("Total Net Worth");
    expect(nw.textContent).toMatch(/\+\$48\.00 vs last month/);
    expect(nw.querySelectorAll("[data-spark]").length).toBeGreaterThan(0);
    expect(tileOf("Total Liabilities").textContent).toMatch(/-\$2\.00 vs last month/);
    expect(screen.getByLabelText("Time range")).toBeTruthy();
  });

  it("?range=last_3_months compares the balance at the end of the range with the end of the previous period", async () => {
    H.search = "range=last_3_months";
    await renderAccounts({ balances, netWorthOverTime, assetsOverTime, liabilitiesOverTime });
    const assets = tileOf("Total Assets");
    // assets: 300 at Oct vs 160 at Jul (running 100,120,140,160,180,250,300)
    await waitFor(() => expect(assets.textContent).toMatch(/\+\$140\.00 vs previous period/));
  });

  it("no history = value only", async () => {
    await renderAccounts({ balances });
    for (const l of ["Total Assets", "Total Liabilities", "Total Net Worth"]) {
      expect(tileOf(l).querySelectorAll("[data-spark]").length).toBe(0);
      expect(tileOf(l).querySelector('[class*="rounded-full"]')).toBeNull();
      expect(tileOf(l).textContent).not.toMatch(/vs (last month|previous period)/);
    }
  });
});

// ---------------------------------------------------------------- account detail
describe("/accounts/[id] balance card", () => {
  const account = { id: 1, name: "Bank", type: "A", group: "Banks", currency: "USD", alias: null, note: null, archived: false, invisible: false, isInvestment: false, mode: "manual" };
  async function renderDetail(series: Array<{ date: string; value: number }> | null) {
    H.params = { id: "1" };
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      const u = String(url);
      if (u.includes("/api/net-worth-history")) return series ? json({ series }) : { ok: false, status: 404, json: async () => ({}) };
      if (u.includes("/api/accounts")) return json([account]);
      if (u.includes("/api/dashboard")) return json({ balances: [{ accountId: 1, balance: 1200, cashFlowBasis: 1200 }] });
      if (u.includes("/api/transactions")) return json({ total: 1 });
      return json([]);
    }));
    const { default: AccountDetailPage } = await import("@/app/(app)/accounts/[id]/page");
    render(<AccountDetailPage />);
    await screen.findByText("Balance");
  }
  const balanceCard = () => screen.getByText("Balance").closest(".gradient-border") as HTMLElement;
  const SERIES = [
    { date: "2026-06-30", value: 600 }, { date: "2026-07-31", value: 700 }, { date: "2026-08-31", value: 800 },
    { date: "2026-09-30", value: 1000 }, { date: "2026-10-08", value: 1200 },
  ];

  it("month-end balance history: sparkline, % badge and the signed difference vs last month", async () => {
    await renderDetail(SERIES);
    await waitFor(() => expect(balanceCard().querySelectorAll("[data-spark]").length).toBeGreaterThan(0));
    expect(balanceCard().textContent).toMatch(/\+\$200\.00 vs last month/);
    expect(balanceCard().textContent).toContain("+20.0%");
  });

  it("?range=last_3_months: balance at the end of the range vs the end of the previous period", async () => {
    H.search = "range=last_3_months";
    await renderDetail(SERIES);
    // Oct 1200 vs Jul 700
    await waitFor(() => expect(balanceCard().textContent).toMatch(/\+\$500\.00 vs previous period/));
  });

  it("no history = value only", async () => {
    await renderDetail(null);
    expect(balanceCard().querySelectorAll("[data-spark]").length).toBe(0);
    expect(balanceCard().textContent).not.toMatch(/vs (last month|previous period)/);
  });
});

// ---------------------------------------------------------------- portfolio summary
describe("/portfolio summary cards", () => {
  const summary = {
    totalHoldings: 3, totalAccounts: 1, totalValueDisplay: 1100, dayChangeDisplay: 10, dayChangePct: 1, hasQuantityData: true,
    totalCostBasisDisplay: 850, totalUnrealizedGainDisplay: 250, totalUnrealizedGainPct: 29, totalRealizedGainDisplay: 50,
    totalDividendsDisplay: 20, totalReturnDisplay: 320, totalReturnPct: 38,
  };
  const perf = { success: true, data: { currency: "USD", series: [
    { date: "2026-07-31", marketValue: 800, costBasis: 800 }, { date: "2026-08-31", marketValue: 900, costBasis: 800 },
    { date: "2026-09-30", marketValue: 1000, costBasis: 850 }, { date: "2026-10-05", marketValue: 1100, costBasis: 850 },
  ] } };
  async function renderSummary(stub: Record<string, unknown>) {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      const u = String(url);
      for (const [k, v] of Object.entries(stub)) if (u.includes(k)) return json(v);
      return { ok: false, status: 404, json: async () => null };
    }));
    const { PortfolioSummary } = await import("@/app/(app)/portfolio/_components/mobile-portfolio");
    render(<PortfolioSummary summary={summary} currency="USD" />);
  }
  const tileOf = (label: string) => screen.getByText(label).closest(".gradient-border") as HTMLElement;

  it("total value, cost basis, unrealized, dividends, realized and total return get a series and a delta vs last month", async () => {
    await renderSummary({
      "/api/portfolio/performance": perf,
      "/api/portfolio/dividends": { success: true, data: { rows: [{ date: "2026-09-10", reportingAmount: 20, reportingCurrency: "USD" }] } },
      "/api/portfolio/realized-gains": { success: true, data: { rows: [{ closeDate: "2026-10-01", realizedGainInBase: 50 }] } },
    });
    await waitFor(() => expect(tileOf("Total value").textContent).toMatch(/\+\$100\.00 vs last month/));
    expect(tileOf("Total value").querySelectorAll("[data-spark]").length).toBeGreaterThan(0);
    expect(tileOf("Total value").textContent).toContain("Day change"); // the day change stays on the hero
    expect(tileOf("Cost basis").textContent).toMatch(/\+\$0\.00 vs last month/);
    expect(tileOf("Unrealized G/L").textContent).toMatch(/\+\$100\.00 vs last month/);
    expect(tileOf("Realized G/L").textContent).toMatch(/\+\$50\.00 vs last month/);
    expect(tileOf("Total return").textContent).toMatch(/\+\$150\.00 vs last month/);
    // counts have no history
    expect(tileOf("Holdings").querySelectorAll("[data-spark]").length).toBe(0);
    expect(screen.getByLabelText("Time range")).toBeTruthy();
  });

  it("?range=last_3_months compares with the preceding 3 months", async () => {
    H.search = "range=last_3_months";
    await renderSummary({ "/api/portfolio/performance": { ...perf, data: { ...perf.data, series: [{ date: "2026-04-30", marketValue: 500, costBasis: 500 }, ...perf.data.series] } } });
    // Oct 1100 vs Jul 800
    await waitFor(() => expect(tileOf("Total value").textContent).toMatch(/\+\$300\.00 vs previous period/));
  });

  it("snapshots in another currency / no snapshots = value only", async () => {
    await renderSummary({ "/api/portfolio/performance": { success: true, data: { currency: "VND", series: perf.data.series } } });
    await screen.findByText("Total value");
    expect(tileOf("Total value").querySelectorAll("[data-spark]").length).toBe(0);
    expect(tileOf("Total value").textContent).not.toMatch(/vs (last month|previous period)/);
    expect(tileOf("Cost basis").textContent).not.toMatch(/vs (last month|previous period)/);
  });
});

// ---------------------------------------------------------------- category detail
describe("/categories/[id] metric cards", () => {
  const months = (amounts: number[], counts: number[] = []) =>
    amounts.map((amount, i) => ({ month: `2026-${String(5 + i).padStart(2, "0")}`, amount, count: counts[i] ?? 2, budget: null, partial: i === amounts.length - 1 }));
  async function renderCategory(amounts: number[]) {
    H.params = { id: "10" };
    const data = {
      category: { id: 10, name: "Groceries", type: "E", group: "Food" }, windowMonths: 12, displayCurrency: "USD", payeesLocked: false,
      months: months(amounts), hasBudget: false, topPayees: [], recent: [],
      stats: {
        thisMonth: amounts[amounts.length - 1], lastMonth: amounts[amounts.length - 2], sameMonthLastYear: 50, averageMonthly: 100, medianMonthly: 100,
        highestMonth: null, total: amounts.reduce((a, b) => a + b, 0), transactionCount: 12, averageTransaction: 10, shareOfType: 0.2,
      },
    };
    vi.stubGlobal("fetch", vi.fn(async (url: string) => (String(url).startsWith("/api/reports/category") ? json({ data }) : json([]))));
    const { default: CategoryPage } = await import("@/app/(app)/categories/[id]/page");
    render(<CategoryPage />);
    await screen.findByText("Monthly average");
  }
  const tileOf = (label: string | RegExp) => screen.getByText(label).closest(".gradient-border") as HTMLElement;

  it("this month vs last month and last month vs the month before: badge, signed difference, sparkline, spending up = red", async () => {
    await renderCategory([80, 90, 100, 120, 150, 180]);
    const t = tileOf("This month so far");
    expect(t.textContent).toMatch(/\+\$30\.00 vs last month/);
    expect(t.textContent).toContain("+20.0%");
    expect(t.querySelectorAll("[data-spark]").length).toBeGreaterThan(0);
    expect((t.querySelector('[class*="rounded-full"]') as HTMLElement).className).toContain("text-destructive");
    expect(tileOf(/^Last month/).textContent).toMatch(/\+\$30\.00 vs the month before/);
    // the average / same month last year / share have no comparable previous value: value only
    for (const l of ["Monthly average", /last year$/, /^Share of/]) expect(tileOf(l).querySelector('[class*="rounded-full"]')).toBeNull();
  });

  it("?range=last_3_months sums the months and compares with the 3 before", async () => {
    H.search = "range=last_3_months";
    await renderCategory([80, 90, 100, 120, 150, 180]);
    // the card title follows the range
    const t = await waitFor(() => {
      const el = screen.getAllByText("Last 3 months").map((e) => e.closest(".gradient-border")).find(Boolean);
      if (!el) throw new Error("card not rendered yet");
      return el as HTMLElement;
    });
    // Aug+Sep+Oct = 120+150+180 = 450 vs May+Jun+Jul = 270
    await waitFor(() => expect(t.textContent).toMatch(/\+\$180\.00 vs previous period/));
    expect(screen.getByLabelText("Time range")).toBeTruthy();
  });
});

// ---------------------------------------------------------------- dividends / realized gains
describe("/portfolio/dividends metric cards", () => {
  beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-10-09T12:00:00")); });
  afterEach(() => { vi.useRealTimers(); });

  const GROUPED = { success: true, data: { groups: [{ bucket: "2026", label: "2026", amount: 100, currency: "USD", rowCount: 4, reinvestedCount: 0, withholdingCount: 0, byCurrency: { USD: { amount: 100, rowCount: 4, reinvestedCount: 0, withholdingCount: 0 } } }], totals: { amount: 100, rowCount: 4, byCurrency: { USD: 100 } }, mode: "native" } };
  const ROWS = [
    { date: "2026-10-05", amount: 30, currency: "USD", reportingAmount: 30, reportingCurrency: "USD" },
    { date: "2026-09-10", amount: 20, currency: "USD", reportingAmount: 20, reportingCurrency: "USD" },
    { date: "2026-08-01", amount: 40, currency: "USD", reportingAmount: 40, reportingCurrency: "USD" },
    { date: "2026-05-01", amount: 10, currency: "USD", reportingAmount: 10, reportingCurrency: "USD" },
  ];
  async function renderDividends(rows: unknown) {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      const u = String(url);
      if (!u.includes("/api/portfolio/dividends")) return { ok: false, status: 404, json: async () => null };
      if (u.includes("groupBy=")) return json(GROUPED);
      return rows ? json({ success: true, data: { rows } }) : { ok: false, status: 500, json: async () => null };
    }));
    const { default: DividendsPage } = await import("@/app/(app)/portfolio/dividends/page");
    render(<DividendsPage />);
    await screen.findByText("Total (USD)");
  }
  const tileOf = (label: string) => screen.getByText(label).closest(".gradient-border") as HTMLElement;

  it("the period's dividends with a badge and a signed difference vs last month; the page total moves to the note", async () => {
    await renderDividends(ROWS);
    await waitFor(() => expect(tileOf("Total (USD)").textContent).toMatch(/\+\$10\.00 vs last month/));
    const t = tileOf("Total (USD)");
    expect(t.textContent).toContain("+50.0%");
    expect(t.textContent).toContain("Total in view: $100.00");
    expect(t.querySelectorAll("[data-spark]").length).toBeGreaterThan(0);
    expect(tileOf("Dividend rows").textContent).toMatch(/\+0 vs last month/);
    expect(screen.getByLabelText("Time range")).toBeTruthy();
  });

  it("?range=last_3_months: Aug-Oct vs May-Jul", async () => {
    H.search = "range=last_3_months";
    await renderDividends(ROWS);
    await waitFor(() => expect(tileOf("Total (USD)").textContent).toMatch(/\+\$80\.00 vs previous period/));
  });

  it("rows not available = the page total only (no chart, no badge)", async () => {
    await renderDividends(null);
    const t = tileOf("Total (USD)");
    expect(t.textContent).toContain("$100.00");
    expect(t.querySelectorAll("[data-spark]").length).toBe(0);
    expect(t.querySelector('[class*="rounded-full"]')).toBeNull();
  });
});

describe("/portfolio/realized-gains metric cards", () => {
  beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-10-09T12:00:00")); });
  afterEach(() => { vi.useRealTimers(); });
  const row = (id: number, closeDate: string, gain: number) => ({
    closureId: id, closeDate, openDate: "2025-01-02", holdingId: id, holdingName: `H${id}`, accountId: 1, accountName: "IBKR", qtyClosed: 1,
    proceedsPerShare: 1, costPerShare: 1, realizedGain: gain, currency: "USD", daysHeld: 400, term: "long", closeKind: "sell",
  });
  async function renderGains(rows: unknown[]) {
    vi.stubGlobal("fetch", vi.fn(async (url: string) =>
      String(url).includes("/api/portfolio/realized-gains")
        ? json({ success: true, data: { rows, totals: { realizedGain: 0, qtyClosed: 0, rowCount: rows.length, byCurrency: {} } } })
        : { ok: false, status: 404, json: async () => null }));
    const { default: RealizedGainsPage } = await import("@/app/(app)/portfolio/realized-gains/page");
    render(<RealizedGainsPage />);
    await screen.findByText("Realized (USD)");
  }
  const tileOf = (label: string) => screen.getByText(label).closest(".gradient-border") as HTMLElement;

  it("realized gain and closed-lot count: this month vs last month inside the loaded tax year", async () => {
    await renderGains([row(1, "2026-10-02", 40), row(2, "2026-09-05", 10), row(3, "2026-09-20", 5)]);
    await waitFor(() => expect(tileOf("Realized (USD)").textContent).toMatch(/\+\$25\.00 vs last month/));
    expect(tileOf("Realized (USD)").textContent).toContain("Total in view: $55.00");
    expect(tileOf("Closed lots").textContent).toMatch(/-1 vs last month/);
    expect(tileOf("Realized (USD)").querySelectorAll("[data-spark]").length).toBeGreaterThan(0);
  });

  it("?range=last_3_months compares Aug-Oct with May-Jul (empty months of the tax year are real zeros)", async () => {
    H.search = "range=last_3_months";
    await renderGains([row(1, "2026-10-02", 40), row(2, "2026-06-05", 10)]);
    await waitFor(() => expect(tileOf("Realized (USD)").textContent).toMatch(/\+\$30\.00 vs previous period/));
  });
});

// ---------------------------------------------------------------- reports
describe("/reports summary cards", () => {
  const TOTALS = {
    period: "monthly", groupBy: "category", startDate: "2026-01-01", endDate: "2026-10-09",
    timeseries: [] as unknown[], income: [], expenses: [], totalIncome: 50000, totalExpenses: 30000, netSavings: 20000, savingsRate: 40,
  };
  const monthly = (rows: Array<[string, number, number]>) => rows.map(([period, income, expenses]) => ({ period, label: period, income, expenses, net: income - expenses }));
  async function renderReports(rowsForMetrics: ReturnType<typeof monthly> | null, opts: { balance?: boolean } = {}) {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      const u = String(url);
      if (u.includes("/api/reports/trends") && u.includes("metrics=1")) {
        return rowsForMetrics ? json({ ...TOTALS, timeseries: rowsForMetrics }) : { ok: false, status: 500, json: async () => null };
      }
      if (u.includes("/api/reports/trends")) return json({ ...TOTALS, timeseries: monthly([["2026-10", 1, 1]]) });
      if (u.includes("type=balance-sheet")) return opts.balance ? json({ date: "2026-10-09", assets: [], liabilities: [], totalAssets: 900, totalLiabilities: 100, netWorth: 800 }) : { ok: false, status: 404, json: async () => null };
      if (u.includes("/api/net-worth-history")) return json({ series: [{ date: "2026-08-31", value: 500 }, { date: "2026-09-30", value: 700 }, { date: "2026-10-08", value: 800 }] });
      return { ok: false, status: 404, json: async () => null };
    }));
    // Reports default to this year; these tiles are about the month-vs-last-month default, so ask for it.
    if (!H.search) H.search = "range=this_month";
    const { default: ReportsPage } = await import("@/app/(app)/reports/page");
    render(<ReportsPage />);
    await screen.findAllByText("Total Income");
  }
  const tileOf = (label: string) => screen.getAllByText(label).map((e) => e.closest(".gradient-border")).find(Boolean) as HTMLElement;
  const SERIES = monthly([["2026-07", 1000, 700], ["2026-08", 1000, 700], ["2026-09", 1000, 700], ["2026-10", 1200, 600]]);

  it("the four summary tiles are MetricCards: period figure, badge, signed difference, sparkline; the report range total is the note", async () => {
    await renderReports(SERIES);
    await waitFor(() => expect(tileOf("Total Income").textContent).toMatch(/\+\$200\.00 vs last month/));
    const income = tileOf("Total Income");
    expect(income.textContent).toContain("+20.0%");
    expect(income.textContent).toMatch(/\d{4}-\d{2}-01 to \d{4}-\d{2}-\d{2}: \$50,000/);
    expect(income.querySelectorAll("[data-spark]").length).toBeGreaterThan(0);
    // spending down = green (inverted)
    expect(tileOf("Total Expenses").textContent).toMatch(/-\$100\.00 vs last month/);
    expect((tileOf("Total Expenses").querySelector('[class*="rounded-full"]') as HTMLElement).className).toContain("text-pos");
    expect(tileOf("Net Savings").textContent).toMatch(/\+\$300\.00 vs last month/);
    // savings rate: 50% (Oct) vs 30% (Sep), same basis for value and delta
    const rate = tileOf("Savings Rate");
    expect(rate.textContent).toContain("50%");
    expect(rate.textContent).toMatch(/\+20 pp vs last month/);
    expect(screen.getByLabelText("Time range")).toBeTruthy();
  });

  it("?range=last_3_months compares Aug-Oct with the 3 months before (only Jul has data)", async () => {
    H.search = "range=last_3_months";
    await renderReports(SERIES);
    await waitFor(() => expect(tileOf("Total Income").textContent).toMatch(/vs previous period/));
  });

  it("no monthly history = the report totals only", async () => {
    await renderReports(null);
    const income = tileOf("Total Income");
    expect(income.textContent).toContain("$50,000");
    expect(income.querySelectorAll("[data-spark]").length).toBe(0);
    expect(income.querySelector('[class*="rounded-full"]')).toBeNull();
    expect(income.textContent).not.toMatch(/vs (last month|previous period)/);
  });

  it("the Net Savings tile is not duplicated and the balance-sheet Net Worth is a MetricCard (no hand-rolled KPI)", async () => {
    await renderReports(SERIES, { balance: true });
    // exactly one Net Savings tile (the top one): no duplicate hero card at the bottom of the income tab
    expect(screen.getAllByText("Net Savings").filter((e) => e.closest(".gradient-border")).length).toBe(1);
    const { fireEvent } = await import("@testing-library/react");
    fireEvent.click(screen.getByRole("tab", { name: /Balance Sheet/i }));
    await waitFor(() => expect(screen.getAllByText("Net Worth").some((e) => e.closest(".gradient-border"))).toBe(true));
    const nw = screen.getAllByText("Net Worth").map((e) => e.closest(".gradient-border")).find(Boolean) as HTMLElement;
    await waitFor(() => expect(nw.textContent).toMatch(/\+\$100\.00 vs last month/)); // 800 now vs 700 at the end of September
  });
});

// ---------------------------------------------------------------- admin stats
describe("/admin stats cards", () => {
  const stats = {
    totalUsers: 12, totalTransactions: 3400, totalAccounts: 30, registrationsLast7Days: 3, registrationsPrevious7Days: 2, registrationsLast30Days: 5,
    verifiedUsers: 10, mfaEnabledUsers: 4, planBreakdown: { free: 10, pro: 2 }, totalLogins: 100, activeUsersLast7Days: 5, activeUsersLast30Days: 8,
    activeUsersLast15Min: 1, activeUsersLast60Min: 2, activeUsersLast24Hours: 3, promptAcks: [], recentLogins: [],
    registrationsByMonth: { "2026-07": 2, "2026-08": 3, "2026-09": 3, "2026-10": 4 } as Record<string, number>,
  };
  async function renderAdmin(s: Record<string, unknown>) {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      const u = String(url);
      if (u.includes("/api/admin/stats")) return json(s);
      if (u.includes("/api/admin/users")) return json({ users: [], total: 0 });
      return json({ grants: [] });
    }));
    const { default: AdminPage } = await import("@/app/(app)/admin/page");
    render(<AdminPage />);
    await screen.findByText("Total Users");
  }
  const tileOf = (label: string) => screen.getByText(label).closest(".gradient-border") as HTMLElement;

  it("Total Users: running total of signups with a delta vs last month; New (7d) vs the previous 7 days", async () => {
    await renderAdmin(stats);
    const total = tileOf("Total Users");
    await waitFor(() => expect(total.textContent).toMatch(/\+4 vs last month/));
    expect(total.textContent).toContain("+50.0%"); // 8 -> 12
    expect(total.querySelectorAll("[data-spark]").length).toBeGreaterThan(0);
    expect(tileOf("New (7d)").textContent).toMatch(/\+1 vs previous 7 days/);
    expect(tileOf("New (7d)").textContent).toContain("+50.0%");
    // no history behind these: value only
    for (const l of ["MFA Enabled", "Active now (15 min)"]) expect(tileOf(l).querySelector('[class*="rounded-full"]')).toBeNull();
    expect(screen.getByLabelText("Time range")).toBeTruthy();
  });

  it("an older server without the history fields = value only", async () => {
    const { registrationsByMonth: _a, registrationsPrevious7Days: _b, ...old } = stats;
    void _a; void _b;
    await renderAdmin(old);
    expect(tileOf("Total Users").querySelectorAll("[data-spark]").length).toBe(0);
    expect(tileOf("Total Users").textContent).not.toMatch(/vs (last month|previous)/);
    expect(tileOf("New (7d)").textContent).not.toMatch(/vs previous/);
  });
});

// ---------------------------------------------------------------- family overview
describe("family overview headline cards", () => {
  const history = [
    { date: "2026-08-31", value: 1000 }, { date: "2026-09-30", value: 1200 }, { date: "2026-10-05", value: 1500 },
  ];
  const monthlyFlows = [
    { month: "2026-08", income: 1000, expenses: 800 }, { month: "2026-09", income: 1000, expenses: 700 }, { month: "2026-10", income: 1000, expenses: 600 },
  ];
  async function renderHeadline(over: Record<string, unknown> = {}) {
    const { HeadlineCards } = await import("@/app/(app)/family/_components/overview-cards");
    render(
      <HeadlineCards
        currency="USD"
        period="month"
        netWorth={{ net: 1500, assets: 1600, liabilities: 100, history }}
        flows={{ income: 1000, expenses: 600, monthly: monthlyFlows, daily: [], from: null }}
        savingsRatePct={40}
        dti={{ pct: 10, reliable: true }}
        lifetime={{ history, monthly: monthlyFlows }}
        {...over}
      />,
    );
  }
  const tileOf = (label: string) => screen.getByText(label).closest(".gradient-border") as HTMLElement;

  it("net worth, income, expenses and savings rate compare this month with last month (badge + signed difference + series)", async () => {
    await renderHeadline();
    expect(tileOf("Total Net Worth").textContent).toMatch(/\+\$300\.00 vs last month/);
    expect(tileOf("Total Net Worth").textContent).toContain("+25.0%");
    expect(tileOf("Monthly Income").textContent).toMatch(/\+\$0\.00 vs last month/);
    expect(tileOf("Monthly Expenses").textContent).toMatch(/-\$100\.00 vs last month/);
    expect((tileOf("Monthly Expenses").querySelector('[class*="rounded-full"]') as HTMLElement).className).toContain("text-pos");
    const rate = tileOf("Savings Rate");
    expect(rate.textContent).toContain("40%");
    expect(rate.textContent).toMatch(/\+10 pp vs last month/);
    expect(rate.querySelectorAll("[data-spark]").length).toBeGreaterThan(0);
    // DTI has no monthly series in the overview DTO: value only
    expect(tileOf("Debt-to-Income").querySelector('[class*="rounded-full"]')).toBeNull();
  });

  it("this year compares with the previous period (when the history reaches back); all time has no previous period (no fake delta)", async () => {
    const longer = [{ date: "2025-12-31", value: 500 }, ...history];
    await renderHeadline({ period: "year", lifetime: { history: longer, monthly: monthlyFlows } });
    expect(tileOf("Total Net Worth").textContent).toMatch(/\+\$1,000\.00 vs previous period/);
    cleanup();
    await renderHeadline({ period: "year" }); // history starts in August: the previous period is not derivable
    expect(tileOf("Total Net Worth").textContent).not.toMatch(/vs (last month|previous period)/);
    cleanup();
    await renderHeadline({ period: "all" });
    expect(tileOf("Total Net Worth").textContent).not.toMatch(/vs (last month|previous period)/);
  });

  it("without the lifetime history = the figures only", async () => {
    await renderHeadline({ lifetime: undefined });
    expect(tileOf("Monthly Income").textContent).not.toMatch(/vs last month/);
    expect(tileOf("Monthly Income").querySelector('[class*="rounded-full"]')).toBeNull();
  });
});
