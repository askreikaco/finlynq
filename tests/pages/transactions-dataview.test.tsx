/**
 * @vitest-environment jsdom
 */
// Transactions: one list at every width (batch 3). The list is date-grouped mobile ListRows, never a
// <table>. A phone row is a link to the edit page (no bottom sheet; Duplicate / Split / Delete live in its overflow). Select mode adds
// bulk checkboxes. Sort is a compact control, not column headers. The split view (list 2/3 | the shared entry form 1/3, ?sel) is on by default from regular up.
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import * as React from "react";
import * as fs from "fs";
import * as path from "path";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import type { SizeClass } from "@/components/ui/size-class";

const H = vi.hoisted(() => {
  const mkTx = (o: any) => ({ id: 1, date: "2026-01-01", accountId: 1, accountName: "A", categoryId: 4, categoryName: "C", categoryType: "E", currency: "USD", amount: -50, enteredAmount: -50, enteredCurrency: "USD", quantity: null, portfolioHolding: null, note: "nn", payee: "pp", tags: "t", isBusiness: 1, linkId: null, tradeLinkId: null, kind: null, ...o });
  const TXNS = [mkTx({ id: 1 }), mkTx({ id: 2, linkId: "L" }), mkTx({ id: 3, enteredCurrency: "EUR" })];
  return {
    push: vi.fn(),
    IDENT: (items: any) => items,
    SORT: { columnId: "date", direction: "desc" },
    SET_SORT: vi.fn(),
    LK: { accounts: [{ id: 1, name: "A", currency: "USD", type: "A", group: "g", archived: false }], categories: [{ id: 4, name: "C", type: "E", group: "g" }], holdings: [] as any[] },
    RES: { txns: TXNS, total: 3, loading: false, limit: 50, loadTxns: () => {}, loadNextPage: () => {}, resetPage: () => {}, page: 1, hasMore: false, isLoadingMore: false, loadMoreError: false, loadError: false },
    IO: { cbs: [] as Array<(e: any[]) => void> },
  };
});
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
const SEARCH = new URLSearchParams("");
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: H.push, replace: vi.fn(), back: vi.fn() }), useSearchParams: () => SEARCH, usePathname: () => "/transactions" }));
vi.mock("next/link", () => ({
  default: ({ children, href, ...p }: React.PropsWithChildren<{ href: string }>) => React.createElement("a", { href, ...p }, children),
}));
vi.mock("@/components/currency-provider", () => ({ useDisplayCurrency: () => ({ displayCurrency: "USD" }) }));
vi.mock("@/components/dropdown-order-provider", () => ({ useDropdownOrder: () => H.IDENT }));
vi.mock("@/components/notice/feeds", () => ({ NoticeFeed: () => null }));
const ACTIVE = ["USD"];
vi.mock("@/lib/hooks/useActiveCurrencies", () => ({ useActiveCurrencies: () => ACTIVE }));
vi.mock("@/app/(app)/transactions/_hooks/use-tx-prefs", () => {
  const sortv = { sortPref: H.SORT, setSortPref: H.SET_SORT, cycleSort: () => {} };
  const filt = { colFilters: [], setColFilters: () => {}, findColFilter: () => undefined, setColFilter: () => {} };
  return { useLookups: () => H.LK, useTxSortPref: () => sortv, useTxFilterPrefs: () => filt };
});
vi.mock("@/app/(app)/transactions/_hooks/use-transactions", () => ({ useTransactions: () => H.RES }));

import { TransactionsWorkspace } from "@/app/(app)/transactions/_components/transactions-workspace";

const SRC_DIR = path.resolve(__dirname, "../../src");
const read = (rel: string) => fs.readFileSync(path.join(SRC_DIR, rel), "utf-8");
const WORKSPACE = "app/(app)/transactions/_components/transactions-workspace.tsx";
const LIST = "components/transactions/mobile-tx-list.tsx";

class FakeIntersectionObserver {
  constructor(cb: (e: any[]) => void) { H.IO.cbs.push(cb); }
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() { return []; }
}

let uid = 0;
beforeEach(() => {
  uid += 1;
  session.userId = `txn-dataview-user-${uid}`;
  size.current = "compact";
  H.push.mockClear();
  H.SET_SORT.mockClear();
  H.IO.cbs.length = 0;
  Object.assign(H.RES, { hasMore: false, loadNextPage: () => {}, loading: false, isLoadingMore: false, loadMoreError: false, txns: H.RES.txns });
  vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver);
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ data: [] }) })));
  (globalThis as any).ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
  (Element.prototype as any).scrollIntoView ??= () => {};
  (Element.prototype as any).hasPointerCapture ??= () => false;
  (window as any).matchMedia ??= () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  try { localStorage.clear(); } catch { /* storage may be unavailable */ }
});

/** The mobile list rows (ListRow links, buttons or checkbox rows), not other buttons. */
function listRows(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>('[data-slot="list-row"]'));
}

describe("Transactions: one list at every width", () => {
  for (const s of ["compact", "regular", "wide"] as const) {
    it(`${s}: renders the date-grouped mobile rows, no table, no Cards/List toggle`, () => {
      size.current = s;
      const { container } = render(<TransactionsWorkspace />);
      expect(container.querySelector("table")).toBeNull();
      expect(screen.queryAllByRole("radiogroup", { name: "View" })).toHaveLength(0);
      expect(container.querySelectorAll("[data-view]")).toHaveLength(0);
      expect(listRows()).toHaveLength(3);
      expect(container.querySelectorAll('[data-slot="section-card"]').length).toBeGreaterThan(0);
    });
  }

  it("no column headers, column menu or per-column filter popovers at any width", () => {
    size.current = "wide";
    render(<TransactionsWorkspace />);
    expect(screen.queryByRole("button", { name: /Columns/ })).toBeNull();
    expect(screen.queryByText("Visible columns")).toBeNull();
    expect(screen.queryByTitle("Click to sort")).toBeNull();
  });

  it("sort lives on the filter page: no inline sort control, the toolbar has range, search and (via the top bar) Filter", () => {
    size.current = "compact";
    render(<TransactionsWorkspace />);
    expect(screen.queryByTestId("tx-sort-select")).toBeNull();
    expect(screen.getByLabelText("Time range")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Search" })).toBeTruthy();
  });
});

describe("Transactions: a phone row opens the edit page", () => {
  it("compact: a row is a link to /transactions/<id>/edit with the list as returnTo; no sheet opens", () => {
    size.current = "compact";
    render(<TransactionsWorkspace />);
    const row = listRows()[0];
    expect(row.tagName).toBe("A");
    expect(row.getAttribute("href")).toMatch(/^\/transactions\/\d+\/edit\?returnTo=/);
    fireEvent.click(row);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("compact: the list has no row actions (Edit / Duplicate / Split / Delete are on the edit page)", () => {
    size.current = "compact";
    render(<TransactionsWorkspace />);
    fireEvent.click(listRows()[0]);
    for (const name of ["Edit", "Duplicate", "Split", "Delete"]) expect(screen.queryByRole("button", { name })).toBeNull();
    expect(H.push).not.toHaveBeenCalled();
  });

  it("wide: a row tap opens the row in the pane (?sel), not the sheet", () => {
    size.current = "wide";
    render(<TransactionsWorkspace />);
    fireEvent.click(listRows()[0]);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(H.push).toHaveBeenCalledWith(expect.stringMatching(/^\/transactions\?sel=\d+$/), { scroll: false });
  });
});

describe("Transactions: bulk selection is a mode of the one list", () => {
  it("row checkboxes appear only while Select is on; toggling Edit list off clears the selection", () => {
    size.current = "regular";
    render(<TransactionsWorkspace />);
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: "Edit list" }));
    const rowBoxes = screen.getAllByRole("checkbox").filter((el) => el.getAttribute("title") !== "Select all");
    expect(rowBoxes.length).toBe(3);
    fireEvent.click(rowBoxes[0]);
    expect(screen.getByText("1 selected")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Edit list" }));
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
    expect(screen.queryByText("1 selected")).toBeNull();
  });

  it("Select all selects every row; the bulk bar offers the bulk actions", () => {
    size.current = "compact";
    render(<TransactionsWorkspace />);
    fireEvent.click(screen.getByRole("button", { name: "Edit list" }));
    fireEvent.click(screen.getByTitle("Select all"));
    expect(screen.getByText("3 selected")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Apply" })).toBeTruthy();
  });

  it("Select mode is off by default and in every size class (no checkbox on load)", () => {
    for (const s of ["compact", "regular", "wide"] as const) {
      cleanup();
      size.current = s;
      render(<TransactionsWorkspace />);
      expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
      cleanup();
    }
  });
});

describe("Transactions: paging and split view", () => {
  it("the one load-more sentinel sits outside the list, and loads the next page", () => {
    const loadNextPage = vi.fn();
    Object.assign(H.RES, { hasMore: true, loadNextPage });
    size.current = "compact";
    render(<TransactionsWorkspace />);
    const sentinel = screen.getByTestId("infinite-scroll-trigger");
    expect(sentinel.closest('[data-slot="section-card"]')).toBeNull();
    H.IO.cbs[H.IO.cbs.length - 1]([{ isIntersecting: true }]);
    expect(loadNextPage).toHaveBeenCalledTimes(1);
  });

  it("split view is the default at wide (pane beside the list, nothing selected = prompt) and absent below it", () => {
    for (const s of ["compact", "regular"] as const) {
      size.current = s;
      render(<TransactionsWorkspace />);
      expect(screen.queryByTestId("list-detail-pane")).toBeNull();
      expect(screen.queryByTestId("tx-split-toggle")).toBeNull();
      cleanup();
    }
    size.current = "wide";
    render(<TransactionsWorkspace />);
    expect(screen.getByTestId("list-detail-pane").className).toContain("sticky");
    expect(screen.getByTestId("list-detail-empty").textContent).toContain("Select an item to edit, or create a new one");
    expect(screen.queryByTestId("tx-split-toggle")).toBeNull();
  });

  it("a row tap selects it into the pane (?sel) instead of navigating when split, and below wide the row is a link (no handler)", () => {
    size.current = "wide";
    render(<TransactionsWorkspace />);
    fireEvent.click(screen.getAllByText("pp")[0]);
    expect(H.push).toHaveBeenCalledWith("/transactions?sel=1", { scroll: false });
    cleanup();
    H.push.mockClear();
    size.current = "compact";
    render(<TransactionsWorkspace />);
    fireEvent.click(screen.getAllByText("pp")[0]);
    expect(H.push).not.toHaveBeenCalled();
  });
});

describe("Transactions: static guards for the one-layout rule", () => {
  const TOKEN = /(?<![\w-])(max-)?(sm|md|lg|xl|2xl):/;

  it("the workspace mounts no DataView, no ViewModeToggle, no table and no size-class wrappers", () => {
    const src = read(WORKSPACE);
    expect(src.match(/<(CompactOnly|FromMd)\b/g) ?? []).toEqual([]);
    expect(src).not.toMatch(/<DataView\b/);
    expect(src).not.toMatch(/<ViewModeToggle\b/);
    expect(src).not.toMatch(/<Table\b/);
    expect(src).not.toContain("transaction-table");
  });

  it("the old table file is gone; the list is the only row component and the row sheet is gone", () => {
    expect(fs.existsSync(path.join(SRC_DIR, "app/(app)/transactions/_components/transaction-table.tsx"))).toBe(false);
    expect(read(LIST)).toContain("<SectionCard");
    expect(fs.existsSync(path.join(SRC_DIR, "app/(app)/transactions/_components/transaction-sheet.tsx"))).toBe(false);
    expect(read(WORKSPACE)).not.toContain('variant="detail"');
  });

  it("the list and the workspace carry no breakpoint tokens", () => {
    for (const rel of [WORKSPACE, LIST]) {
      expect(read(rel).match(new RegExp(TOKEN.source, "g")) ?? [], rel).toEqual([]);
    }
  });

  it("the list keeps the offline Waiting-to-sync badge and the PageToolbar", async () => {
    expect(read(LIST)).toContain("<PendingSyncBadge mark={t.pendingSync} />");
    size.current = "compact";
    render(<TransactionsWorkspace />);
    await waitFor(() => expect(screen.getByLabelText("Time range")).toBeTruthy());
    // Export CSV is a top-bar More item now (no dashed card above the list).
    fireEvent.click(screen.getByRole("button", { name: "More actions" }));
    expect(await screen.findByRole("menuitem", { name: /Export CSV/ })).toBeTruthy();
  });
});
