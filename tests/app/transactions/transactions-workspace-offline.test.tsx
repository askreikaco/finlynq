/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import * as React from "react";
import { render, screen, cleanup, fireEvent, within, waitFor } from "@testing-library/react";
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
    SP: new URLSearchParams(""), ACT: ["USD"],
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
  push.mockClear(); H.IO.cbs.length = 0; SIZE.current = "regular";
  H.PEND = EMPTY_PENDING; H.ACTIVE = false;
  H.queueDel = vi.fn(async () => true); H.discard = vi.fn(async () => true);
  vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver);
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ data: [] }) })));
  (globalThis as any).ResizeObserver ??= class { observe(){} unobserve(){} disconnect(){} };
  (Element.prototype as any).scrollIntoView ??= () => {}; (Element.prototype as any).hasPointerCapture ??= () => false;
  (window as any).matchMedia ??= () => ({ matches: false, addListener(){}, removeListener(){}, addEventListener(){}, removeEventListener(){} });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
/** Taps a list row (opens its detail sheet), then the sheet action. The list has no table or per-row buttons. */
function openRowAction(index: number, action: string) {
  fireEvent.click(document.querySelectorAll<HTMLElement>('[data-slot="list-row"]')[index]);
  fireEvent.click(screen.getByRole("button", { name: action }));
}
class FakeIntersectionObserver {
  constructor(cb: (e: any[]) => void) { H.IO.cbs.push(cb); }
  observe() {} unobserve() {} disconnect() {} takeRecords() { return []; }
}

describe("flag off", () => {
  it("no badges, no notice; a refused delete behaves as before and never touches the queue", async () => {
    vi.stubGlobal("fetch", vi.fn(async (_u: string, init?: any) => init?.method === "DELETE"
      ? ({ ok: false, status: 500, json: async () => ({ error: "boom" }) }) : ({ ok: true, json: async () => ({ data: [] }) })));
    render(<TransactionsWorkspace />);
    expect(screen.queryByTestId("tx-waiting-sync")).toBeNull();
    expect(screen.queryByTestId("tx-sync-failed")).toBeNull();
    expect(screen.queryByTestId("tx-pending-deletes")).toBeNull();
    openRowAction(0, "Delete");
    const dlg = await screen.findByRole("dialog");
    fireEvent.click(within(dlg).getByRole("button", { name: "Delete" }));
    expect((await within(dlg).findByRole("alert")).textContent).toContain("boom");
    expect(H.queueDel).not.toHaveBeenCalled();
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
    // queued rows cannot be bulk-selected or split: the sheet has Edit and Delete only
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
    fireEvent.click(rows[0]);
    expect(screen.queryByRole("button", { name: "Split" })).toBeNull();
    expect(screen.getByRole("button", { name: "Delete" })).toBeTruthy();
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
    // tapping a queued create reopens the entry screen from the outbox; a failed one goes to Settings > Data
    openRowAction(0, "Edit");
    expect(push).toHaveBeenCalledWith("/transactions/new?queued=op1");
  });

  it("a failed row: its sheet's Edit opens Settings > Data", () => {
    SIZE.current = "compact";
    H.ACTIVE = true;
    H.PEND = pend({ deletes: { 1: { opId: "d1", status: "failed", failReason: "Row changed on the server" } } });
    render(<TransactionsWorkspace />);
    expect(screen.getAllByTestId("tx-sync-failed")).toHaveLength(1);
    openRowAction(0, "Edit");
    expect(push).toHaveBeenCalledWith("/settings/data");
  });
});

describe("offline delete", () => {
  const networkDown = (splits: unknown = []) => vi.fn(async (url: string, init?: any) => {
    if (init?.method === "DELETE") throw new TypeError("Failed to fetch");
    if (String(url).includes("/splits")) return { ok: true, json: async () => splits };
    return { ok: true, json: async () => ({ data: [] }) };
  });
  const confirm = async () => {
    const dlg = await screen.findByRole("dialog");
    fireEvent.click(within(dlg).getByRole("button", { name: "Delete" }));
    return dlg;
  };

  it("a network failure on a simple row queues the delete (with the row's updatedAt) and closes the dialog", async () => {
    H.ACTIVE = true;
    vi.stubGlobal("fetch", networkDown());
    render(<TransactionsWorkspace />);
    openRowAction(0, "Delete");
    await screen.findByRole("dialog");
    await new Promise((r) => setTimeout(r, 0)); // splits prefetch settles
    await confirm();
    await waitFor(() => expect(H.queueDel).toHaveBeenCalledTimes(1));
    expect(H.queueDel.mock.calls[0][0]).toBe(1);
    expect(H.queueDel.mock.calls[0][1]).toMatchObject({ payee: "Plain", updatedAt: "2026-01-02T00:00:00.000Z" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("the confirm dialog opens a splits check only while the queue is active", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => [] })));
    render(<TransactionsWorkspace />);
    openRowAction(0, "Delete");
    await screen.findByRole("dialog");
    const idle = (fetch as any).mock.calls.filter((c: any[]) => String(c[0]).includes("splits?transactionId=1")).length;
    cleanup();
    H.ACTIVE = true;
    (fetch as any).mockClear();
    render(<TransactionsWorkspace />);
    openRowAction(0, "Delete");
    await screen.findByRole("dialog");
    const active = (fetch as any).mock.calls.filter((c: any[]) => String(c[0]).includes("splits?transactionId=1")).length;
    expect(active).toBeGreaterThan(idle); // the extra request is the prefetch
  });

  it("deleting a queued create drops the outbox entry and sends nothing", async () => {
    H.ACTIVE = true;
    H.PEND = pend({ creates: [CREATE] });
    const f = vi.fn(async () => ({ ok: true, json: async () => ({ data: [] }) }));
    vi.stubGlobal("fetch", f);
    render(<TransactionsWorkspace />);
    openRowAction(0, "Delete");
    await confirm();
    await waitFor(() => expect(H.discard).toHaveBeenCalledWith("op1"));
    expect(f.mock.calls.some((c: any[]) => (c[1] as any)?.method === "DELETE")).toBe(false);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
});
