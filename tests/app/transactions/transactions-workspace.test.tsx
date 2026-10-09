/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import * as React from "react";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import fs from "fs";
import path from "path";
const H = vi.hoisted(() => {
  const mkTx = (o: any) => ({ id: 1, date: "2026-01-01", accountId: 1, accountName: "A", categoryId: 4, categoryName: "C", categoryType: "E", currency: "USD", amount: -50, enteredAmount: -50, enteredCurrency: "USD", quantity: null, portfolioHolding: null, note: "nn", payee: "pp", tags: "t", isBusiness: 1, linkId: null, tradeLinkId: null, kind: null, ...o });
  const TXNS = [mkTx({ id: 1 }), mkTx({ id: 2, linkId: "L" }), mkTx({ id: 3, enteredCurrency: "EUR" })];
  return {
    push: vi.fn(), IDENT: (items: any) => items, NOF: [] as any[], SORT: { columnId: "date", direction: "desc" },
    LK: { accounts: [{ id: 1, name: "A", currency: "USD", type: "A", group: "g", archived: false }], categories: [{ id: 4, name: "C", type: "E", group: "g" }], holdings: [] as any[] },
    RES: { txns: TXNS, total: 3, loading: false, limit: 50, loadTxns: () => {}, loadNextPage: () => {}, resetPage: () => {}, page: 1, hasMore: false, isLoadingMore: false, loadMoreError: false, loadError: false },
    IO: { cbs: [] as Array<(e: any[]) => void> },
    SP: new URLSearchParams(""), ACT: ["USD"],
  };
});
const push = H.push;
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: H.push, replace: vi.fn(), back: vi.fn() }), useSearchParams: () => H.SP, usePathname: () => "/transactions" }));
vi.mock("next/link", () => ({ default: ({ children, href }: any) => React.createElement("a", { href }, children) }));
vi.mock("@/components/currency-provider", () => ({ useDisplayCurrency: () => ({ displayCurrency: "USD" }) }));
vi.mock("@/components/dropdown-order-provider", () => ({ useDropdownOrder: () => H.IDENT }));
vi.mock("@/lib/hooks/useActiveCurrencies", () => ({ useActiveCurrencies: () => H.ACT }));
vi.mock("@/app/(app)/transactions/_hooks/use-tx-prefs", async () => {
  const cols = (await import("@/lib/transactions/columns")).DEFAULT_COLUMNS;
  const colPrefs = { columnPrefs: cols, setColumnPrefs: () => {}, resetColPrefs: () => {} };
  const sortv = { sortPref: H.SORT, setSortPref: () => {}, cycleSort: () => {} };
  const filt = { colFilters: H.NOF, setColFilters: () => {}, findColFilter: () => undefined, setColFilter: () => {} };
  return { useLookups: () => H.LK, useTxColumnPrefs: () => colPrefs, useTxSortPref: () => sortv, useTxFilterPrefs: () => filt };
});
vi.mock("@/app/(app)/transactions/_hooks/use-transactions", () => ({ useTransactions: () => H.RES }));
import { TransactionsWorkspace } from "@/app/(app)/transactions/_components/transactions-workspace";
const KEY = "finlynq:tx-prefill";
class FakeIntersectionObserver {
  constructor(cb: (e: any[]) => void) { H.IO.cbs.push(cb); }
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() { return []; }
}
beforeEach(() => { sessionStorage.clear(); push.mockClear(); H.IO.cbs.length = 0;
  vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver);
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ data: [] }) })));
  (globalThis as any).ResizeObserver ??= class { observe(){} unobserve(){} disconnect(){} };
  (Element.prototype as any).scrollIntoView ??= () => {}; (Element.prototype as any).hasPointerCapture ??= () => false;
  (window as any).matchMedia ??= () => ({ matches: false, addListener(){}, removeListener(){}, addEventListener(){}, removeEventListener(){} }); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
describe("workspace", () => {
  it("guard: PageHeader element appears before OnboardingTips element in source", () => {
    const srcPath = path.resolve(__dirname, "../../../src/app/(app)/transactions/_components/transactions-workspace.tsx");
    const source = fs.readFileSync(srcPath, "utf-8");
    const pageHeaderIndex = source.indexOf("<PageHeader");
    const onboardingTipsIndex = source.indexOf("<OnboardingTips page=\"transactions\"");
    expect(pageHeaderIndex).toBeGreaterThan(-1);
    expect(onboardingTipsIndex).toBeGreaterThan(-1);
    expect(pageHeaderIndex).toBeLessThan(onboardingTipsIndex);
  });
  it("W1 table Duplicate -> writes prefill + pushes ?prefill=1", () => {
    render(<TransactionsWorkspace />);
    const dups = screen.getAllByLabelText("Duplicate transaction");
    expect(dups.length).toBe(1);
    fireEvent.click(dups[0]);
    expect(push).toHaveBeenCalledWith("/transactions/new?prefill=1");
    const d = JSON.parse(sessionStorage.getItem(KEY)!);
    expect(d).toMatchObject({ v: 1, amount: "50", accountId: "1", categoryId: "4", payee: "pp", note: "nn", tags: "t", isBusiness: true, txType: "Expense" });
  });
  it("W2 Edit navigates to /transactions/<id>/edit with the current list as returnTo (no dialog)", () => {
    render(<TransactionsWorkspace />);
    fireEvent.click(screen.getAllByTitle("Edit")[0]);
    expect(push).toHaveBeenCalledWith(expect.stringMatching(/^\/transactions\/\d+\/edit\?returnTo=/));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(sessionStorage.getItem(KEY)).toBeNull();
  });
  it("W3 Edit on a transfer row also navigates; the edit page decides transfer mode (no dialog)", () => {
    render(<TransactionsWorkspace />);
    fireEvent.click(screen.getAllByTitle("Edit")[1]);
    expect(push).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("loadError: shows shared ErrorState with retry and calls loadTxns once", () => {
    const saved = { ...H.RES };
    const loadTxns = vi.fn();
    try {
      Object.assign(H.RES, { loadError: true, txns: [], total: 0, loadTxns });
      render(<TransactionsWorkspace />);
      expect(screen.getByRole("alert")).toBeTruthy();
      expect(screen.getByText("Try again")).toBeTruthy();
      const btn = screen.getByText("Try again").closest("button")!;
      expect(btn.className).toContain("min-h-11");
      fireEvent.click(btn);
      expect(loadTxns).toHaveBeenCalledTimes(1);
    } finally {
      for (const k of Object.keys(H.RES)) delete (H.RES as any)[k];
      Object.assign(H.RES, saved);
    }
  });

  it("delete failure shows an inline Alert in the dialog, not native alert()", async () => {
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: any) => init?.method === "DELETE"
      ? ({ ok: false, status: 500, json: async () => ({ error: "boom" }) })
      : ({ ok: true, json: async () => ({ data: [] }) })));
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
    try {
      render(<TransactionsWorkspace />);
      fireEvent.click(screen.getAllByTitle("Delete")[0]);
      const dlg = await screen.findByRole("dialog");
      fireEvent.click(within(dlg).getByRole("button", { name: "Delete" }));
      const alertEl = await within(dlg).findByRole("alert");
      expect(alertEl.textContent).toContain("boom");
      expect(alertSpy).not.toHaveBeenCalled();
    } finally {
      alertSpy.mockRestore();
    }
  });
  it("observer loads the next page only when idle: no load in flight, no failed page, more to load", () => {
    const loadNextPage = vi.fn();
    const saved = { ...H.RES };
    try {
      Object.assign(H.RES, { hasMore: true, loadNextPage, loading: false, isLoadingMore: false, loadMoreError: false });
      const { rerender } = render(<TransactionsWorkspace />);
      const fire = () => H.IO.cbs[H.IO.cbs.length - 1]([{ isIntersecting: true }]);
      fire();
      expect(loadNextPage).toHaveBeenCalledTimes(1);

      H.RES.isLoadingMore = true;
      rerender(<TransactionsWorkspace />);
      fire();
      expect(loadNextPage).toHaveBeenCalledTimes(1);

      H.RES.isLoadingMore = false;
      H.RES.loading = true;
      rerender(<TransactionsWorkspace />);
      fire();
      expect(loadNextPage).toHaveBeenCalledTimes(1);

      H.RES.loading = false;
      H.RES.loadMoreError = true;
      rerender(<TransactionsWorkspace />);
      fire();
      expect(loadNextPage).toHaveBeenCalledTimes(1);

      H.RES.loadMoreError = false;
      H.RES.hasMore = false;
      const before = H.IO.cbs.length;
      rerender(<TransactionsWorkspace />);
      expect(H.IO.cbs.length).toBe(before);
    } finally {
      for (const k of Object.keys(H.RES)) delete (H.RES as any)[k];
      Object.assign(H.RES, saved);
    }
  });

  it("a page landing re-arms the observer so a still-visible sentinel loads the next page", () => {
    const loadNextPage = vi.fn();
    const saved = { ...H.RES };
    try {
      Object.assign(H.RES, { hasMore: true, loadNextPage, isLoadingMore: true, loading: false, loadMoreError: false });
      const { rerender } = render(<TransactionsWorkspace />);
      const before = H.IO.cbs.length;
      H.RES.isLoadingMore = false;
      rerender(<TransactionsWorkspace />);
      expect(H.IO.cbs.length).toBeGreaterThan(before);
      H.IO.cbs[H.IO.cbs.length - 1]([{ isIntersecting: true }]);
      expect(loadNextPage).toHaveBeenCalledTimes(1);
    } finally {
      for (const k of Object.keys(H.RES)) delete (H.RES as any)[k];
      Object.assign(H.RES, saved);
    }
  });

  it("a failed later page shows Couldn't load more with a Retry that calls loadTxns; no partial-load copy", () => {
    const loadTxns = vi.fn();
    const saved = { ...H.RES };
    try {
      Object.assign(H.RES, { loadMoreError: true, hasMore: true, loadTxns });
      render(<TransactionsWorkspace />);
      expect(screen.getByText("Couldn't load more.")).toBeTruthy();
      const btn = screen.getByRole("button", { name: "Retry" });
      expect(btn.className).toContain("min-h-11");
      fireEvent.click(btn);
      expect(loadTxns).toHaveBeenCalledTimes(1);
      expect(screen.queryByText(/Loading full history/)).toBeNull();
      expect(screen.queryByText(/Full history failed/)).toBeNull();
    } finally {
      for (const k of Object.keys(H.RES)) delete (H.RES as any)[k];
      Object.assign(H.RES, saved);
    }
  });

  it("export is enabled whenever the list has rows, even under a text search; disabled at zero", () => {
    const savedSP = H.SP;
    const saved = { ...H.RES };
    try {
      H.SP = new URLSearchParams("search=coffee");
      render(<TransactionsWorkspace />);
      expect((screen.getByRole("button", { name: /Export CSV/ }) as HTMLButtonElement).disabled).toBe(false);
      cleanup();
      Object.assign(H.RES, { total: 0, txns: [] });
      render(<TransactionsWorkspace />);
      expect((screen.getByRole("button", { name: /Export CSV/ }) as HTMLButtonElement).disabled).toBe(true);
    } finally {
      H.SP = savedSP;
      for (const k of Object.keys(H.RES)) delete (H.RES as any)[k];
      Object.assign(H.RES, saved);
    }
  });

  it("search input shows a Clear search button with a mobile hit area", () => {
    render(<TransactionsWorkspace />);
    fireEvent.change(screen.getByPlaceholderText("Search payee, note, or tags…"), { target: { value: "x" } });
    const btn = screen.getByLabelText("Clear search");
    expect(btn.className).toContain("max-md:size-11");
  });
});
