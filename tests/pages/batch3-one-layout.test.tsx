/**
 * @vitest-environment jsdom
 */
// Batch 3 mobile-design pages (transactions list, reports, investment): one layout at every width.
// Each page renders the shared PageHeader (one h1) inside a centred SectionPage column, has no <table>,
// and its rows are ListRow / HoldingRow. A row tap opens a DetailSheet with the row's actions.
import * as React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { render, screen, fireEvent, cleanup, within, waitFor } from "@testing-library/react";

const SP = vi.hoisted(() => new URLSearchParams(""));
const H = vi.hoisted(() => {
  const mkTx = (o: any) => ({ id: 1, date: "2026-01-01", accountId: 1, accountName: "A", categoryId: 4, categoryName: "C", categoryType: "E", currency: "USD", amount: -50, enteredAmount: -50, enteredCurrency: "USD", quantity: null, portfolioHolding: null, note: "", payee: "Shop", tags: "", isBusiness: 0, linkId: null, tradeLinkId: null, kind: null, ...o });
  const TXNS = [mkTx({ id: 1, payee: "Shop" }), mkTx({ id: 2, payee: "Move", linkId: "L" }), mkTx({ id: 3, payee: "Cafe" })];
  return {
    push: vi.fn(),
    replace: vi.fn(),
    overview: { current: null as unknown },
    SIZE: { current: "wide" as "compact" | "regular" | "wide" },
    IDENT: (items: any) => items,
    SORT: { columnId: "date", direction: "desc" },
    LK: { accounts: [{ id: 1, name: "A", currency: "USD", type: "A", group: "g", archived: false }], categories: [{ id: 4, name: "C", type: "E", group: "g" }], holdings: [] as any[] },
    RES: { txns: TXNS, total: 3, loading: false, limit: 50, loadTxns: () => {}, loadNextPage: () => {}, resetPage: () => {}, page: 1, hasMore: false, isLoadingMore: false, loadMoreError: false, loadError: false },
  };
});

vi.mock("next/link", () => ({
  default: ({ children, href, ...p }: React.PropsWithChildren<{ href: string }>) => React.createElement("a", { href, ...p }, children),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: H.push, replace: H.replace, back: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => SP,
  useParams: () => ({}),
  usePathname: () => "/",
}));
vi.mock("@/components/dev-mode-guard", () => ({ DevModeGuard: ({ children }: { children: React.ReactNode }) => children }));
vi.mock("@/hooks/use-dev-mode", () => ({ useDevMode: () => false }));
vi.mock("@/components/currency-provider", () => ({ useDisplayCurrency: () => ({ displayCurrency: "USD", isLoading: false }) }));
vi.mock("@/components/notice/feeds", () => ({ NoticeFeed: () => null }));
vi.mock("@/components/chart/sankey", () => ({ SankeyView: () => null }));
vi.mock("@/components/reports/income-expense-trend-card", () => ({ IncomeExpenseTrendCard: () => null }));
vi.mock("@/app/(app)/reports/_components/account-filter", () => ({ AccountFilter: () => null }));
vi.mock("@/components/portfolio/PerformanceChart", () => ({ PerformanceChart: () => <div data-testid="perf-chart" /> }));
vi.mock("@/components/portfolio/lot-inspector-dialog", () => ({ LotInspectorDialog: () => null }));
vi.mock("@/components/holdings/holding-edit-form", () => ({ HoldingEditForm: () => <div>edit form</div> }));
vi.mock("@/app/(app)/portfolio/_components/allocation-charts", () => ({ AllocationCharts: () => null }));
vi.mock("@/app/(app)/portfolio/_components/benchmark-chart", () => ({ BenchmarkChart: () => null }));
vi.mock("@/app/(app)/portfolio/_hooks/use-portfolio", () => ({
  usePortfolioOverview: () => ({ data: H.overview.current, loading: false, reload: vi.fn() }),
  useBenchmarks: () => ({ benchmarks: [], benchmarkLoading: false }),
}));
vi.mock("@/lib/client/user-storage", async (orig) => ({
  ...(await orig<typeof import("@/lib/client/user-storage")>()),
  useSessionUserId: () => ({ userId: "batch3-user", ready: true }),
}));
vi.mock("recharts", () => {
  const Leaf = () => null;
  const Wrap = ({ children }: { children?: React.ReactNode }) => React.createElement("div", null, children);
  return {
    ResponsiveContainer: Wrap, ComposedChart: Wrap, LineChart: Wrap, AreaChart: Wrap, BarChart: Wrap, PieChart: Wrap,
    Line: Leaf, Area: Leaf, Bar: Leaf, Pie: Leaf, Cell: Leaf, XAxis: Leaf, YAxis: Leaf, Tooltip: Leaf, Legend: Leaf,
    CartesianGrid: Leaf, ReferenceLine: Leaf,
  };
});

vi.mock("@/components/adaptive/size-class-context", async (orig) => ({
  ...(await orig<typeof import("@/components/adaptive/size-class-context")>()),
  useAppSizeClass: () => H.SIZE.current,
}));
vi.mock("@/components/dropdown-order-provider", () => ({ useDropdownOrder: () => H.IDENT }));
vi.mock("@/lib/hooks/useActiveCurrencies", () => ({ useActiveCurrencies: () => ["USD"] }));
vi.mock("@/app/(app)/transactions/_hooks/use-tx-prefs", () => {
  const sortv = { sortPref: H.SORT, setSortPref: () => {}, cycleSort: () => {} };
  const filt = { colFilters: [], setColFilters: () => {}, findColFilter: () => undefined, setColFilter: () => {} };
  return { useLookups: () => H.LK, useTxSortPref: () => sortv, useTxFilterPrefs: () => filt };
});
vi.mock("@/app/(app)/transactions/_hooks/use-transactions", () => ({ useTransactions: () => H.RES }));

import { TransactionsWorkspace } from "@/app/(app)/transactions/_components/transactions-workspace";
import ReportsPage from "@/app/(app)/reports/page";
import PortfolioPage from "@/app/(app)/portfolio/page";

const SRC = path.resolve(__dirname, "../../src");
const read = (rel: string) => fs.readFileSync(path.join(SRC, rel), "utf-8");

const TRENDS = {
  period: "monthly",
  groupBy: "category",
  startDate: "2026-01-01",
  endDate: "2026-01-31",
  timeseries: [{ period: "2026-01", label: "Jan", income: 100, expenses: 50, net: 50 }],
  income: [{ name: "Salary", group: "Income", categoryId: 1, total: 100, count: 1, periods: { "2026-01": 100 } }],
  expenses: [{ name: "Food", group: "Living", categoryId: 2, total: 50, count: 2, periods: { "2026-01": 50 } }],
  totalIncome: 100,
  totalExpenses: 50,
  netSavings: 50,
  savingsRate: 50,
};
const BALANCE = {
  date: "2026-01-31",
  assets: [{ accountGroup: "Bank", accountName: "Checking", currency: "USD", balance: 1000 }],
  liabilities: [{ accountGroup: "Card", accountName: "Visa", currency: "USD", balance: 200 }],
  totalAssets: 1000,
  totalLiabilities: 200,
  netWorth: 800,
};

function json(body: unknown) {
  return { ok: true, status: 200, json: async () => body };
}

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const u = String(url);
      if (u.startsWith("/api/reports/trends")) return json(TRENDS);
      if (u.includes("type=balance-sheet")) return json(BALANCE);
      if (u.includes("type=income-statement")) return json({ unrealized: null });
      if (u.startsWith("/api/transactions")) return json({ data: [], total: 0 });
      return { ok: false, status: 404, json: async () => null };
    }),
  );
  (globalThis as any).ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
  (window as any).matchMedia ??= () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const rows = (c: HTMLElement) => Array.from(c.querySelectorAll<HTMLElement>('[data-slot="list-row"]'));

describe("Transactions: one layout at every size", () => {
  for (const size of ["compact", "regular", "wide"] as const) {
    it(`${size}: shared header, Add Transaction primary action, date-grouped rows, no table`, () => {
      H.SIZE.current = size;
      const { container } = render(<TransactionsWorkspace />);
      expect(container.querySelector("table")).toBeNull();
      expect(container.querySelector('[data-slot="page-header"] h1')?.textContent?.trim()).toBe("Transactions");
      // The bar's primary (a typed link, rightmost); at wide the split pane's empty prompt repeats it as a New button.
      expect(container.querySelector('[data-slot="topbar-primary"]')?.getAttribute("aria-label")).toBe("Add Transaction");
      expect(screen.queryAllByRole("button", { name: "Add Transaction" }).length).toBe(size === "wide" ? 1 : 0);
      expect(rows(container).length).toBe(3);
      expect(screen.getByRole("button", { name: "Edit list" })).toBeTruthy();
    });
  }

  it("a phone row is a link to the edit page; no sheet opens", () => {
    H.SIZE.current = "compact";
    const { container } = render(<TransactionsWorkspace />);
    const row = rows(container)[0];
    expect(row.tagName).toBe("A");
    expect(row.getAttribute("href")).toMatch(/^\/transactions\/1\/edit\?returnTo=/);
    fireEvent.click(row);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("Reports: one layout at every size", () => {
  it("full-width SectionPage column, shared header, statement rows, no table", async () => {
    const { container } = render(<ReportsPage />);
    await screen.findByRole("button", { name: /Income/ });
    expect(container.querySelector("table")).toBeNull();
    const root = container.querySelector('[data-testid="reports-root"]') as HTMLElement;
    expect(root).toBeTruthy();
    expect(root.className).not.toContain("mx-auto");
    expect(root.className).not.toMatch(/max-w-/);
    expect(root.querySelector('[data-slot="page-header"] h1')?.textContent?.trim()).toBe("Reports");
    expect(rows(container).length).toBeGreaterThanOrEqual(2);
  });

  it("a category row opens its sheet with the drill-through and insights actions", async () => {
    render(<ReportsPage />);
    // Category groups are collapsed until tapped: open "Living" to reach the Food row.
    fireEvent.click(await screen.findByRole("button", { name: /Living/ }));
    fireEvent.click(screen.getByRole("button", { name: /Food/ }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Share of total")).toBeTruthy();
    expect(within(dialog).getByRole("link", { name: "View transactions" }).getAttribute("href")).toContain("/transactions?");
    expect(within(dialog).getByRole("link", { name: "Category insights" }).getAttribute("href")).toBe("/categories/2");
  });

  it("the balance sheet tab lists accounts as rows with the side totals", async () => {
    const { container } = render(<ReportsPage />);
    await screen.findByRole("button", { name: /Income/ });
    fireEvent.click(screen.getByRole("tab", { name: /Balance Sheet/ }));
    expect(await screen.findByText("Checking")).toBeTruthy();
    expect(screen.getByText("Visa")).toBeTruthy();
    expect(screen.getByText("Total Assets")).toBeTruthy();
    expect(container.querySelector("table")).toBeNull();
  });

  it("the page source has no table import and no size-class wrapper", () => {
    const src = read("app/(app)/reports/page.tsx");
    expect(src).not.toMatch(/from "@\/components\/ui\/table"/);
    expect(src).toContain("<SectionPage");
    expect(read("app/(app)/reports/_components/statement-rows.tsx")).not.toMatch(/<Table\b/);
  });
});

describe("Investment: one layout at every size", () => {
  function overview() {
    const holding = (o: Record<string, unknown>) => ({
      id: 1, accountId: 1, accountName: "TCBS", name: "AAPL", symbol: "AAPL", currency: "USD", assetType: "stock",
      quantity: 10, marketValue: 1000, marketValueDisplay: 1000, unrealizedGainPct: 12.5, unrealizedGainDisplay: 100,
      costBasisDisplay: 900, realizedGainDisplay: 0, avgCostPerShare: 90, price: 100, totalCostBasis: 900,
      ...o,
    });
    const byHoldingRow = {
      key: "eq:AAPL", symbol: "AAPL", name: "AAPL", description: "Apple Inc.", assetType: "stock", totalQty: 10,
      avgCostDisplay: 90, currentPriceDisplay: 100, costBasisDisplay: 900, marketValueDisplay: 1000,
      unrealizedGainDisplay: 100, unrealizedGainPct: 12.5, realizedGainDisplay: 0, dividendsDisplay: 0,
      totalReturnDisplay: 0, totalReturnPct: null, dayChangeDisplay: 10, dayChangePct: 1, nativeCurrency: null,
      avgCostNative: null, currentPriceNative: null, costBasisNative: null, marketValueNative: null, unrealizedGainNative: null,
      realizedGainNative: null, dividendsNative: null, totalReturnNative: null, dayChangeNative: null, pctOfPortfolio: 100,
      accountCount: 2, image: null,
    };
    return {
      displayCurrency: "USD",
      holdings: [holding({}), holding({ id: 2, accountId: 2, accountName: "IBKR", quantity: 3, marketValueDisplay: 300, marketValue: 300 })],
      byHolding: [byHoldingRow],
      summary: {
        totalHoldings: 2, totalAccounts: 2, totalValueDisplay: 1300, dayChangeDisplay: 10, dayChangePct: 1,
        hasQuantityData: true, totalCostBasisDisplay: 1100, totalUnrealizedGainDisplay: 200, totalUnrealizedGainPct: 18,
        totalRealizedGainDisplay: 0, totalDividendsDisplay: 0, totalReturnDisplay: 200, totalReturnPct: 18,
      },
      byType: { stock: { count: 2, value: 1300 } },
      byAccount: {},
      etfXray: { etfCount: 0, etfTotalValueDisplay: 0, etfs: [], regions: {}, sectors: {}, aggregatedStocks: [] },
      topGainers: [],
      topLosers: [],
      undecryptedTxCount: 0,
    };
  }

  beforeEach(() => {
    H.overview.current = overview();
  });

  it("full-width SectionPage column with the shared header (one h1), no table at any width", async () => {
    const { container } = render(<PortfolioPage />);
    await screen.findByText("TCBS");
    expect(container.querySelector("table")).toBeNull();
    const root = container.querySelector('[data-testid="portfolio-root"]') as HTMLElement;
    expect(root).toBeTruthy();
    expect(root.className).not.toContain("mx-auto");
    expect(root.className).not.toMatch(/max-w-/);
    expect(root.querySelector('[data-slot="page-header"] h1')?.textContent?.trim()).toBe("Investment");
  });

  it("holdings are HoldingRows grouped per account (one section per account)", async () => {
    const { container } = render(<PortfolioPage />);
    await screen.findByText("TCBS");
    expect(screen.getByText("IBKR")).toBeTruthy();
    expect(container.querySelector('[data-slot="holdings-by-account"]')).toBeTruthy();
    expect(rows(container).length).toBe(2);
    expect(screen.getByRole("link", { name: "Filter" }).getAttribute("href")).toContain("/filter/holdings");
  });

  it("a holding tap opens the sheet; Edit opens the holding editor", async () => {
    const { container } = render(<PortfolioPage />);
    await screen.findByText("TCBS");
    fireEvent.click(rows(container)[0]);
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("button", { name: "Lots" })).toBeTruthy();
    expect(within(dialog).getByRole("link", { name: "View transactions" })).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Edit" }));
    await waitFor(() => expect(screen.getByText("edit form")).toBeTruthy());
  });

  it("the investment transactions card stays, as ListRows", async () => {
    const { container } = render(<PortfolioPage />);
    await screen.findByText("TCBS");
    const card = await waitFor(() => {
      const el = container.querySelector('[data-slot="investment-transactions"]');
      expect(el).toBeTruthy();
      return el as HTMLElement;
    });
    expect(within(card).getByText("Transactions")).toBeTruthy();
    expect(card.querySelector("table")).toBeNull();
  });

  it("the dividends and realized-gains sub-pages have no table and use the list", () => {
    for (const rel of ["app/(app)/portfolio/dividends/page.tsx", "app/(app)/portfolio/realized-gains/page.tsx"]) {
      const src = read(rel);
      expect(src).not.toMatch(/from "@\/components\/ui\/table"/);
      expect(src).toContain("<ListRow");
    }
  });
});
