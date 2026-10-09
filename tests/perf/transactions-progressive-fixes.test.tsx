/**
 * @vitest-environment jsdom
 */
// Progressive transactions load fixes: no false "No transactions" empty state
// while the 200-row window has no match, export enabled while partial, the
// fast key dropped once the full list is in, and a Retry for a failed full load.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as React from "react";
import { renderHook, waitFor, cleanup, render, screen, fireEvent } from "@testing-library/react";
import { SWRConfig } from "swr";

const H = vi.hoisted(() => ({
  SP: new URLSearchParams(""),
  RES: {} as Record<string, unknown>,
  useMock: false,
  keyLog: [] as Array<string | null>,
}));

// Spy on every useSWR key the hook passes (the fast key is the second call per render).
vi.mock("swr", async (importOriginal) => {
  const actual = await importOriginal<typeof import("swr")>();
  const spied = (key: any, ...rest: any[]) => {
    H.keyLog.push(key);
    return (actual.default as any)(key, ...rest);
  };
  return { ...actual, default: spied };
});

const FULL_KEY = "/api/transactions?limit=100000";
const FAST_KEY = "/api/transactions?limit=200";

import {
  useTransactions,
  TX_FULL_KEY,
  TX_FAST_KEY,
} from "@/app/(app)/transactions/_hooks/use-transactions";

const NO_FILTERS = {
  id: "", startDate: "", endDate: "", accountId: "", categoryId: "", search: "",
  portfolioHolding: "", tag: "", direction: "", minAmount: "", maxAmount: "",
};
const NO_MATCH = { ...NO_FILTERS, search: "zzz-no-such-payee" };
const DEFAULT_SORT = { columnId: null, direction: null } as const;

function mkTx(id: number) {
  return {
    id, date: new Date(Date.UTC(2026, 0, 1) + id * 86400000).toISOString().slice(0, 10), accountId: 1, accountName: "A",
    categoryId: 4, categoryName: "C", categoryType: "E", currency: "USD", amount: -id,
    enteredAmount: -id, enteredCurrency: "USD", payee: `p${id}`, note: "", tags: "",
    source: "manual", accountType: "A", portfolioHolding: null, portfolioHoldingSymbol: null,
  };
}
// Full ledger: 300 rows, id DESC so the server order is ids 300..1.
const ALL = Array.from({ length: 300 }, (_, i) => mkTx(300 - i));
const FAST_ROWS = ALL.slice(0, 200);

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
  H.keyLog = [];
  queue = {};
  calls = [];
  vi.stubGlobal("fetch", vi.fn(fetchImpl));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("useTransactions partial-load fixes", () => {
  it("(a) a filter matching nothing in the 200 window keeps loading while full loads, then reports a real empty list", async () => {
    const { result } = renderHook(() => useTransactions(NO_MATCH, DEFAULT_SORT), { wrapper });
    await waitFor(() => expect(calls).toEqual(expect.arrayContaining([FULL_KEY, FAST_KEY])));
    settle(FAST_KEY, { data: FAST_ROWS, total: 300 });

    await waitFor(() => expect(result.current.isPartial).toBe(true));
    expect(result.current.txns.length).toBe(0);
    expect(result.current.total).toBe(0);
    // Not the empty state: the full history may still match.
    expect(result.current.loading).toBe(true);
    expect(result.current.loadError).toBe(false);

    settle(FULL_KEY, { data: ALL, total: 300 });
    await waitFor(() => expect(result.current.isPartial).toBe(false));
    // Full arrived with zero matches: now the empty state is legitimate.
    expect(result.current.txns.length).toBe(0);
    expect(result.current.loading).toBe(false);
  });

  it("(c) the fast key is passed as null once full data exists", async () => {
    const { result } = renderHook(() => useTransactions(NO_FILTERS, DEFAULT_SORT), { wrapper });
    await waitFor(() => expect(calls).toEqual(expect.arrayContaining([FULL_KEY, FAST_KEY])));
    // While partial, the fast window key is live.
    expect(H.keyLog).toContain(TX_FAST_KEY);

    settle(FAST_KEY, { data: FAST_ROWS, total: 300 });
    settle(FULL_KEY, { data: ALL, total: 300 });
    await waitFor(() => expect(result.current.isPartial).toBe(false));

    // Last render: full key live, fast key null (no refetch of the window).
    expect(H.keyLog.slice(-2)).toEqual([TX_FULL_KEY, null]);
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
    useTransactions: (...args: Parameters<typeof actual.useTransactions>) =>
      H.useMock ? (H.RES as ReturnType<typeof actual.useTransactions>) : actual.useTransactions(...args),
  };
});

import { TransactionsWorkspace } from "@/app/(app)/transactions/_components/transactions-workspace";

function canned(extra: Record<string, unknown> = {}) {
  return {
    txns: [], total: 0, loading: false, limit: 10, loadTxns: vi.fn(),
    loadNextPage: () => {}, resetPage: () => {}, page: 1, hasMore: true, loadError: false,
    isPartial: true, fullLoadError: false, ...extra,
  };
}

describe("TransactionsWorkspace partial-load fixes", () => {
  beforeEach(() => {
    H.useMock = true;
    (globalThis as any).ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
    (Element.prototype as any).scrollIntoView ??= () => {};
    (Element.prototype as any).hasPointerCapture ??= () => false;
    (window as any).matchMedia ??= () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ data: [] }) })));
  });

  it("(a) while the no-match window is still loading: 'Loading full history...' and no empty state", () => {
    H.SP = new URLSearchParams("search=zzz-no-such-payee");
    H.RES = canned({ loading: true, isPartial: true });
    render(<TransactionsWorkspace />);
    expect(screen.getByText("Loading full history...")).toBeTruthy();
    expect(screen.queryByText("No transactions yet")).toBeNull();
    expect(screen.queryByText("No transactions found")).toBeNull();
  });

  it("(a) once the full list lands with zero matches: the empty state shows", () => {
    H.SP = new URLSearchParams("search=zzz-no-such-payee");
    H.RES = canned({ loading: false, isPartial: false, hasMore: false });
    render(<TransactionsWorkspace />);
    expect(screen.getAllByText("No transactions yet").length).toBeGreaterThan(0);
  });

  it("(b) export is enabled while partial with zero window matches", () => {
    H.SP = new URLSearchParams("");
    H.RES = canned({ isPartial: true, total: 0 });
    render(<TransactionsWorkspace />);
    const btn = screen.getByRole("button", { name: /Export CSV/ }) as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
  });

  it("(b) export is disabled once the full list has zero rows", () => {
    H.SP = new URLSearchParams("");
    H.RES = canned({ isPartial: false, total: 0, hasMore: false });
    render(<TransactionsWorkspace />);
    const btn = screen.getByRole("button", { name: /Export CSV/ }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it("(d) Retry after a full-load error calls loadTxns", () => {
    H.SP = new URLSearchParams("");
    const loadTxns = vi.fn();
    H.RES = canned({ isPartial: true, fullLoadError: true, total: 200, txns: [], loadTxns, hasMore: false });
    render(<TransactionsWorkspace />);
    expect(screen.getByText(/Full history failed to load/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(loadTxns).toHaveBeenCalledTimes(1);
  });
});
