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
  const mk = (o: any) => mkTx({ isBusiness: 0, installmentGroupId: null, subscriptionId: null, updatedAt: "2026-01-02T00:00:00.000Z", ...o });
  const TXNS = [mk({ id: 1, payee: "Plain" }), mk({ id: 2, payee: "Linked", linkId: "L" })];
  return {
    push: vi.fn(), IDENT: (items: any) => items, NOF: [] as any[], SORT: { columnId: "date", direction: "desc" },
    LK: { accounts: [{ id: 1, name: "A", currency: "USD", type: "A", group: "g", archived: false }], categories: [{ id: 4, name: "C", type: "E", group: "g" }], holdings: [] as any[] },
    RES: { txns: TXNS, total: 3, loading: false, limit: 50, loadTxns: () => {}, loadNextPage: () => {}, resetPage: () => {}, page: 1, hasMore: false, isLoadingMore: false, loadMoreError: false, loadError: false },
    IO: { cbs: [] as Array<(e: any[]) => void> },
    SP: new URLSearchParams("range=custom&from=2000-01-01&to=2100-01-01"), ACT: ["USD"],
    PEND: null as any, ACTIVE: false, queueDel: null as any, discard: null as any,
  };
});
const push = H.push;
// Size class drives the default view: regular defaults to List (the table rows these tests use).
// Cards (phone rows) are covered in tests/pages/transactions-dataview.test.tsx.
const SIZE = vi.hoisted(() => ({ current: "regular" as "compact" | "regular" | "wide" }));
vi.mock("@/components/adaptive/size-class-context", async (orig) => ({
  ...(await orig<typeof import("@/components/adaptive/size-class-context")>()),
  useAppSizeClass: () => SIZE.current,
}));
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
// The stored view-mode choice resolves at once (no /api/auth/session round trip), as in the other page tests.
vi.mock("@/lib/client/user-storage", async (orig) => ({
  ...(await orig<typeof import("@/lib/client/user-storage")>()),
  useSessionUserId: () => ({ userId: "workspace-test-user", ready: true }),
}));
vi.mock("@/lib/data/local-write-queue", () => ({
  usePendingTransactions: () => H.PEND,
  isLocalWriteQueueActive: () => H.ACTIVE,
  queueOfflineDelete: (...a: unknown[]) => H.queueDel(...a),
  discardQueuedCreate: (...a: unknown[]) => H.discard(...a),
}));
import { EMPTY_PENDING } from "@/lib/transactions/pending-overlay";
import { TransactionsWorkspace } from "@/app/(app)/transactions/_components/transactions-workspace";

const entry = { status: "pending" as const, failReason: null };
const pend = (o: object) => ({ creates: [], edits: {}, deletes: {}, ...o });
const CREATE = { opId: "op1", ...entry, createdAt: 5, fields: { date: "2026-02-01", accountId: 1, categoryId: 4, enteredCurrency: "USD", enteredAmount: -9, payee: "Queued cafe" } };

beforeEach(() => {
  push.mockClear(); H.IO.cbs.length = 0; SIZE.current = "compact"; // phone: plain rows link to the edit page (wide opens the split pane)
  H.PEND = EMPTY_PENDING; H.ACTIVE = false;
  H.queueDel = vi.fn(async () => true); H.discard = vi.fn(async () => true);
  vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver);
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ data: [] }) })));
  (globalThis as any).ResizeObserver ??= class { observe(){} unobserve(){} disconnect(){} };
  (Element.prototype as any).scrollIntoView ??= () => {}; (Element.prototype as any).hasPointerCapture ??= () => false;
  (window as any).matchMedia ??= () => ({ matches: false, addListener(){}, removeListener(){}, addEventListener(){}, removeEventListener(){} });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
/** Taps list row `index` (queued rows are tap targets or inert; plain rows are links, see the flag-off test). */
function tapRow(index: number) {
  fireEvent.click(document.querySelectorAll<HTMLElement>('[data-slot="list-row"]')[index]);
}
class FakeIntersectionObserver {
  constructor(cb: (e: any[]) => void) { H.IO.cbs.push(cb); }
  observe() {} unobserve() {} disconnect() {} takeRecords() { return []; }
}

describe("flag off", () => {
  it("no badges, no notice; plain rows are edit-page links and the list never touches the queue", async () => {
    render(<TransactionsWorkspace />);
    expect(screen.queryByTestId("tx-waiting-sync")).toBeNull();
    expect(screen.queryByTestId("tx-sync-failed")).toBeNull();
    expect(screen.queryByTestId("tx-pending-deletes")).toBeNull();
    const links = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href*="/edit?returnTo="]'));
    expect(links.map((a) => a.getAttribute("href")!.split("?")[0])).toEqual(["/transactions/1/edit", "/transactions/2/edit"]);
    fireEvent.click(links[0]);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(H.queueDel).not.toHaveBeenCalled();
    expect(H.discard).not.toHaveBeenCalled();
  });
});

describe("queued rows in the list", () => {
  it("List view: queued create on top with Waiting to sync, edit overlay marked, pending delete hidden with a notice", () => {
    H.ACTIVE = true;
    H.PEND = pend({
      creates: [CREATE],
      edits: { 1: { opId: "e1", ...entry, fields: { payee: "Edited offline" } } },
      deletes: { 2: { opId: "d1", ...entry } },
    });
    render(<TransactionsWorkspace />);
    const rows = Array.from(document.querySelectorAll<HTMLElement>('[data-slot="list-row"]'));
    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getByText("Queued cafe")).toBeTruthy();
    expect(within(rows[0]).getByTestId("tx-waiting-sync").textContent).toBe("Waiting to sync");
    expect(within(rows[1]).getByText("Edited offline")).toBeTruthy();
    expect(within(rows[1]).getByTestId("tx-waiting-sync")).toBeTruthy();
    expect(screen.queryByText("Linked")).toBeNull();
    expect(screen.getByTestId("tx-pending-deletes").textContent).toContain("1 deleted transaction is hidden until it syncs.");
    // queued rows cannot be bulk-selected; there is no sheet (no Split / Delete): a queued create reopens the entry
    // screen, a queued edit has nothing newer to open (inert row: the badge says why).
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
    fireEvent.click(rows[1]);
    expect(push).not.toHaveBeenCalled();
    expect(rows[1].tagName).not.toBe("BUTTON");
    expect(rows[1].closest("a")).toBeNull();
    fireEvent.click(rows[0]);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByRole("button", { name: "Split" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Delete" })).toBeNull();
    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith("/transactions/new?queued=op1");
  });

  it("List view: a failed entry shows Sync failed linking to Settings > Data", () => {
    H.ACTIVE = true;
    H.PEND = pend({ edits: { 1: { opId: "e1", status: "failed", failReason: "Rejected", fields: { payee: "x" } } } });
    render(<TransactionsWorkspace />);
    const badge = screen.getByTestId("tx-sync-failed");
    expect(badge.textContent).toBe("Sync failed");
    expect(badge.closest("a")!.getAttribute("href")).toBe("/settings/data");
    expect(screen.getByText("Plain")).toBeTruthy(); // server value kept
  });

  it("Row view (compact and regular): the same rows and badges from the same list", () => {
    SIZE.current = "compact";
    H.ACTIVE = true;
    H.PEND = pend({
      creates: [CREATE],
      edits: { 1: { opId: "e1", ...entry, fields: { payee: "Edited offline" } } },
      deletes: { 2: { opId: "d1", ...entry } },
    });
    render(<TransactionsWorkspace />);
    expect(screen.getByText("Queued cafe")).toBeTruthy();
    expect(screen.getByText("Edited offline")).toBeTruthy();
    expect(screen.queryByText("Linked")).toBeNull();
    expect(screen.getAllByTestId("tx-waiting-sync")).toHaveLength(3); // create + edit + the delete notice
    // tapping a queued create reopens the entry screen from the outbox (where it can be edited or discarded)
    tapRow(0);
    expect(push).toHaveBeenCalledWith("/transactions/new?queued=op1");
  });

  it("a failed row: a tap opens Settings > Data (Retry / Discard live there)", () => {
    SIZE.current = "compact";
    H.ACTIVE = true;
    H.PEND = pend({ deletes: { 1: { opId: "d1", status: "failed", failReason: "Row changed on the server" } } });
    render(<TransactionsWorkspace />);
    expect(screen.getAllByTestId("tx-sync-failed")).toHaveLength(1);
    tapRow(0);
    expect(push).toHaveBeenCalledWith("/settings/data");
  });
});

// Offline delete (network failure queues it, the splits pre-check) and discarding a queued create moved with the row sheet:
// they run on the edit page now. See tests/app/transactions/edit/edit-page-row-flows.test.tsx (G2) and
// tests/app/transactions/new/offline-queue-edit.test.tsx (G3).
