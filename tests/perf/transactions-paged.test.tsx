/**
 * @vitest-environment jsdom
 */
// Server-paged Transactions list. The hook fetches cursor pages
// (limit=50&cursor=...) from GET /api/transactions; the server filters and
// sorts. Covers the hook contract (pages, filter reset, refetch, dedupe, errors,
// end of list) and the workspace partial-state rendering (canned hook result).
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as React from "react";
import { renderHook, waitFor, act, cleanup, render, screen, fireEvent } from "@testing-library/react";
import { SWRConfig } from "swr";

const H = vi.hoisted(() => ({
  SP: new URLSearchParams(""),
  RES: {} as Record<string, unknown>,
  useMock: false,
  // Size class for the workspace section: regular defaults to List (the "No transactions yet" empty state).
  size: "regular" as "compact" | "regular" | "wide",
}));
vi.mock("@/components/adaptive/size-class-context", async (orig) => ({
  ...(await orig<typeof import("@/components/adaptive/size-class-context")>()),
  useAppSizeClass: () => H.size,
}));

import {
  useTransactions,
  isNonDefaultTxView,
  type UseTransactionsFilters,
} from "@/app/(app)/transactions/_hooks/use-transactions";

const NO_FILTERS: UseTransactionsFilters = {
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

// Fake server: default order id DESC, cursor "o:<offset>", total on the first page only.
let ROWS: ReturnType<typeof mkTx>[] = [];
let FAIL_FIRST = false;
let calls: string[] = [];

function serve(url: string) {
  const u = new URL(url, "http://localhost");
  const limit = Number(u.searchParams.get("limit"));
  const cursor = u.searchParams.get("cursor");
  const search = u.searchParams.get("search") ?? "";
  const rows = ROWS.filter((t) => !search || t.payee.includes(search));
  const offset = cursor ? Number(cursor.slice(2)) : 0;
  const slice = rows.slice(offset, offset + limit);
  const end = offset + slice.length;
  const hasMore = end < rows.length;
  return {
    data: slice,
    hasMore,
    nextCursor: hasMore ? `o:${end}` : null,
    ...(cursor ? {} : { total: rows.length }),
  };
}

function cursorOf(url: string) {
  return new URL(url, "http://localhost").searchParams.get("cursor");
}

function wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(SWRConfig, { value: { provider: () => new Map() } }, children);
}

beforeEach(() => {
  H.useMock = false;
  ROWS = Array.from({ length: 300 }, (_, i) => mkTx(300 - i));
  FAIL_FIRST = false;
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      calls.push(url);
      if (FAIL_FIRST && cursorOf(url) === "") {
        return { ok: false, status: 500, json: async () => ({}) };
      }
      return { ok: true, status: 200, json: async () => serve(url) };
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("useTransactions server-paged list", () => {
  it("first page renders with limit=50 and an empty cursor, and reports total", async () => {
    const { result } = renderHook(() => useTransactions(NO_FILTERS, DEFAULT_SORT), { wrapper });
    await waitFor(() => expect(result.current.txns.length).toBe(50));
    expect(calls).toHaveLength(1);
    const u = new URL(calls[0], "http://localhost");
    expect(u.searchParams.get("limit")).toBe("50");
    expect(u.searchParams.get("cursor")).toBe("");
    expect(result.current.total).toBe(300);
    expect(result.current.txns[0].id).toBe(300);
    expect(result.current.loading).toBe(false);
    expect(result.current.hasMore).toBe(true);
    expect(result.current.isPartial).toBe(false);
    expect(result.current.fullLoadError).toBe(false);
  });

  it("loading is true only before the first page; rows never disappear once shown", async () => {
    const history: Array<{ loading: boolean; n: number }> = [];
    const { result } = renderHook(
      () => {
        const r = useTransactions(NO_FILTERS, DEFAULT_SORT);
        history.push({ loading: r.loading, n: r.txns.length });
        return r;
      },
      { wrapper },
    );
    await waitFor(() => expect(result.current.txns.length).toBe(50));
    const firstRows = history.findIndex((h) => h.n > 0);
    expect(firstRows).toBeGreaterThanOrEqual(0);
    // Once any rows are on screen, the table never shows the skeleton again.
    expect(history.slice(firstRows).some((h) => h.loading)).toBe(false);
  });

  it("loadNextPage appends the next cursor page", async () => {
    const { result } = renderHook(() => useTransactions(NO_FILTERS, DEFAULT_SORT), { wrapper });
    await waitFor(() => expect(result.current.txns.length).toBe(50));
    act(() => result.current.loadNextPage());
    await waitFor(() => expect(result.current.txns.length).toBe(100));
    expect(cursorOf(calls[calls.length - 1])).toBe("o:50");
    expect(result.current.txns[99].id).toBe(201);
  });

  it("loadNextPage is a no-op when hasMore is false", async () => {
    ROWS = ROWS.slice(0, 30);
    const { result } = renderHook(() => useTransactions(NO_FILTERS, DEFAULT_SORT), { wrapper });
    await waitFor(() => expect(result.current.txns.length).toBe(30));
    expect(result.current.hasMore).toBe(false);
    const before = calls.length;
    act(() => result.current.loadNextPage());
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    expect(calls.length).toBe(before);
    expect(result.current.page).toBe(1);
    expect(result.current.txns.length).toBe(30);
  });

  it("a filter change resets to one page with no empty flash", async () => {
    const history: Array<{ loading: boolean; n: number; total: number }> = [];
    const { result, rerender } = renderHook(
      ({ f }: { f: UseTransactionsFilters }) => {
        const r = useTransactions(f, DEFAULT_SORT);
        history.push({ loading: r.loading, n: r.txns.length, total: r.total });
        return r;
      },
      { wrapper, initialProps: { f: NO_FILTERS } },
    );
    await waitFor(() => expect(result.current.txns.length).toBe(50));
    act(() => result.current.loadNextPage());
    await waitFor(() => expect(result.current.txns.length).toBe(100));

    const changeAt = history.length;
    rerender({ f: { ...NO_FILTERS, search: "p29" } });
    await waitFor(() => expect(result.current.total).toBe(11));
    expect(result.current.txns.length).toBe(11);
    expect(result.current.hasMore).toBe(false);
    // From the change onward, the list never shows an empty frame that is not loading.
    expect(history.slice(changeAt).some((h) => !h.loading && h.n === 0)).toBe(false);
    // The filtered list starts again at the first page; no page-2 request for it.
    const filtered = calls.filter((c) => c.includes("search=p29"));
    expect(filtered.some((c) => cursorOf(c) === "")).toBe(true);
    expect(filtered.some((c) => cursorOf(c) === "o:50")).toBe(false);
  });

  it("loadTxns refetches every loaded page", async () => {
    const { result } = renderHook(() => useTransactions(NO_FILTERS, DEFAULT_SORT), { wrapper });
    await waitFor(() => expect(result.current.txns.length).toBe(50));
    act(() => result.current.loadNextPage());
    await waitFor(() => expect(result.current.txns.length).toBe(100));

    calls = [];
    await act(async () => {
      await result.current.loadTxns();
    });
    await waitFor(() => expect(calls.length).toBeGreaterThanOrEqual(2));
    const refetched = calls.map(cursorOf);
    expect(refetched).toContain("");
    expect(refetched).toContain("o:50");
    expect(result.current.txns.length).toBe(100);
  });

  it("no request ever carries limit=100000", async () => {
    const { result, rerender } = renderHook(
      ({ f }: { f: UseTransactionsFilters }) => useTransactions(f, DEFAULT_SORT),
      { wrapper, initialProps: { f: NO_FILTERS } },
    );
    await waitFor(() => expect(result.current.txns.length).toBe(50));
    act(() => result.current.loadNextPage());
    await waitFor(() => expect(result.current.txns.length).toBe(100));
    rerender({ f: { ...NO_FILTERS, search: "p1" } });
    await waitFor(() => expect(result.current.total).toBeGreaterThan(0));
    await act(async () => {
      await result.current.loadTxns();
    });
    expect(calls.length).toBeGreaterThan(0);
    for (const c of calls) {
      expect(new URL(c, "http://localhost").searchParams.get("limit")).not.toBe("100000");
    }
    expect(calls.some((c) => c.includes("limit=100000"))).toBe(false);
  });

  it("de-duplicates rows by id across pages", async () => {
    ROWS[50] = ROWS[49]; // the server repeats one row at the page seam
    const { result } = renderHook(() => useTransactions(NO_FILTERS, DEFAULT_SORT), { wrapper });
    await waitFor(() => expect(result.current.txns.length).toBe(50));
    act(() => result.current.loadNextPage());
    await waitFor(() => expect(result.current.txns.length).toBe(99));
    const ids = result.current.txns.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("a first page error sets loadError and leaves no rows", async () => {
    FAIL_FIRST = true;
    const { result } = renderHook(() => useTransactions(NO_FILTERS, DEFAULT_SORT), { wrapper });
    await waitFor(() => expect(result.current.loadError).toBe(true));
    expect(result.current.txns).toHaveLength(0);
    expect(result.current.loading).toBe(false);
  });

  it("the account-type filter waits for accounts (no request without them)", async () => {
    const f = { ...NO_FILTERS };
    const colFilters = [{ type: "enum" as const, columnId: "accountType" as const, values: ["A"] }];
    const { result, rerender } = renderHook(
      ({ accounts }: { accounts: Array<{ id: number; type: string }> }) =>
        useTransactions(f, DEFAULT_SORT, colFilters, accounts as never),
      { wrapper, initialProps: { accounts: [] as Array<{ id: number; type: string }> } },
    );
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    expect(calls).toHaveLength(0);
    rerender({ accounts: [{ id: 1, type: "A" }] });
    await waitFor(() => expect(result.current.txns.length).toBe(50));
    expect(calls.every((c) => c.includes("accountIds=1"))).toBe(true);
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
});

// ── workspace-level: canned hook result, rendering and controls ─────────────
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

function canned(extra: Record<string, unknown> = {}) {
  return {
    txns: [], total: 0, loading: false, limit: 50, loadTxns: vi.fn(),
    loadNextPage: () => {}, resetPage: () => {}, page: 1, hasMore: true, loadError: false,
    isPartial: false, fullLoadError: false, isLoadingMore: false, loadMoreError: false, ...extra,
  };
}

describe("TransactionsWorkspace partial-state rendering (canned hook result)", () => {
  beforeEach(() => {
    H.useMock = true;
    H.size = "regular";
    (globalThis as any).ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
    (Element.prototype as any).scrollIntoView ??= () => {};
    (Element.prototype as any).hasPointerCapture ??= () => false;
    (window as any).matchMedia ??= () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ data: [] }) })));
  });

  it("no 'Loading full history' note while partial and a search filter is active (partial UI removed)", () => {
    H.SP = new URLSearchParams("search=coffee");
    H.RES = canned({ isPartial: true, total: 200, hasMore: true, txns: [] });
    render(<TransactionsWorkspace />);
    expect(screen.queryByText("Loading full history...")).toBeNull();
  });

  it("shows no note on the default view while partial", () => {
    H.SP = new URLSearchParams("");
    H.RES = canned({ isPartial: true, total: 200 });
    render(<TransactionsWorkspace />);
    expect(screen.queryByText("Loading full history...")).toBeNull();
  });

  it("shows no note once the full list is in, even with a filter", () => {
    H.SP = new URLSearchParams("search=coffee");
    H.RES = canned({ isPartial: false, total: 300, hasMore: false });
    render(<TransactionsWorkspace />);
    expect(screen.queryByText("Loading full history...")).toBeNull();
  });

  it("(a) while a no-match filter is still loading: no partial note and no empty state", () => {
    H.SP = new URLSearchParams("search=zzz-no-such-payee");
    H.RES = canned({ loading: true, isPartial: true });
    render(<TransactionsWorkspace />);
    expect(screen.queryByText("Loading full history...")).toBeNull();
    expect(screen.queryByText("No transactions yet")).toBeNull();
    expect(screen.queryByText("No transactions found")).toBeNull();
  });

  it("(a) once the list lands with zero matches: the empty state shows", () => {
    H.SP = new URLSearchParams("search=zzz-no-such-payee");
    H.RES = canned({ loading: false, isPartial: false, hasMore: false });
    render(<TransactionsWorkspace />);
    expect(screen.getAllByText("No transactions yet").length).toBeGreaterThan(0);
  });

  it("(b) export is enabled whenever total > 0, even while partial", () => {
    H.SP = new URLSearchParams("");
    H.RES = canned({ isPartial: true, total: 200 });
    render(<TransactionsWorkspace />);
    const btn = screen.getByRole("button", { name: /Export CSV/ }) as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
  });

  it("(b) export is disabled once the list has zero rows", () => {
    H.SP = new URLSearchParams("");
    H.RES = canned({ isPartial: false, total: 0, hasMore: false });
    render(<TransactionsWorkspace />);
    const btn = screen.getByRole("button", { name: /Export CSV/ }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it("(d) Retry after a later-page error calls loadTxns", () => {
    H.SP = new URLSearchParams("");
    const loadTxns = vi.fn();
    H.RES = canned({ loadMoreError: true, total: 200, txns: [], loadTxns, hasMore: true });
    render(<TransactionsWorkspace />);
    expect(screen.getByText("Couldn't load more.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(loadTxns).toHaveBeenCalledTimes(1);
  });
});
