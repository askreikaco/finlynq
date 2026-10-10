/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import * as React from "react";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";

vi.mock("next/link", () => ({
  default: ({ children, href, ...p }: React.PropsWithChildren<{ href: string }>) => React.createElement("a", { href, ...p }, children),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => "/portfolio" }));
vi.mock("@/hooks/use-dev-mode", () => ({ useDevMode: () => false }));
vi.mock("@/components/currency-provider", () => ({ useDisplayCurrency: () => ({ displayCurrency: "VND" }) }));
vi.mock("@/components/portfolio/PerformanceChart", () => ({ PerformanceChart: () => <div data-testid="perf-chart" /> }));
vi.mock("@/components/holdings/holding-edit-form", () => ({ HoldingEditForm: () => null }));
vi.mock("@/app/(app)/portfolio/_components/allocation-charts", () => ({ AllocationCharts: () => null }));
vi.mock("@/app/(app)/portfolio/_components/holdings-by-account", () => ({ HoldingsByAccount: () => <div data-testid="by-account" /> }));

// Records what the holdings table hands the lot inspector; renders only while open.
const inspector = vi.hoisted(() => ({ calls: [] as Array<{ open: boolean; holdingId: number | null; accountId: number | null; holdingName?: string; accountName?: string }> }));
vi.mock("@/components/portfolio/lot-inspector-dialog", () => ({
  LotInspectorDialog: (p: { open: boolean; holdingId: number | null; accountId: number | null; holdingName?: string; accountName?: string }) => {
    inspector.calls.push(p);
    return p.open ? <div role="dialog" aria-label="Lots">lots for {p.holdingName}</div> : null;
  },
}));

const overview = vi.hoisted(() => ({ current: null as unknown }));
vi.mock("@/app/(app)/portfolio/_hooks/use-portfolio", () => ({
  usePortfolioOverview: () => ({ data: overview.current, loading: false, reload: vi.fn() }),
  useBenchmarks: () => ({ benchmarks: [], benchmarkLoading: false }),
}));

import PortfolioPage from "@/app/(app)/portfolio/page";
vi.mock("@/lib/client/user-storage", async (orig) => ({
  ...(await orig<typeof import("@/lib/client/user-storage")>()),
  useSessionUserId: () => ({ userId: "page-test-user", ready: true }),
}));

const row = (o: Record<string, unknown>) => ({
  key: "eq:AAPL", symbol: "AAPL", name: "AAPL", description: "Apple Inc.", assetType: "stock", totalQty: 10.5,
  avgCostDisplay: 4000000, currentPriceDisplay: 5000000, costBasisDisplay: 42000000, marketValueDisplay: 52500000,
  unrealizedGainDisplay: 10500000, unrealizedGainPct: 25, realizedGainDisplay: 1200000, dividendsDisplay: 0,
  totalReturnDisplay: 0, totalReturnPct: null, dayChangeDisplay: 100000, dayChangePct: 0.2, nativeCurrency: null,
  avgCostNative: null, currentPriceNative: null, costBasisNative: null, marketValueNative: null, unrealizedGainNative: null,
  realizedGainNative: null, dividendsNative: null, totalReturnNative: null, dayChangeNative: null, pctOfPortfolio: 100, accountCount: 1, image: null,
  ...o,
});
const holding = (o: Record<string, unknown>) => ({
  id: 1, accountId: 1, accountName: "TCBS", name: "AAPL", symbol: "AAPL", currency: "USD", assetType: "stock",
  quantity: 10.5, marketValue: 52500000, marketValueDisplay: 52500000, avgCostPerShare: 4000000, costBasisDisplay: 42000000,
  unrealizedGain: 10500000, unrealizedGainDisplay: 10500000, realizedGain: 1200000, realizedGainDisplay: 1200000,
  ...o,
});

function makeOverview() {
  return {
    displayCurrency: "VND",
    holdings: [holding({})],
    byHolding: [row({})],
    summary: {
      totalHoldings: 1, totalAccounts: 1, totalValueDisplay: 52500000, dayChangeDisplay: 100000, dayChangePct: 0.2,
      hasQuantityData: true, totalCostBasisDisplay: 42000000, totalUnrealizedGainDisplay: 10500000, totalUnrealizedGainPct: 25,
      totalRealizedGainDisplay: 1200000, totalDividendsDisplay: 0, totalReturnDisplay: 11700000, totalReturnPct: 27.8,
    },
    byType: { etf: { count: 0, value: 0 }, stock: { count: 1, value: 52500000 }, crypto: { count: 0, value: 0 }, cash: { count: 0, value: 0 }, metal: { count: 0, value: 0 } },
    byAccount: {},
    etfXray: { etfCount: 0, etfTotalValueDisplay: 0, etfs: [], regions: {}, sectors: {}, aggregatedStocks: [] },
    topGainers: [], topLosers: [],
  };
}

beforeEach(() => {
  overview.current = makeOverview();
  inspector.calls.length = 0;
});
afterEach(cleanup);

describe("holdings table: Lots action", () => {
  it("clicking Lots on a per-account row opens the lot inspector for that holding and account", () => {
    render(<PortfolioPage />);
    // The table lives in the List view (Cards is the default at compact). Switch to it.
    fireEvent.click(screen.getByRole("radio", { name: "List" }));
    // Expand the table row for AAPL (rows toggle on click).
    const table = document.querySelector("table") as HTMLElement;
    const aaplRow = within(table).getAllByRole("row").find((r) => r.textContent?.includes("AAPL") && !r.textContent.includes("Account")) as HTMLElement;
    fireEvent.click(aaplRow);

    const lotsButton = within(table).getByRole("button", { name: /Lots/ });
    expect(screen.queryByRole("dialog", { name: "Lots" })).toBeNull();
    fireEvent.click(lotsButton);

    const opened = inspector.calls.filter((c) => c.open);
    expect(opened.length).toBeGreaterThan(0);
    expect(opened[opened.length - 1]).toMatchObject({ holdingId: 1, accountId: 1, accountName: "TCBS" });
    expect(screen.getByRole("dialog", { name: "Lots" })).toBeTruthy();
  });
});
