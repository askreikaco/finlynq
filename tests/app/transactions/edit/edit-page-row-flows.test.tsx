/**
 * @vitest-environment jsdom
 *
 * The flows the list's row sheet used to carry, now on the edit page (phones open /transactions/[id]/edit):
 *   G1 lot-locked delete with preview and "Reallocate & delete"   (entry screen AND the full edit form)
 *   G2 offline queued delete with the splits pre-check
 *   G4 read-only Details (Kind, Investment, Quantity, Splits) and the Split entry point in the overflow
 * (G3, discarding a queued create, is in tests/app/transactions/new/offline-queue-edit.test.tsx.)
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import * as React from "react";
import { render, screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";

const Q = vi.hoisted(() => ({ active: false, queueDelete: vi.fn(async (_id: number, _row: unknown) => true) }));
vi.mock("@/lib/data/local-write-queue", () => ({
  isLocalWriteQueueActive: () => Q.active,
  queueOfflineDelete: (id: number, row: unknown) => Q.queueDelete(id, row),
  queueOfflineEdit: vi.fn(async () => true),
  queueOfflineCreate: vi.fn(async () => true),
}));

const H = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), mutate: vi.fn(async () => undefined), search: "", id: "7" }));
const ROUTER = { push: H.push, replace: H.replace, back: vi.fn() };
vi.mock("next/navigation", () => ({
  useRouter: () => ROUTER,
  usePathname: () => "/transactions/7/edit",
  useSearchParams: () => new URLSearchParams(H.search),
  useParams: () => ({ id: H.id }),
}));
vi.mock("next/link", () => ({ default: ({ children, href }: any) => React.createElement("a", { href }, children) }));
vi.mock("swr", () => ({ mutate: H.mutate, useSWRConfig: () => ({ mutate: vi.fn(), cache: new Map() }) }));
vi.mock("@/lib/transactions/revalidate", () => ({ revalidateTransactionLists: vi.fn(async () => undefined) }));
vi.mock("@/components/currency-provider", () => ({ useDisplayCurrency: () => ({ displayCurrency: "USD" }) }));
vi.mock("@/components/dropdown-order-provider", () => ({ useDropdownOrder: () => <T,>(items: T[]) => items }));
vi.mock("@/lib/hooks/useActiveCurrencies", () => ({ useActiveCurrencies: () => ["USD", "EUR"] }));

const ACCOUNTS = [
  { id: 1, name: "Checking", currency: "USD", archived: false },
  { id: 2, name: "Savings", currency: "USD", archived: false },
  { id: 3, name: "Broker", currency: "USD", archived: false, isInvestment: true },
];
const CATS = [
  { id: 1, name: "Food", type: "E", group: "g" },
  { id: 2, name: "Salary", type: "I", group: "g" },
];
vi.mock("@/lib/data/use-api", () => ({
  useApi: (url: string) => {
    if (url === "/api/accounts") return { isLoading: false, data: ACCOUNTS };
    if (url === "/api/categories") return { isLoading: false, data: CATS };
    return { isLoading: false, data: { suggestions: [] } };
  },
}));

import EditTransactionRoute from "@/app/(app)/transactions/[id]/edit/page";
import { TransactionFormScreen } from "@/app/(app)/transactions/_components/transaction-form-screen";

const tx: any = {
  id: 7, date: "2026-01-01", accountId: 1, accountName: "Checking", categoryId: 1, categoryName: "Food", categoryType: "E",
  currency: "USD", amount: -5, enteredAmount: -5, enteredCurrency: "USD", quantity: null, portfolioHolding: null,
  note: "n", payee: "p", tags: "t1", isBusiness: 0, linkId: null, kind: null, installmentGroupId: null, subscriptionId: null,
  createdAt: "2026-01-01T10:00:00Z", updatedAt: "2026-01-02T11:00:00Z", source: "mcp_http",
};
/** A row the entry screen cannot represent (investment account): it opens the full edit form. */
const fallbackTx = { ...tx, accountId: 3 };

type Reply = { status?: number; body?: unknown } | "network";
let calls: Array<{ url: string; method: string; body: any }> = [];
function stubFetch(over: Record<string, Reply | (() => Reply | unknown)> = {}, row: any = tx, splits: unknown[] = []) {
  const routes: Record<string, Reply | (() => Reply | unknown)> = {
    "GET /api/transactions": { body: { data: [row], total: 1 } },
    "GET /api/transactions/splits": { body: splits },
    "GET /api/transactions/linked": { body: { data: [] } },
    "GET /api/accounts": { body: ACCOUNTS },
    "GET /api/categories": { body: CATS },
    "GET /api/portfolio": { body: [] },
    "DELETE /api/transactions": { body: {} },
    ...over,
  };
  calls = [];
  const fn = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    calls.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    const raw = routes[`${method} ${url.split("?")[0]}`] ?? { body: {} };
    const r = (typeof raw === "function" ? raw() : raw) as Reply;
    if (r === "network") throw new TypeError("Failed to fetch");
    const status = r.status ?? 200;
    return { ok: status >= 200 && status < 300, status, json: async () => r.body, clone() { return this; } };
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}
const deletes = () => calls.filter((c) => c.method === "DELETE").map((c) => c.url);

const BLOCKED: Reply = {
  status: 409,
  body: { code: "portfolio_edit_blocked", error: "Lot is in use.", blockingClosureTxIds: [11, 12] },
};
const PREVIEW = {
  body: {
    preview: {
      affectedHoldingIds: [1], dependentCloseTxIds: [11, 12], proposedClosures: [], openedShortLots: [],
      realizedGainDeltaByYear: { "2025": 40 },
    },
  },
};

beforeEach(() => {
  H.push.mockClear(); H.replace.mockClear(); H.mutate.mockClear(); Q.queueDelete.mockClear();
  Q.active = false;
  H.search = "returnTo=%2Ftransactions%3Fpage%3D2"; H.id = "7";
  sessionStorage.clear(); localStorage.clear();
  (globalThis as any).ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
  (Element.prototype as any).scrollIntoView ??= () => {};
  (Element.prototype as any).hasPointerCapture ??= () => false;
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

async function openMore(root: "txnew-root" | "tx-edit-root") {
  render(<EditTransactionRoute />);
  await screen.findByTestId(root);
  fireEvent.click(screen.getByRole("button", { name: "More actions" }));
}
async function openDeleteDialog(root: "txnew-root" | "tx-edit-root") {
  await openMore(root);
  fireEvent.click(await screen.findByRole("menuitem", { name: "Delete" }));
  return screen.findByRole("dialog");
}

describe.each([
  ["entry screen", "txnew-root" as const, tx],
  ["full edit form", "tx-edit-root" as const, fallbackTx],
])("G1 lot-locked delete on the %s", (_name, root, row) => {
  it("shows the refusal, the reallocation preview and the dependent rows instead of dead-ending", async () => {
    stubFetch({ "DELETE /api/transactions": BLOCKED, "POST /api/transactions/lot-replan-preview": PREVIEW }, row);
    const dlg = await openDeleteDialog(root);
    fireEvent.click(within(dlg).getByRole("button", { name: "Delete" }));
    expect(await within(dlg).findByText("Lot is in use.")).toBeTruthy();
    expect(within(dlg).getByRole("button", { name: "Reallocate & delete" })).toBeTruthy();
    expect(within(dlg).getByText(/opened a lot that has since been sold/)).toBeTruthy();
    const links = within(dlg).getAllByRole("link").map((a) => a.getAttribute("href"));
    expect(links).toHaveLength(2);
    expect(links[0]).toContain("11");
    await waitFor(() => expect(calls.find((c) => c.url === "/api/transactions/lot-replan-preview")?.body).toEqual({ op: "delete", id: 7 }));
    expect(H.push).not.toHaveBeenCalled();
    expect(deletes()).toEqual(["/api/transactions?id=7"]);
  });

  it("Reallocate & delete repeats the DELETE with confirmReallocation=1, refreshes and returns to the list", async () => {
    let attempt = 0;
    stubFetch({
      "DELETE /api/transactions": () => (attempt++ === 0 ? BLOCKED : { body: {} }),
      "POST /api/transactions/lot-replan-preview": PREVIEW,
    }, row);
    const dlg = await openDeleteDialog(root);
    fireEvent.click(within(dlg).getByRole("button", { name: "Delete" }));
    fireEvent.click(await within(dlg).findByRole("button", { name: "Reallocate & delete" }));
    await waitFor(() => expect(H.push).toHaveBeenCalledWith("/transactions?page=2"));
    expect(deletes()).toEqual(["/api/transactions?id=7", "/api/transactions?id=7&confirmReallocation=1"]);
    expect(H.mutate).toHaveBeenCalledWith("/api/accounts");
  });

  it("Cancel in the blocked state deletes nothing more and does not navigate", async () => {
    stubFetch({ "DELETE /api/transactions": BLOCKED, "POST /api/transactions/lot-replan-preview": PREVIEW }, row);
    const dlg = await openDeleteDialog(root);
    fireEvent.click(within(dlg).getByRole("button", { name: "Delete" }));
    await within(dlg).findByRole("button", { name: "Reallocate & delete" });
    fireEvent.click(within(dlg).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(deletes()).toEqual(["/api/transactions?id=7"]);
    expect(H.push).not.toHaveBeenCalled();
  });

  it("a plain server failure still shows the server message (no reallocation offered)", async () => {
    stubFetch({ "DELETE /api/transactions": { status: 500, body: { error: "boom" } } }, row);
    const dlg = await openDeleteDialog(root);
    fireEvent.click(within(dlg).getByRole("button", { name: "Delete" }));
    expect((await within(dlg).findByRole("alert")).textContent).toContain("boom");
    expect(within(dlg).queryByRole("button", { name: "Reallocate & delete" })).toBeNull();
    expect(H.push).not.toHaveBeenCalled();
  });
});

describe("G2 offline queued delete on the entry screen", () => {
  const confirmDelete = async (root: "txnew-root" | "tx-edit-root" = "txnew-root") => {
    const dlg = await openDeleteDialog(root);
    await new Promise((r) => setTimeout(r, 0)); // the splits pre-check settles
    fireEvent.click(within(dlg).getByRole("button", { name: "Delete" }));
    return dlg;
  };

  it("a network failure on a simple row queues the delete with the row's updatedAt, then returns to the list", async () => {
    Q.active = true;
    stubFetch({ "DELETE /api/transactions": "network" });
    await confirmDelete();
    await waitFor(() => expect(Q.queueDelete).toHaveBeenCalledTimes(1));
    expect(Q.queueDelete.mock.calls[0][0]).toBe(7);
    expect(Q.queueDelete.mock.calls[0][1]).toMatchObject({ payee: "p", updatedAt: "2026-01-02T11:00:00Z" });
    await waitFor(() => expect(H.push).toHaveBeenCalledWith("/transactions?page=2"));
  });

  it("the splits pre-check runs only while the queue is active", async () => {
    stubFetch();
    const dlg = await openDeleteDialog("txnew-root");
    const idle = calls.filter((c) => c.url.includes("splits?transactionId=7")).length;
    fireEvent.click(within(dlg).getByRole("button", { name: "Cancel" }));
    cleanup();
    Q.active = true;
    const dlg2 = await openDeleteDialog("txnew-root");
    expect(dlg2).toBeTruthy();
    const active = calls.filter((c) => c.url.includes("splits?transactionId=7")).length;
    expect(active).toBeGreaterThan(idle);
  });

  it("a row with splits is not queued: the error shows and the page stays", async () => {
    Q.active = true;
    // One stored split keeps the row on the full edit form; it shares the same delete flow.
    stubFetch({ "DELETE /api/transactions": "network" }, tx, [{ categoryId: 1, amount: -5, note: null }]);
    const dlg = await confirmDelete("tx-edit-root");
    expect((await within(dlg).findByRole("alert")).textContent).toContain("Failed to fetch");
    expect(Q.queueDelete).not.toHaveBeenCalled();
    expect(H.push).not.toHaveBeenCalled();
  });

  it("flag off: a network failure keeps today's error and never touches the queue", async () => {
    stubFetch({ "DELETE /api/transactions": "network" });
    const dlg = await confirmDelete();
    expect((await within(dlg).findByRole("alert")).textContent).toContain("Failed to fetch");
    expect(Q.queueDelete).not.toHaveBeenCalled();
    expect(H.push).not.toHaveBeenCalled();
  });

  it("a server answer (500) with the queue on is not queued", async () => {
    Q.active = true;
    stubFetch({ "DELETE /api/transactions": { status: 500, body: { error: "boom" } } });
    const dlg = await confirmDelete();
    expect((await within(dlg).findByRole("alert")).textContent).toContain("boom");
    expect(Q.queueDelete).not.toHaveBeenCalled();
  });
});

describe("G4 Split entry point and read-only Details", () => {
  it("the overflow of the entry screen has Split, which opens /transactions/7/split with the list as returnTo", async () => {
    stubFetch();
    await openMore("txnew-root");
    fireEvent.click(await screen.findByRole("menuitem", { name: "Split" }));
    expect(H.push).toHaveBeenCalledWith("/transactions/7/split?returnTo=%2Ftransactions%3Fpage%3D2");
  });

  it("the overflow of the full edit form has Split too", async () => {
    stubFetch({}, fallbackTx);
    await openMore("tx-edit-root");
    fireEvent.click(await screen.findByRole("menuitem", { name: "Split" }));
    expect(H.push).toHaveBeenCalledWith("/transactions/7/split?returnTo=%2Ftransactions%3Fpage%3D2");
  });

  it("the split-view pane (embedded) has no Split item: it edits splits inline", async () => {
    stubFetch();
    render(<TransactionFormScreen mode="edit" id="7" embedded={{ onSaved: vi.fn() }} />);
    await screen.findByTestId("txnew-root");
    fireEvent.click(screen.getByRole("button", { name: "More actions" }));
    await screen.findByRole("menuitem", { name: "Delete" });
    expect(screen.queryByRole("menuitem", { name: "Split" })).toBeNull();
  });

  it("Duplicate stays in the overflow but is disabled for a row that cannot be duplicated (FX entry)", async () => {
    stubFetch({}, { ...tx, enteredCurrency: "EUR", enteredAmount: -4 });
    render(<EditTransactionRoute />);
    await screen.findByTestId("txnew-root");
    fireEvent.click(screen.getByRole("button", { name: "More actions" }));
    const dup = await screen.findByRole("menuitem", { name: "Duplicate" });
    expect(dup.hasAttribute("data-disabled") || dup.getAttribute("aria-disabled") === "true").toBe(true);
  });

  it("a plain row shows no Details block (Source, Created and Updated stay in the meta line)", async () => {
    stubFetch();
    render(<EditTransactionRoute />);
    await screen.findByTestId("txnew-root");
    expect(screen.queryByTestId("tx-edit-details")).toBeNull();
    expect(screen.getByTestId("txnew-edit-meta").textContent).toMatch(/Created/);
  });

  it("an investment row shows Investment, Quantity and Kind read-only in Details, with the (i) tip", async () => {
    stubFetch({}, { ...fallbackTx, portfolioHolding: "VFV", quantity: 3, kind: "dividend" });
    render(<EditTransactionRoute />);
    await screen.findByTestId("tx-edit-root");
    const details = await screen.findByTestId("tx-edit-details");
    expect(within(details).getByText("Investment").nextSibling?.textContent).toBe("VFV");
    expect(within(details).getByText("Quantity").nextSibling?.textContent).toBe("3");
    expect(within(details).getByText("Kind").nextSibling?.textContent).toBe("dividend");
    expect(within(details).getByRole("button", { name: "About details" })).toBeTruthy();
  });

  it("a row with stored splits shows the split count in Details", async () => {
    const two = [
      { categoryId: 1, amount: -3, note: null },
      { categoryId: 2, amount: -2, note: null },
    ];
    stubFetch({}, { ...fallbackTx, kind: null }, two);
    render(<EditTransactionRoute />);
    await screen.findByTestId("tx-edit-root");
    const details = await screen.findByTestId("tx-edit-details");
    expect(within(details).getByText("Splits").nextSibling?.textContent).toBe("2 splits");
  });
});
