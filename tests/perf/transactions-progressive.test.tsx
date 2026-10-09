/**
 * @vitest-environment jsdom
 */
// Progressive transactions load: the recent-200 window renders first, the full
// history replaces it in the background, totals are flagged partial, and
// create/edit/delete refresh both keys.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as React from "react";
import { renderHook, waitFor, act, cleanup, render, screen } from "@testing-library/react";
import { SWRConfig } from "swr";

const H = vi.hoisted(() => ({
  SP: new URLSearchParams(""),
  RES: {} as Record<string, unknown>,
  useMock: false,
}));

// ── hook-level fixtures ──────────────────────────────────────────────────────
const FULL_KEY = "/api/transactions?limit=100000";
const FAST_KEY = "/api/transactions?limit=200";

import {
  useTransactions,
  isNonDefaultTxView,
  TX_FULL_KEY,
  TX_FAST_KEY,
} from "@/app/(app)/transactions/_hooks/use-transactions";

const NO_FILTERS = {
  id: "", startDate: "", endDate: "", accountId: "", categoryId: "", search: "",
  portfolioHolding: "", tag: "", direction: "", minAmount: "", maxAmount: "",
};
const DEFAULT_SORT = { columnId: null, direction: null } as const;

function mkTx(id: number) {
  return {
    id, date: new Date(Date.UTC(2026, 0, 1) + id * 86400000).toISOString().slice(0, 10), accountId: 1, accountName: "A",
    categoryId: 4, categoryName: "C", categoryType: "E", currency: "USD", amount: -id,
    enteredAmount: -id, enteredCurrency: "USD", payee: `p${id}`, note: "", tags: "",
    source: "manual", accountType: "A", portfolioHolding: null, portfolioHoldingSymbol: null,
  };
}
// Full ledger: 300 rows, id DESC so the server order (date DESC, id DESC) is ids 300..1.
const ALL = Array.from({ length: 300 }, (_, i) => mkTx(300 - i));
const FAST_ROWS = ALL.slice(0, 200);

// Controllable fetch: each request waits until the test settles it.
let queue: Record<string, Array<(body: unknown) => void>> = {};
let calls: string[] = [];
function fetchImpl(url: string) {
  calls.push(url);
  return new Promise((resolve) => {
    (queue[url] ??= []).push((body) => resolve({ ok: true, status: 200, json: async () => body }));
  });
}
function settle(url: string, body: unknown) {
  const next = queue[url]?.shift();
  if (!next) throw new Error(`no pending request for ${url}`);
  next(body);
}

function wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(SWRConfig, { value: { provider: () => new Map() } }, children);
}

beforeEach(() => {
  H.useMock = false;
  queue = {};
  calls = [];
  vi.stubGlobal("fetch", vi.fn(fetchImpl));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("useTransactions progressive load", () => {
  it("renders the recent-200 window before the full history resolves", async () => {
    const { result } = renderHook(() => useTransactions(NO_FILTERS, DEFAULT_SORT), { wrapper });
    await waitFor(() => expect(calls).toEqual(expect.arrayContaining([FULL_KEY, FAST_KEY])));

    settle(FAST_KEY, { data: FAST_ROWS, total: 300 });

    await waitFor(() => expect(result.current.txns.length).toBe(10));
    expect(result.current.isPartial).toBe(true);
    expect(result.current.loading).toBe(false);
    expect(result.current.total).toBe(200);
    expect(result.current.hasMore).toBe(true);
    expect(result.current.txns[0].id).toBe(300);
  });

  it("isPartial goes true -> false and the full list replaces the window without a loading flash", async () => {
    const history: Array<{ isPartial: boolean; loading: boolean; n: number }> = [];
    const { result } = renderHook(
      () => {
        const r = useTransactions(NO_FILTERS, DEFAULT_SORT);
        history.push({ isPartial: r.isPartial, loading: r.loading, n: r.txns.length });
        return r;
      },
      { wrapper },
    );
    await waitFor(() => expect(calls).toEqual(expect.arrayContaining([FULL_KEY, FAST_KEY])));
    settle(FAST_KEY, { data: FAST_ROWS, total: 300 });
    await waitFor(() => expect(result.current.isPartial).toBe(true));

    settle(FULL_KEY, { data: ALL, total: 300 });
    await waitFor(() => expect(result.current.isPartial).toBe(false));
    expect(result.current.total).toBe(300);
    expect(result.current.loading).toBe(false);

    // Once any rows are on screen, the table never shows the skeleton again.
    const firstRows = history.findIndex((h) => h.n > 0);
    expect(firstRows).toBeGreaterThanOrEqual(0);
    expect(history.slice(firstRows).some((h) => h.loading)).toBe(false);
  });

  it("mutate (loadTxns) revalidates the full key; the fast key is dropped once full data exists", async () => {
    const { result } = renderHook(() => useTransactions(NO_FILTERS, DEFAULT_SORT), { wrapper });
    await waitFor(() => expect(calls).toEqual(expect.arrayContaining([FULL_KEY, FAST_KEY])));
    settle(FAST_KEY, { data: FAST_ROWS, total: 300 });
    settle(FULL_KEY, { data: ALL, total: 300 });
    await waitFor(() => expect(result.current.isPartial).toBe(false));

    calls = [];
    act(() => {
      void result.current.loadTxns();
    });
    await waitFor(() => expect(calls).toEqual(expect.arrayContaining([FULL_KEY])));
    // Fast window is no longer fetched once the full list is in (null key).
    expect(calls).not.toContain(FAST_KEY);
    // Drain the revalidation request so nothing is left pending.
    settle(FULL_KEY, { data: ALL, total: 300 });
  });

  it("filters during the partial window are flagged by isNonDefaultTxView", async () => {
    const filters = { ...NO_FILTERS, search: "p1" };
    const { result } = renderHook(() => useTransactions(filters, DEFAULT_SORT), { wrapper });
    await waitFor(() => expect(calls).toEqual(expect.arrayContaining([FULL_KEY, FAST_KEY])));
    settle(FAST_KEY, { data: FAST_ROWS, total: 300 });
    await waitFor(() => expect(result.current.txns.length).toBeGreaterThan(0));
    expect(result.current.isPartial).toBe(true);
    expect(isNonDefaultTxView(filters, DEFAULT_SORT, [])).toBe(true);
  });

  it("isNonDefaultTxView: default recent-first view is not flagged; any filter, column filter or non-default sort is", () => {
    expect(isNonDefaultTxView(NO_FILTERS, DEFAULT_SORT, [])).toBe(false);
    expect(isNonDefaultTxView(NO_FILTERS, { columnId: "date", direction: "desc" }, undefined)).toBe(false);
    expect(isNonDefaultTxView({ ...NO_FILTERS, search: "   " }, DEFAULT_SORT, [])).toBe(false);
    expect(isNonDefaultTxView({ ...NO_FILTERS, search: "coffee" }, DEFAULT_SORT, [])).toBe(true);
    expect(isNonDefaultTxView(NO_FILTERS, { columnId: "amount", direction: "desc" }, [])).toBe(true);
    expect(isNonDefaultTxView(NO_FILTERS, { columnId: "date", direction: "asc" }, [])).toBe(true);
    expect(isNonDefaultTxView(NO_FILTERS, DEFAULT_SORT, [{ id: "payee", type: "text", value: "x" }])).toBe(true);
  });

  it("exports the two distinct keys", () => {
    expect(TX_FULL_KEY).toBe(FULL_KEY);
    expect(TX_FAST_KEY).toBe(FAST_KEY);
  });
});

// ── workspace-level: the inline note and footer ─────────────────────────────
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  useSearchParams: () => H.SP,
  usePathname: () => "/transactions",
}));
vi.mock("next/link", () => ({ default: ({ children, href }: any) => React.createElement("a", { href }, children) }));
vi.mock("@/components/currency-provider", () => ({ useDisplayCurrency: () => ({ displayCurrency: "USD" }) }));
vi.mock("@/components/dropdown-order-provider", () => ({ useDropdownOrder: () => (items: any) => items }));
vi.mock("@/lib/hooks/useActiveCurrencies", () => ({ useActiveCurrencies: () => ["USD"] }));
vi.mock("@/app/(app)/transactions/_hooks/use-tx-prefs", async () => {
  const cols = (await import("@/lib/transactions/columns")).DEFAULT_COLUMNS;
  return {
    useLookups: () => ({
      accounts: [{ id: 1, name: "A", currency: "USD", type: "A", group: "g", archived: false }],
      categories: [{ id: 4, name: "C", type: "E", group: "g" }],
      holdings: [],
    }),
    useTxColumnPrefs: () => ({ columnPrefs: cols, setColumnPrefs: () => {}, resetColPrefs: () => {} }),
    useTxSortPref: () => ({ sortPref: { columnId: null, direction: null }, setSortPref: () => {}, cycleSort: () => {} }),
    useTxFilterPrefs: () => ({ colFilters: [], setColFilters: () => {}, findColFilter: () => undefined, setColFilter: () => {} }),
  };
});
vi.mock("@/app/(app)/transactions/_hooks/use-transactions", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/app/(app)/transactions/_hooks/use-transactions")>();
  return {
    ...actual,
    // Real hook for the hook-level tests; canned result for the workspace tests.
    useTransactions: (...args: Parameters<typeof actual.useTransactions>) =>
      H.useMock ? (H.RES as ReturnType<typeof actual.useTransactions>) : actual.useTransactions(...args),
  };
});

import { TransactionsWorkspace } from "@/app/(app)/transactions/_components/transactions-workspace";

function partialRes(extra: Record<string, unknown> = {}) {
  return {
    txns: ALL.slice(0, 10), total: 200, loading: false, limit: 10, loadTxns: vi.fn(),
    loadNextPage: () => {}, resetPage: () => {}, page: 1, hasMore: true, loadError: false,
    isPartial: true, fullLoadError: false, ...extra,
  };
}

describe("TransactionsWorkspace partial-load note", () => {
  beforeEach(() => {
    H.useMock = true;
    (globalThis as any).ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
    (Element.prototype as any).scrollIntoView ??= () => {};
    (Element.prototype as any).hasPointerCapture ??= () => false;
    (window as any).matchMedia ??= () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ data: [] }) })));
  });

  it("shows 'Loading full history...' while partial and a search filter is active", () => {
    H.SP = new URLSearchParams("search=coffee");
    H.RES = partialRes();
    render(<TransactionsWorkspace />);
    expect(screen.getByText("Loading full history...")).toBeTruthy();
  });

  it("shows no note on the default view while partial", () => {
    H.SP = new URLSearchParams("");
    H.RES = partialRes();
    render(<TransactionsWorkspace />);
    expect(screen.queryByText("Loading full history...")).toBeNull();
  });

  it("shows no note once the full list is in, even with a filter", () => {
    H.SP = new URLSearchParams("search=coffee");
    H.RES = partialRes({ isPartial: false, total: 300, hasMore: false });
    render(<TransactionsWorkspace />);
    expect(screen.queryByText("Loading full history...")).toBeNull();
  });
});
