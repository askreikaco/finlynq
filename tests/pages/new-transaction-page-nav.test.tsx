/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as React from "react";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

const H = vi.hoisted(() => {
  const mkTx = (o: any) => ({ id: 1, date: "2026-01-01", accountId: 1, accountName: "A", categoryId: 4, categoryName: "C", categoryType: "E", currency: "USD", amount: -50, enteredAmount: -50, enteredCurrency: "USD", quantity: null, portfolioHolding: null, note: "nn", payee: "pp", tags: "t", isBusiness: 1, linkId: null, tradeLinkId: null, kind: null, ...o });
  return {
    push: vi.fn(),
    IDENT: (items: any) => items,
    SORT: { columnId: "date", direction: "desc" },
    LK: { accounts: [{ id: 1, name: "A", currency: "USD", type: "A", group: "g", archived: false }], categories: [{ id: 4, name: "C", type: "E", group: "g" }], holdings: [] as any[] },
    RES: { txns: [mkTx({ id: 1 })], total: 1, loading: false, limit: 50, loadTxns: () => {}, loadNextPage: () => {}, resetPage: () => {}, page: 1, hasMore: false },
    SP: new URLSearchParams(""),
  };
});
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: H.push, replace: vi.fn(), back: vi.fn() }), useSearchParams: () => H.SP, usePathname: () => "/transactions" }));
vi.mock("next/link", () => ({ default: ({ children, href }: any) => React.createElement("a", { href }, children) }));
vi.mock("@/components/currency-provider", () => ({ useDisplayCurrency: () => ({ displayCurrency: "USD" }) }));
vi.mock("@/components/dropdown-order-provider", () => ({ useDropdownOrder: () => H.IDENT }));
vi.mock("@/lib/hooks/useActiveCurrencies", () => ({ useActiveCurrencies: () => ["USD"] }));
vi.mock("@/app/(app)/transactions/_hooks/use-tx-prefs", async () => {
  const cols = (await import("@/lib/transactions/columns")).DEFAULT_COLUMNS;
  const colPrefs = { columnPrefs: cols, setColumnPrefs: () => {}, resetColPrefs: () => {} };
  const sortv = { sortPref: H.SORT, setSortPref: () => {}, cycleSort: () => {} };
  const filt = { colFilters: [] as any[], setColFilters: () => {}, findColFilter: () => undefined, setColFilter: () => {} };
  return { useLookups: () => H.LK, useTxColumnPrefs: () => colPrefs, useTxSortPref: () => sortv, useTxFilterPrefs: () => filt };
});
vi.mock("@/app/(app)/transactions/_hooks/use-transactions", () => ({ useTransactions: () => H.RES }));
import { TransactionsWorkspace } from "@/app/(app)/transactions/_components/transactions-workspace";

beforeEach(() => {
  H.push.mockClear();
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ data: [] }) })));
  (globalThis as any).ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
  (Element.prototype as any).scrollIntoView ??= () => {};
  (Element.prototype as any).hasPointerCapture ??= () => false;
  (window as any).matchMedia ??= () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("Add opens the New Transaction page, not the dialog", () => {
  it("N1 header Add button navigates to /transactions/new and opens no dialog", () => {
    render(<TransactionsWorkspace />);
    const addBtn = screen.getByText("Add Transaction").closest("button")!;
    fireEvent.click(addBtn);
    expect(H.push).toHaveBeenCalledWith("/transactions/new");
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("N2 dropdown Transaction item navigates to /transactions/new", () => {
    render(<TransactionsWorkspace />);
    fireEvent.click(screen.getByLabelText("More transaction types"));
    fireEvent.click(screen.getByText("Transaction"));
    expect(H.push).toHaveBeenCalledWith("/transactions/new");
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("N3 dropdown Transfer stays on the dialog (no page nav)", () => {
    render(<TransactionsWorkspace />);
    fireEvent.click(screen.getByLabelText("More transaction types"));
    fireEvent.click(screen.getByText("Transfer"));
    expect(H.push).not.toHaveBeenCalledWith("/transactions/new");
    expect(screen.getByRole("dialog")).toBeTruthy();
  });
});
