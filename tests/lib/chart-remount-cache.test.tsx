/**
 * @vitest-environment jsdom
 */
// Charts and dashboard widgets read through the cache-first hook: with their SWR key in the cache the very first render
// has the chart / widget (no "Loading…", no empty chart flash), and a changed server copy replaces it in place.
import "fake-indexeddb/auto";
import * as React from "react";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import { SWRConfig } from "swr";

vi.mock("@/components/currency-provider", () => ({ useDisplayCurrency: () => ({ displayCurrency: "USD", isLoading: false }) }));
vi.mock("@/hooks/use-animations", () => ({ useAnimations: () => false }));
vi.mock("next/link", () => ({ default: ({ children, href, ...p }: React.PropsWithChildren<{ href: string }>) => React.createElement("a", { href, ...p }, children) }));
vi.mock("recharts", () => {
  const Leaf = () => null;
  const Wrap = ({ children }: { children?: React.ReactNode }) => React.createElement("div", { "data-chart": "" }, children);
  return {
    ResponsiveContainer: Wrap, LineChart: Wrap, AreaChart: Wrap, BarChart: Wrap, ComposedChart: Wrap, PieChart: Wrap, Pie: Wrap,
    Line: Leaf, Area: Leaf, Bar: Leaf, Cell: Leaf, XAxis: Leaf, YAxis: Leaf, Tooltip: Leaf, Legend: Leaf, ReferenceLine: Leaf, CartesianGrid: Leaf,
  };
});

import { NetWorthHistoryChart } from "@/components/net-worth-history-chart";
import { PerformanceChart } from "@/components/portfolio/PerformanceChart";
import { WeeklyRecap } from "@/app/(app)/dashboard/_components/weekly-recap";
import { useCardLayout } from "@/components/mobile/use-card-layout";
import { useDevMode } from "@/hooks/use-dev-mode";
import { resetFetchActivity } from "@/lib/data/fetch-activity";
import { resetWriteClock } from "@/lib/swr/http-freshness";

const entry = (data: unknown) => ({ data });
const wrap = (cache: Map<string, unknown>, ui: React.ReactNode) => (
  <SWRConfig value={{ provider: () => cache as never, dedupingInterval: 0, errorRetryCount: 0, revalidateOnFocus: false }}>{ui}</SWRConfig>
);
const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as Response;

beforeEach(() => {
  window.localStorage.clear();
  resetFetchActivity();
  resetWriteClock();
  vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("charts paint from the cache on the first render", () => {
  it("net worth history chart: cached series renders at once, no Loading…, revalidates in the background", async () => {
    const series = [{ date: "2026-08-31", value: 100 }, { date: "2026-09-30", value: 150 }, { date: "2026-10-05", value: 180 }];
    const cache = new Map<string, unknown>([
      ["/api/net-worth-history?period=6m", entry({ displayCurrency: "USD", period: "6m", accountId: null, series, hasInvestmentData: false, fxApproximation: false })],
    ]);
    render(wrap(cache, <NetWorthHistoryChart />));
    expect(screen.queryByText("Loading…")).toBeNull();
    expect(screen.queryByText(/Could not load history/)).toBeNull();
    expect(document.querySelector("[data-chart]")).not.toBeNull();
    await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalledWith("/api/net-worth-history?period=6m"));
  });

  it("net worth history chart: cold shows Loading… until the data arrives", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ok({ displayCurrency: "USD", period: "6m", accountId: null, series: [{ date: "2026-10-05", value: 5 }], hasInvestmentData: false, fxApproximation: false })));
    render(wrap(new Map(), <NetWorthHistoryChart />));
    expect(screen.getByText("Loading…")).toBeTruthy();
    await waitFor(() => expect(screen.queryByText("Loading…")).toBeNull());
  });

  it("portfolio performance chart: cached series renders at once", () => {
    const point = (date: string, v: number) => ({ date, marketValue: v, costBasis: v - 10, contribution: 0, gapsFilled: false });
    const cache = new Map<string, unknown>([
      ["/api/portfolio/performance?period=1y", entry({
        success: true,
        data: {
          period: "1y", accountId: null, from: "2025-10-01", to: "2026-10-01", currency: "USD",
          series: [point("2026-08-01", 100), point("2026-09-01", 110), point("2026-10-01", 120)],
          twrr: { period: 0.2, annualized: 0.2, hadContributions: false }, mwrr: { irr: 0.2, converged: true }, gapsFilledDays: 0,
        },
      })],
    ]);
    render(wrap(cache, <PerformanceChart />));
    expect(screen.queryByText("Loading…")).toBeNull();
    expect(screen.queryByText(/No snapshots yet/)).toBeNull();
    expect(screen.getByText("Market value (USD)")).toBeTruthy();
  });

  it("weekly recap widget: cached recap renders at once", () => {
    const recap = {
      weekStart: "2026-10-05", weekEnd: "2026-10-11",
      spending: { total: 321, previousWeekTotal: 300, changePercent: 7, topCategories: [{ name: "Food", total: 200 }] },
      income: { total: 1000, previousWeekTotal: 900 }, netCashFlow: 679, budgetStatus: [], notableTransactions: [], upcomingBills: [], netWorthChange: 0,
    };
    render(wrap(new Map<string, unknown>([["/api/recap", entry(recap)]]), <WeeklyRecap />));
    expect(screen.getByText("Spent")).toBeTruthy();
    expect(document.body.textContent).toContain("321");
  });
});

describe("settings that gate the first paint come from the cache", () => {
  const CARDS = [{ id: "a", title: "A" }, { id: "b", title: "B" }] as const;
  function Layout() {
    const l = useCardLayout("p", CARDS);
    return <span data-testid="layout">{l.ready ? l.layout.order.join(",") : "not-ready"}</span>;
  }
  function Dev() {
    return <span data-testid="dev">{String(useDevMode())}</span>;
  }

  it("card layout: ready on the first render with the saved order (no skeleton gate)", () => {
    const cache = new Map<string, unknown>([["/api/settings/card-layout?page=p", entry({ order: ["b", "a"], hidden: [] })]]);
    render(wrap(cache, <Layout />));
    expect(screen.getByTestId("layout").textContent).toBe("b,a");
  });

  it("card layout: cold = not ready until fetched; a failed fetch falls back to the default order", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 500, json: async () => null }) as Response));
    render(wrap(new Map(), <Layout />));
    expect(screen.getByTestId("layout").textContent).toBe("not-ready");
    await waitFor(() => expect(screen.getByTestId("layout").textContent).toBe("a,b"));
  });

  it("dev mode: cached value on the first render, null only when cold", () => {
    render(wrap(new Map<string, unknown>([["/api/settings/dev-mode", entry({ devMode: true })]]), <Dev />));
    expect(screen.getByTestId("dev").textContent).toBe("true");
    cleanup();
    render(wrap(new Map(), <Dev />));
    expect(screen.getByTestId("dev").textContent).toBe("null");
  });
});
