/**
 * @vitest-environment jsdom
 */
// Navigating away from a page and back must paint its metric cards and charts from the SWR cache on the FIRST render:
// no skeleton, no shimmer, no empty chart. The network is dead on the second mount, so only the cache can answer.
import "fake-indexeddb/auto";
import * as React from "react";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, waitFor, act } from "@testing-library/react";
import { SWRConfig } from "swr";

const H = vi.hoisted(() => ({ search: "", params: {} as Record<string, string> }));

vi.mock("next/link", () => ({ default: ({ children, href, ...p }: React.PropsWithChildren<{ href: string }>) => React.createElement("a", { href, ...p }, children) }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(H.search),
  useParams: () => H.params,
  usePathname: () => "/",
}));
vi.mock("@/components/currency-provider", () => ({ useDisplayCurrency: () => ({ displayCurrency: "USD", isLoading: false }) }));
vi.mock("@/components/onboarding-tips", () => ({ OnboardingTips: () => null }));
vi.mock("@/lib/client/user-storage", async (orig) => ({
  ...(await orig<typeof import("@/lib/client/user-storage")>()),
  useSessionUserId: () => ({ userId: "remount-user", ready: true }),
}));
vi.mock("@/components/dropdown-order-provider", () => ({ useDropdownOrder: () => <T,>(items: T[]) => items }));
vi.mock("@/lib/hooks/useActiveCurrencies", () => ({ useActiveCurrencies: () => ["USD"] }));
vi.mock("@/components/ui/lazy-view", () => ({ LazyView: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock("@/components/adaptive/size-class-context", async (orig) => ({
  ...(await orig<typeof import("@/components/adaptive/size-class-context")>()),
  useAppSizeClass: () => "regular",
}));
vi.mock("@/hooks/use-animations", () => ({ useAnimations: () => false }));
vi.mock("@/lib/utils/date", async (orig) => ({ ...(await orig<typeof import("@/lib/utils/date")>()), localDateISO: () => "2026-10-09" }));
vi.mock("@/components/sparkline", () => ({ Sparkline: ({ data }: { data: number[] }) => <div data-spark={data.length} /> }));
// Heavy children that own their own (separately tested) loading states.
vi.mock("@/app/(app)/dashboard/_components/action-center", () => ({ ActionCenter: () => null }));
vi.mock("@/app/(app)/dashboard/_components/weekly-recap", () => ({ WeeklyRecap: () => null }));
vi.mock("@/app/(app)/dashboard/_components/quick-import", () => ({ QuickImport: () => null }));
vi.mock("@/app/(app)/dashboard/_components/income-expense-chart", () => ({ IncomeExpenseChart: () => null }));
vi.mock("@/app/(app)/dashboard/_components/spending-category-chart", () => ({ SpendingCategoryChart: () => null }));
vi.mock("@/app/(app)/dashboard/_components/available-to-spend", () => ({ AvailableToSpend: () => null }));
vi.mock("@/app/(app)/dashboard/_components/insights-section", () => ({ InsightsSection: () => null }));
vi.mock("@/components/net-worth-history-chart", () => ({ NetWorthHistoryChart: () => null }));
vi.mock("@/components/currency-audit-banner", () => ({ CurrencyAuditBanner: () => null }));
vi.mock("@/components/onboarding-wizard", () => ({ OnboardingWizard: () => null }));
vi.mock("@/components/subscriptions/due-card", () => ({ DueCard: () => null }));
vi.mock("@/components/portfolio/PerformanceChart", () => ({ PerformanceChart: () => null }));
vi.mock("@/components/portfolio/lot-inspector-dialog", () => ({ LotInspectorDialog: () => null }));
vi.mock("@/components/holdings/holding-edit-form", () => ({ HoldingEditForm: () => null }));
vi.mock("@/app/(app)/portfolio/_components/allocation-charts", () => ({ AllocationCharts: () => null }));
vi.mock("@/app/(app)/reports/_components/account-filter", () => ({ AccountFilter: () => null }));
vi.mock("@/components/sankey-chart", () => ({ SankeyChart: () => null }));
vi.mock("@/components/reports/income-expense-trend-card", () => ({ IncomeExpenseTrendCard: () => null }));
vi.mock("recharts", () => {
  const Leaf = () => null;
  const Wrap = ({ children }: { children?: React.ReactNode }) => React.createElement("div", null, children);
  return {
    ResponsiveContainer: Wrap, LineChart: Wrap, AreaChart: Wrap, BarChart: Wrap, ComposedChart: Wrap, PieChart: Wrap, Pie: Wrap,
    Line: Leaf, Area: Leaf, Bar: Leaf, Cell: Leaf, XAxis: Leaf, YAxis: Leaf, Tooltip: Leaf, Legend: Leaf, ReferenceLine: Leaf, CartesianGrid: Leaf,
  };
});

import { resetFetchActivity } from "@/lib/data/fetch-activity";
import { resetWriteClock } from "@/lib/swr/http-freshness";

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as Response;
type Route = (url: string) => unknown | undefined;

function routeFetch(route: Route) {
  return vi.fn(async (url: string) => {
    const body = route(String(url));
    return body === undefined ? ({ ok: false, status: 404, json: async () => null } as Response) : ok(body);
  });
}
const deadNetwork = () => vi.fn(() => new Promise(() => {}));

const shimmer = () => document.querySelector(".animate-shimmer");
const hasTestId = (id: string) => () => document.querySelector(`[data-testid="${id}"]`) != null;
const hasText = (t: string) => () => document.body.textContent?.includes(t) ?? false;

/** Mount `Page` with `route`, wait for `ready`, unmount; mount again on a dead network and return what the FIRST render shows. */
async function remount(Page: React.ComponentType, route: Route, ready: () => boolean) {
  const cache = new Map<string, unknown>();
  const wrap = () => (
    <SWRConfig value={{ provider: () => cache as never, dedupingInterval: 0, errorRetryCount: 0, revalidateOnFocus: false }}>
      <Page />
    </SWRConfig>
  );
  vi.stubGlobal("fetch", routeFetch(route));
  const first = render(wrap());
  await waitFor(() => expect(ready()).toBe(true), { timeout: 4000 });
  await waitFor(() => expect(shimmer()).toBeNull());
  first.unmount();

  const net = deadNetwork();
  vi.stubGlobal("fetch", net);
  let second!: ReturnType<typeof render>;
  act(() => {
    second = render(wrap());
  });
  // No awaiting: this is what the user sees on the very first frame after navigating back.
  return { ready: ready(), shimmer: shimmer(), alert: document.querySelector('[role="alert"]'), requested: net.mock.calls.length, second };
}

beforeEach(() => {
  H.search = "";
  H.params = {};
  window.localStorage.clear();
  resetFetchActivity();
  resetWriteClock();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const NW = [{ month: "2026-09", currency: "USD", cumulative: 40 }, { month: "2026-10", currency: "USD", cumulative: 48 }];

describe("page remount paints from cache without a loading state", { timeout: 30_000 }, () => {
  it("dashboard: cards, layout and dev-mode come from the cache; background revalidation is still requested", async () => {
    const rel = (n: number) => {
      const d = new Date();
      const x = new Date(Date.UTC(d.getFullYear(), d.getMonth() + n, 1));
      return `${x.getUTCFullYear()}-${String(x.getUTCMonth() + 1).padStart(2, "0")}`;
    };
    const route: Route = (u) => {
      if (u.includes("/api/settings/dashboard-layout")) return null;
      if (u.includes("/api/budgets/series")) return { displayCurrency: "USD", series: [] };
      if (u.includes("/api/dashboard")) {
        return {
          balances: [], netWorthOverTime: NW, spendingByCategory: [], displayCurrency: "USD",
          incomeVsExpenses: [{ month: rel(0), type: "I", total: 1000 }, { month: rel(0), type: "E", total: -400 }],
        };
      }
      if (u.includes("/api/health-score")) return { score: 72, grade: "B", components: [], savingsRatePct: 15, dti: { pct: 20, reliable: true } };
      if (u.includes("/api/auth/session")) return { authenticated: true, onboardingComplete: true };
      if (u.includes("/api/settings/dev-mode")) return { devMode: false };
      return {};
    };
    const { default: DashboardPage } = await import("@/app/(app)/dashboard/page");
    const r = await remount(DashboardPage, route, hasText("Monthly Income"));
    expect(r.ready).toBe(true);
    expect(r.shimmer).toBeNull();
    expect(r.alert).toBeNull();
    expect(screen.getByText("Monthly Income")).toBeTruthy();
    // stale-while-revalidate: it still asks the network in the background (dead here, the cards stay)
    await waitFor(() => expect(vi.mocked(fetch).mock.calls.length).toBeGreaterThan(0));
    expect(shimmer()).toBeNull();
  });

  it("accounts: net worth / assets / liabilities cards from the cache", async () => {
    const balances = [
      { accountId: 1, accountName: "Bank", accountType: "A", accountGroup: "Banks", currency: "USD", balance: 300, convertedBalance: 300 },
      { accountId: 2, accountName: "Visa", accountType: "L", accountGroup: "Credit Card", currency: "USD", balance: -50, convertedBalance: -50 },
    ];
    const route: Route = (u) => {
      if (u.includes("/api/dashboard")) return { balances, netWorthOverTime: NW, assetsOverTime: NW, liabilitiesOverTime: NW };
      if (u.includes("/api/settings/card-layout")) return null;
      if (u.includes("/api/settings/account-group-order")) return { order: { A: ["Banks"], L: [] } };
      return {};
    };
    const { default: AccountsPage } = await import("@/app/(app)/accounts/page");
    const r = await remount(AccountsPage, route, hasText("Total Assets"));
    expect(r.ready).toBe(true);
    expect(r.shimmer).toBeNull();
    expect(document.querySelectorAll("[data-spark]").length).toBeGreaterThan(0); // the sparkline charts too
    expect(screen.getByText("Banks")).toBeTruthy(); // the group order came from the cache as well
  });

  it("reports: cards and charts from the cache (no skeleton)", async () => {
    const trends = {
      period: "monthly", groupBy: "category", startDate: "2026-10-01", endDate: "2026-10-31",
      timeseries: [{ date: "2026-09", income: 900, expenses: 300 }, { date: "2026-10", income: 1000, expenses: 400 }],
      income: [{ name: "Salary", total: 1000, group: "" }], expenses: [{ name: "Rent", total: 400, group: "" }],
      totalIncome: 1000, totalExpenses: 400, netSavings: 600, savingsRate: 60,
    };
    const route: Route = (u) => {
      if (u.includes("/api/reports/trends")) return trends;
      if (u.includes("/api/settings/card-layout")) return null;
      if (u.includes("/api/settings/dev-mode")) return { devMode: false };
      return undefined;
    };
    const { default: ReportsPage } = await import("@/app/(app)/reports/page");
    const r = await remount(ReportsPage, route, hasTestId("metric-report-income"));
    expect(r.ready).toBe(true);
    expect(r.shimmer).toBeNull();
    expect(r.alert).toBeNull();
    expect(screen.getByTestId("metric-report-expenses")).toBeTruthy();
  });

  it("portfolio: holdings, summary cards and layout from the cache", async () => {
    const holding = {
      id: 1, accountId: 1, accountName: "TCBS", name: "AAPL", symbol: "AAPL", currency: "USD", assetType: "stock",
      quantity: 10, marketValue: 5000, marketValueDisplay: 5000, avgCostPerShare: 400, costBasisDisplay: 4000,
      unrealizedGain: 1000, unrealizedGainDisplay: 1000, realizedGain: 0, realizedGainDisplay: 0,
    };
    const overview = {
      displayCurrency: "USD", holdings: [holding], byHolding: [],
      summary: {
        totalHoldings: 1, totalAccounts: 1, totalValueDisplay: 5000, dayChangeDisplay: 10, dayChangePct: 0.2, hasQuantityData: true,
        totalCostBasisDisplay: 4000, totalUnrealizedGainDisplay: 1000, totalUnrealizedGainPct: 25, totalRealizedGainDisplay: 0,
        totalDividendsDisplay: 0, totalReturnDisplay: 1000, totalReturnPct: 25,
      },
      byType: { etf: { count: 0, value: 0 }, stock: { count: 1, value: 5000 }, crypto: { count: 0, value: 0 }, cash: { count: 0, value: 0 }, metal: { count: 0, value: 0 } },
      byAccount: {}, etfXray: { etfCount: 0, etfTotalValueDisplay: 0, etfs: [], regions: {}, sectors: {}, aggregatedStocks: [] },
      topGainers: [], topLosers: [],
    };
    const route: Route = (u) => {
      if (u.includes("/api/portfolio/overview")) return overview;
      if (u.includes("/api/settings/card-layout")) return null;
      if (u.includes("/api/settings/dev-mode")) return { devMode: false };
      return undefined;
    };
    const { default: PortfolioPage } = await import("@/app/(app)/portfolio/page");
    const r = await remount(PortfolioPage, route, hasTestId("metric-total-value"));
    expect(r.ready).toBe(true);
    expect(r.shimmer).toBeNull();
    expect(screen.getByTestId("metric-total-value").textContent).toContain("5,000");
  });
});
