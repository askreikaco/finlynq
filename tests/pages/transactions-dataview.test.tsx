/**
 * @vitest-environment jsdom
 */
// Transactions workspace on one adaptive UI (G2-09): one toolbar, one DataView.
// Cards = phone rows (paged, edit on tap). List = TransactionTable (bulk select, column filters).
// Only the selected view is mounted. Size class and session are controlled per test.
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
vi.mock("@/components/onboarding-tips", () => ({ OnboardingTips: () => null }));
const ACTIVE = ["USD"];
vi.mock("@/lib/hooks/useActiveCurrencies", () => ({ useActiveCurrencies: () => ACTIVE }));
vi.mock("@/app/(app)/transactions/_hooks/use-tx-prefs", async () => {
  const cols = (await import("@/lib/transactions/columns")).DEFAULT_COLUMNS;
  const colPrefs = { columnPrefs: cols, setColumnPrefs: () => {}, resetColPrefs: () => {} };
  const sortv = { sortPref: H.SORT, setSortPref: () => {}, cycleSort: () => {} };
  const filt = { colFilters: [], setColFilters: () => {}, findColFilter: () => undefined, setColFilter: () => {} };
  return { useLookups: () => H.LK, useTxColumnPrefs: () => colPrefs, useTxSortPref: () => sortv, useTxFilterPrefs: () => filt };
});
vi.mock("@/app/(app)/transactions/_hooks/use-transactions", () => ({ useTransactions: () => H.RES }));

import { TransactionsWorkspace } from "@/app/(app)/transactions/_components/transactions-workspace";
import { VIEW_MODE_STORAGE_KEY } from "@/components/adaptive/view-mode";

const SRC_DIR = path.resolve(__dirname, "../../src");
const read = (rel: string) => fs.readFileSync(path.join(SRC_DIR, rel), "utf-8");
const WORKSPACE = "app/(app)/transactions/_components/transactions-workspace.tsx";
const TABLE = "app/(app)/transactions/_components/transaction-table.tsx";
const CARDS = "components/transactions/mobile-tx-list.tsx";

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

function mountedViews(): string[] {
  return Array.from(document.querySelectorAll("[data-view]")).map((el) => el.getAttribute("data-view") ?? "");
}
function storedPrefs(): Record<string, string> {
  const raw = localStorage.getItem(`${VIEW_MODE_STORAGE_KEY}:${session.userId}`);
  return raw ? JSON.parse(raw) : {};
}
function toggle(name: "Cards" | "List") {
  fireEvent.click(screen.getByRole("radio", { name: new RegExp(name) }));
}

describe("Transactions: one DataView, one toolbar", () => {
  it("compact defaults to Cards: exactly one [data-view=cards] mounted, no table", () => {
    size.current = "compact";
    render(<TransactionsWorkspace />);
    expect(mountedViews()).toEqual(["cards"]);
    expect(screen.queryByTitle("Select all")).toBeNull();
  });

  it("regular and wide default to List: exactly one [data-view=list] mounted", () => {
    for (const s of ["regular", "wide"] as const) {
      cleanup();
      size.current = s;
      render(<TransactionsWorkspace />);
      expect(mountedViews()).toEqual(["list"]);
      expect(screen.getByTitle("Select all")).toBeTruthy();
      cleanup();
    }
  });

  it("the page has one Cards/List control and the toggle switches the mounted view both ways", async () => {
    size.current = "compact";
    render(<TransactionsWorkspace />);
    expect(screen.getAllByRole("radiogroup", { name: "View" })).toHaveLength(1);
    expect(screen.getAllByRole("radio")).toHaveLength(2);

    toggle("List");
    await waitFor(() => expect(mountedViews()).toEqual(["list"]));
    expect(screen.getByRole("radio", { name: /List/ }).getAttribute("aria-checked")).toBe("true");

    toggle("Cards");
    await waitFor(() => expect(mountedViews()).toEqual(["cards"]));
  });

  it("the choice persists per user and per size class: a List choice on compact does not change wide", async () => {
    size.current = "compact";
    render(<TransactionsWorkspace />);
    toggle("List");
    await waitFor(() => expect(storedPrefs()).toEqual({ "transactions:compact": "list" }));
    cleanup();

    size.current = "wide";
    render(<TransactionsWorkspace />);
    expect(mountedViews()).toEqual(["list"]);
    toggle("Cards");
    await waitFor(() => expect(storedPrefs()["transactions:wide"]).toBe("cards"));
    expect(storedPrefs()["transactions:compact"]).toBe("list");
    cleanup();

    size.current = "compact";
    render(<TransactionsWorkspace />);
    expect(mountedViews()).toEqual(["list"]);
  });
});

describe("Transactions: bulk selection and paging per view", () => {
  it("bulk select (row checkboxes) exists only in List; leaving List clears the selection", async () => {
    size.current = "regular";
    render(<TransactionsWorkspace />);
    const rowBoxes = screen.getAllByRole("checkbox").filter((el) => el.getAttribute("title") !== "Select all");
    expect(rowBoxes.length).toBe(3);
    fireEvent.click(rowBoxes[0]);
    expect(screen.getByText("1 selected")).toBeTruthy();

    toggle("Cards");
    await waitFor(() => expect(mountedViews()).toEqual(["cards"]));
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
    expect(screen.queryByText("1 selected")).toBeNull();

    toggle("List");
    await waitFor(() => expect(mountedViews()).toEqual(["list"]));
    expect(screen.queryByText("1 selected")).toBeNull();
  });

  it("Cards has no bulk selection controls at all", () => {
    size.current = "compact";
    render(<TransactionsWorkspace />);
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
  });

  it("load-more: the one sentinel loads the next page in Cards and in List", async () => {
    const loadNextPage = vi.fn();
    Object.assign(H.RES, { hasMore: true, loadNextPage });
    size.current = "compact";
    const { unmount } = render(<TransactionsWorkspace />);
    H.IO.cbs[H.IO.cbs.length - 1]([{ isIntersecting: true }]);
    expect(loadNextPage).toHaveBeenCalledTimes(1);
    unmount();
    cleanup();

    size.current = "regular";
    render(<TransactionsWorkspace />);
    expect(mountedViews()).toEqual(["list"]);
    H.IO.cbs[H.IO.cbs.length - 1]([{ isIntersecting: true }]);
    expect(loadNextPage).toHaveBeenCalledTimes(2);
  });

  it("the load-more sentinel sits outside the DataView, so paging does not depend on the view", () => {
    for (const s of ["compact", "regular"] as const) {
      cleanup();
      size.current = s;
      render(<TransactionsWorkspace />);
      const sentinel = screen.getByTestId("infinite-scroll-trigger");
      expect(sentinel.closest("[data-view]")).toBeNull();
      expect(mountedViews()).toHaveLength(1);
    }
  });
});

describe("Transactions: edit navigation in both views", () => {
  it("tapping a Cards row opens the edit page with returnTo", () => {
    size.current = "compact";
    render(<TransactionsWorkspace />);
    fireEvent.click(screen.getAllByRole("button", { name: /^Edit / })[0]);
    expect(H.push).toHaveBeenCalledWith(expect.stringMatching(/^\/transactions\/\d+\/edit\?returnTo=/));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("the List row Edit control opens the same edit page", () => {
    size.current = "regular";
    render(<TransactionsWorkspace />);
    fireEvent.click(screen.getAllByTitle("Edit")[0]);
    expect(H.push).toHaveBeenCalledWith(expect.stringMatching(/^\/transactions\/\d+\/edit\?returnTo=/));
  });
});

describe("Transactions: no size-class wrappers, no viewport tokens in the views", () => {
  const TOKEN = /(?<![\w-])(max-)?(sm|md|lg|xl|2xl):/;

  it("the workspace has no CompactOnly/FromMd wrappers and one DataView and one toggle", () => {
    const src = read(WORKSPACE);
    expect(src.match(/<(CompactOnly|FromMd)\b/g) ?? []).toEqual([]);
    expect(src.match(/<DataView\b/g)).toHaveLength(1);
    expect(src.match(/<ViewModeToggle\b/g)).toHaveLength(1);
    expect(src).toContain('viewKey="transactions"');
  });

  it("the List view, the table and the Cards list carry no breakpoint tokens", () => {
    for (const rel of [WORKSPACE, TABLE, CARDS]) {
      expect(read(rel).match(new RegExp(TOKEN.source, "g")) ?? [], rel).toEqual([]);
    }
  });

  it("the table keeps its own horizontal scroller (no page-level overflow)", () => {
    expect(read(TABLE)).toContain('containerClassName="overflow-x-auto"');
  });
});
