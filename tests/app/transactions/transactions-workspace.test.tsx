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
    RES: { txns: TXNS, total: 3, loading: false, limit: 50, loadTxns: () => {}, loadNextPage: () => {}, resetPage: () => {}, page: 1, hasMore: false },
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
beforeEach(() => { sessionStorage.clear(); push.mockClear();
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
  it("W2 dialog Duplicate (edit plain row) -> writes prefill + pushes", () => {
    render(<TransactionsWorkspace />);
    fireEvent.click(screen.getAllByTitle("Edit")[0]);
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Duplicate transaction" }));
    expect(push).toHaveBeenCalledWith("/transactions/new?prefill=1");
    expect(JSON.parse(sessionStorage.getItem(KEY)!).payee).toBe("pp");
  });
  it("W3 dialog on transfer row: no Duplicate; nothing written", async () => {
    render(<TransactionsWorkspace />);
    fireEvent.click(screen.getAllByTitle("Edit")[1]);
    const dlg = await screen.findByRole("dialog"); console.log("W3 dialog text:", dlg.textContent?.slice(0,120));
    expect(within(dlg).queryByRole("button", { name: "Duplicate transaction" })).toBeNull();
    expect(push).not.toHaveBeenCalled(); expect(sessionStorage.getItem(KEY)).toBeNull();
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
});
