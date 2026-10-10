/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import * as React from "react";
import * as fs from "fs";
import * as path from "path";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import type { SizeClass } from "@/components/ui/size-class";

// One page, one adaptive UI (G2-11): exactly one DataView (Cards | List) mounted, charts shown at
// every size, and no viewport-hidden wrappers or CompactOnly/FromMd around sections.

const size: { current: SizeClass } = { current: "compact" };
const session: { userId: string | null; ready: boolean } = { userId: null, ready: true };

vi.mock("@/components/adaptive/size-class-context", async (orig) => ({
  ...(await orig<typeof import("@/components/adaptive/size-class-context")>()),
  useAppSizeClass: () => size.current,
}));
vi.mock("@/lib/client/user-storage", async (orig) => ({
  ...(await orig<typeof import("@/lib/client/user-storage")>()),
  useSessionUserId: () => ({ userId: session.userId, ready: session.ready }),
}));
vi.mock("next/link", () => ({
  default: ({ children, href, ...p }: React.PropsWithChildren<{ href: string }>) => React.createElement("a", { href, ...p }, children),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => "/portfolio" }));
vi.mock("@/hooks/use-dev-mode", () => ({ useDevMode: () => false }));
vi.mock("@/components/currency-provider", () => ({ useDisplayCurrency: () => ({ displayCurrency: "VND" }) }));
vi.mock("@/components/ui/lazy-view", () => ({ LazyView: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock("@/components/portfolio/PerformanceChart", () => ({ PerformanceChart: () => <div data-testid="perf-chart" /> }));
vi.mock("@/components/portfolio/lot-inspector-dialog", () => ({ LotInspectorDialog: () => null }));
vi.mock("@/components/holdings/holding-edit-form", () => ({ HoldingEditForm: () => null }));
vi.mock("@/app/(app)/portfolio/_components/allocation-charts", () => ({
  AllocationCharts: () => <div data-testid="allocation-charts" />,
}));
vi.mock("@/app/(app)/portfolio/_components/holdings-by-account", () => ({
  HoldingsByAccount: () => <div data-testid="by-account" />,
}));

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

let uid = 0;
beforeEach(() => {
  localStorage.clear();
  uid += 1;
  size.current = "compact";
  session.userId = `pf-dv-user-${uid}`;
  session.ready = true;
  overview.current = makeOverview();
});
afterEach(() => cleanup());

const viewOf = () => document.querySelectorAll("[data-view]");
const mountedView = () => {
  const views = viewOf();
  expect(views).toHaveLength(1);
  return views[0].getAttribute("data-view");
};
const radio = (name: "Cards" | "List") => screen.getByRole("radio", { name });

// A viewport-hidden or size-gated class in a class attribute: `md:x`, `max-md:x`, `lg:x`, `sm:x`, `xl:x`, `2xl:x`.
const VIEWPORT_TOKEN = /(^|\s)(max-)?(sm|md|lg|xl|2xl):/;

describe("portfolio: one DataView (Cards | List) at every size", () => {
  it.each([
    ["compact", "cards"],
    ["regular", "cards"],
    ["wide", "list"],
  ] as const)("mounts exactly one view at %s (default %s)", (sz, expected) => {
    size.current = sz;
    render(<PortfolioPage />);
    expect(mountedView()).toBe(expected);
  });

  it("the toggle swaps the one mounted view; the table is only mounted in List", () => {
    size.current = "regular";
    render(<PortfolioPage />);
    expect(mountedView()).toBe("cards");
    expect(document.querySelector("table")).toBeNull();

    fireEvent.click(radio("List"));
    expect(mountedView()).toBe("list");
    expect(document.querySelector("table")).not.toBeNull();
    expect(within(viewOf()[0] as HTMLElement).getByText("All Holdings")).toBeTruthy();

    fireEvent.click(radio("Cards"));
    expect(mountedView()).toBe("cards");
    expect(document.querySelector("table")).toBeNull();
  });

  it("the Cards/List choice is kept per size class: a choice at compact does not change regular or wide", () => {
    const { rerender } = render(<PortfolioPage />);
    // compact: choose List
    fireEvent.click(radio("List"));
    expect(mountedView()).toBe("list");

    // regular: the compact choice does not apply here (regular default is Cards)
    size.current = "regular";
    rerender(<PortfolioPage />);
    expect(mountedView()).toBe("cards");

    // regular: choose List, then back to compact: the compact choice is still List
    fireEvent.click(radio("List"));
    size.current = "compact";
    rerender(<PortfolioPage />);
    expect(mountedView()).toBe("list");

    // wide default is List even though nothing was chosen at wide
    size.current = "wide";
    rerender(<PortfolioPage />);
    expect(mountedView()).toBe("list");
    fireEvent.click(radio("Cards"));
    expect(mountedView()).toBe("cards");

    // the stored choice survives a remount at the same size class
    cleanup();
    size.current = "compact";
    render(<PortfolioPage />);
    expect(mountedView()).toBe("list");
  });
});

describe("portfolio: charts show at every size, mounted once", () => {
  it.each(["compact", "regular", "wide"] as const)("allocation and performance charts are mounted once at %s", (sz) => {
    size.current = sz;
    render(<PortfolioPage />);
    expect(document.querySelectorAll("[data-testid=allocation-charts]")).toHaveLength(1);
    expect(document.querySelectorAll("[data-testid=perf-chart]")).toHaveLength(1);
    // no size-gated wrapper around the charts
    for (const id of ["allocation-charts", "perf-chart"]) {
      const el = document.querySelector(`[data-testid=${id}]`) as HTMLElement;
      expect(el.closest(".hidden"), id).toBeNull();
    }
  });

  it("the per-account panel is part of the List view (not a separate tree)", () => {
    size.current = "compact";
    render(<PortfolioPage />);
    expect(screen.queryByTestId("by-account")).toBeNull();
    fireEvent.click(radio("List"));
    expect(document.querySelectorAll("[data-testid=by-account]")).toHaveLength(1);
    expect(viewOf()[0].contains(screen.getByTestId("by-account"))).toBe(true);
  });
});

describe("portfolio: no viewport-hidden trees or CompactOnly/FromMd around sections", () => {
  // Scope: the portfolio's own blocks (summary, toolbar, Cards). Shared components are not part of
  // this page's migration and keep their own tokens, tracked by the guard baseline: the PageHeader
  // (mobile/), and every ui/card (class "group/card"), which MetricCard and the Cards section use.
  it.each(["compact", "regular", "wide"] as const)("no viewport-token classes in the summary, toolbar or Cards at %s", (sz) => {
    size.current = sz;
    render(<PortfolioPage />);
    const hits = () => {
      const roots = [
        document.querySelector("[data-slot=portfolio-summary]"),
        document.querySelector("[data-slot=portfolio-toolbar]"),
        document.querySelector("[data-slot=portfolio-holding-cards]"),
      ].filter((r): r is Element => r !== null);
      expect(roots.length).toBeGreaterThanOrEqual(2);
      return roots
        .flatMap((root) => [root, ...Array.from(root.querySelectorAll("[class]"))])
        .filter((el) => el.closest("[class*='group/card']") === null)
        .filter((el) => VIEWPORT_TOKEN.test(el.getAttribute("class") ?? ""))
        .map((el) => el.getAttribute("class"));
    };
    expect(hits()).toEqual([]);
  });

  it("no CompactOnly / FromMd in the portfolio page, its components or the performance chart", () => {
    const root = process.cwd();
    const files = [
      "src/app/(app)/portfolio/page.tsx",
      ...fs.readdirSync(path.join(root, "src/app/(app)/portfolio/_components")).map((f) => `src/app/(app)/portfolio/_components/${f}`),
      "src/components/portfolio/PerformanceChart.tsx",
    ];
    for (const f of files) {
      const src = fs.readFileSync(path.join(root, f), "utf-8");
      expect(src, f).not.toMatch(/<(CompactOnly|FromMd)\b/);
    }
  });
});
