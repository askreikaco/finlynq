/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import * as React from "react";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { formatCurrency } from "@/lib/currency";

vi.mock("next/link", () => ({
  default: ({ children, href, ...p }: React.PropsWithChildren<{ href: string }>) => React.createElement("a", { href, ...p }, children),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => "/portfolio" }));
vi.mock("@/hooks/use-dev-mode", () => ({ useDevMode: () => false }));
vi.mock("@/components/currency-provider", () => ({ useDisplayCurrency: () => ({ displayCurrency: "VND" }) }));
vi.mock("@/components/portfolio/PerformanceChart", () => ({ PerformanceChart: () => <div data-testid="perf-chart" /> }));
vi.mock("@/components/portfolio/lot-inspector-dialog", () => ({ LotInspectorDialog: () => null }));
vi.mock("@/components/holdings/holding-edit-form", () => ({ HoldingEditForm: () => null }));
vi.mock("@/app/(app)/portfolio/_components/allocation-charts", () => ({ AllocationCharts: () => null }));
vi.mock("@/app/(app)/portfolio/_components/holdings-by-account", () => ({ HoldingsByAccount: () => <div data-testid="by-account" /> }));

const overview = vi.hoisted(() => ({ current: null as unknown }));
vi.mock("@/app/(app)/portfolio/_hooks/use-portfolio", () => ({
  usePortfolioOverview: () => ({ data: overview.current, loading: false, reload: vi.fn() }),
  useBenchmarks: () => ({ benchmarks: [], benchmarkLoading: false }),
}));

import PortfolioPage from "@/app/(app)/portfolio/page";

const row = (o: Record<string, unknown>) => ({
  key: "eq:AAPL", symbol: "AAPL", name: "AAPL", description: "Apple Inc.", assetType: "stock", totalQty: 10.5,
  avgCostDisplay: 4000000, currentPriceDisplay: 5000000, costBasisDisplay: 42000000, marketValueDisplay: 52500000,
  unrealizedGainDisplay: 10500000, unrealizedGainPct: 25, realizedGainDisplay: 1200000, dividendsDisplay: 0,
  totalReturnDisplay: 0, totalReturnPct: null, dayChangeDisplay: 100000, dayChangePct: 0.2, nativeCurrency: null,
  avgCostNative: null, currentPriceNative: null, costBasisNative: null, marketValueNative: null, unrealizedGainNative: null,
  realizedGainNative: null, dividendsNative: null, totalReturnNative: null, dayChangeNative: null, pctOfPortfolio: 50, accountCount: 1, image: null,
  ...o,
});
const holding = (o: Record<string, unknown>) => ({ id: 1, accountId: 1, accountName: "TCBS", name: "AAPL", symbol: "AAPL", currency: "USD", assetType: "stock", ...o });

function makeOverview(over: Record<string, unknown> = {}) {
  return {
    displayCurrency: "VND",
    holdings: [holding({}), holding({ id: 2, accountId: 2, accountName: "IBKR" })],
    byHolding: [
      row({}),
      row({ key: "eq:VNM", symbol: "VNM", name: "VNM", description: "Vinamilk", totalQty: 100, marketValueDisplay: 8000000, unrealizedGainDisplay: -1000000, unrealizedGainPct: -11.1, avgCostDisplay: 90000, currentPriceDisplay: 80000 }),
      row({ key: "cash:VND", symbol: "VND", name: "VND", description: null, assetType: "cash", totalQty: 5000000, marketValueDisplay: 5000000, unrealizedGainDisplay: 0, unrealizedGainPct: null, avgCostDisplay: null, currentPriceDisplay: null }),
    ],
    summary: {
      totalHoldings: 3, totalAccounts: 2, totalValueDisplay: 65500000, dayChangeDisplay: 100000, dayChangePct: 0.15,
      hasQuantityData: true, totalCostBasisDisplay: 55000000, totalUnrealizedGainDisplay: 9500000, totalUnrealizedGainPct: 17.3,
      totalRealizedGainDisplay: 1200000, totalDividendsDisplay: 300000, totalReturnDisplay: 11000000, totalReturnPct: 20,
    },
    byType: { etf: { count: 0, value: 0 }, stock: { count: 2, value: 60500000 }, crypto: { count: 0, value: 0 }, cash: { count: 1, value: 5000000 }, metal: { count: 0, value: 0 } },
    byAccount: {},
    etfXray: { etfCount: 0, etfTotalValueDisplay: 0, etfs: [], regions: {}, sectors: {}, aggregatedStocks: [] },
    topGainers: [], topLosers: [],
    ...over,
  };
}

beforeEach(() => { overview.current = makeOverview(); });
afterEach(cleanup);
const cls = (el: Element) => el.className.toString().split(/\s+/);
const mobileList = () => document.querySelector("[data-slot=portfolio-mobile-holdings]") as HTMLElement;

describe("Portfolio page below md", () => {
  it("hero: total value, day change and total gain; desktop stat cards + returns card hidden below md", () => {
    render(<PortfolioPage />);
    const hero = document.querySelector("[data-slot=portfolio-mobile-hero]") as HTMLElement;
    expect(cls(hero)).toContain("md:hidden");
    expect(within(hero).getByText(formatCurrency(65500000, "VND"))).toBeTruthy();
    expect(within(hero).getByText(/\+.*100,000.*\(\+0\.15%\)/)).toBeTruthy();
    expect(within(hero).getByText("Total gain")).toBeTruthy();
    expect(within(hero).getByText(/9,500,000.*\(\+17\.30%\)/)).toBeTruthy();
    // 2-col metric grid
    const grid = hero.querySelector("[data-slot=metric-grid]")!;
    expect(cls(grid)).toContain("grid-cols-2");
    expect(within(grid as HTMLElement).getByText("Cost basis")).toBeTruthy();
    expect(within(grid as HTMLElement).getByText("Realized G/L")).toBeTruthy();
    // desktop blocks only hidden below md
    expect(cls(screen.getByText("Total Holdings").closest("div.grid")!)).toContain("max-md:hidden");
    expect(cls(screen.getByText("Investment Returns").parentElement!)).toContain("max-md:hidden");
  });

  it("holdings rows show ONLY name | market value + unrealized % in text-pos / text-neg", () => {
    render(<PortfolioPage />);
    const list = mobileList();
    const rows = within(list).getAllByRole("button").filter((b) => b.getAttribute("data-slot") === "list-row");
    expect(rows.map((r) => r.getAttribute("aria-label"))).toEqual(["AAPL", "VNM", "Cash · VND"]);

    const aapl = rows[0];
    expect(within(aapl).getByText(formatCurrency(52500000, "VND"))).toBeTruthy();
    expect(cls(within(aapl).getByText("+25.00%"))).toContain("text-pos");
    const vnm = rows[1];
    expect(cls(within(vnm).getByText(/11\.10%/))).toContain("text-neg");
    // nothing else leaks into the row: no qty / avg cost / price / account / description
    for (const leaked of ["10.5", "Apple Inc.", "TCBS", formatCurrency(4000000, "VND")]) {
      expect(aapl.textContent).not.toContain(leaked);
    }
    // cash row: amount, no % line
    expect(rows[2].querySelector("[data-slot=list-row-secondary]")).toBeNull();
  });

  it("tapping a row opens a DetailSheet with qty, avg cost, price, cost basis, unrealized, realized and accounts", () => {
    render(<PortfolioPage />);
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(within(mobileList()).getByRole("button", { name: "AAPL" }));
    const dlg = screen.getByRole("dialog");
    expect(within(dlg).getByText("Apple Inc.")).toBeTruthy();
    const dl = dlg.querySelector("[data-slot=detail-list]") as HTMLElement;
    const get = (label: string) => within(dl).getByText(label).parentElement!.querySelector("dd")!.textContent;
    expect(get("Quantity")).toBe("10.5");
    expect(get("Avg cost")).toContain("4,000,000");
    expect(get("Price")).toContain("5,000,000");
    expect(get("Cost basis")).toContain("42,000,000");
    expect(get("Unrealized G/L")).toMatch(/\+.*10,500,000.*\(\+25\.00%\)/);
    expect(get("Realized G/L")).toMatch(/\+.*1,200,000/);
    expect(get("Accounts")).toBe("IBKR, TCBS");
    expect(cls(within(dl).getByText(/10,500,000/))).toContain("text-pos");
  });

  it("type chips filter the rows", () => {
    render(<PortfolioPage />);
    const list = mobileList();
    fireEvent.click(within(within(list).getByRole("group", { name: "Filter holdings by type" })).getByRole("button", { name: /^Cash/ }));
    const rows = within(list).getAllByRole("button").filter((b) => b.getAttribute("data-slot") === "list-row");
    expect(rows.map((r) => r.getAttribute("aria-label"))).toEqual(["Cash · VND"]);
  });

  it("desktop table is still rendered (hidden below md) and mobile list is md:hidden", () => {
    render(<PortfolioPage />);
    expect(cls(mobileList())).toContain("md:hidden");
    const tableWrap = screen.getByRole("table").closest("div.max-md\\:hidden");
    expect(tableWrap).not.toBeNull();
    expect(screen.getByText("All Holdings")).toBeTruthy();
    expect(cls(screen.getByTestId("by-account").parentElement!)).toContain("max-md:hidden");
  });

  it("empty chart is hidden below md when there are no open positions", () => {
    overview.current = makeOverview({
      byHolding: [row({ totalQty: 0, marketValueDisplay: 0 })],
      summary: { ...makeOverview().summary, totalHoldings: 1 },
    });
    render(<PortfolioPage />);
    expect(cls(screen.getByTestId("perf-chart").parentElement!)).toContain("max-md:hidden");
  });

  it("chart stays visible when there are positions", () => {
    render(<PortfolioPage />);
    expect(cls(screen.getByTestId("perf-chart").parentElement!)).not.toContain("max-md:hidden");
  });
});
