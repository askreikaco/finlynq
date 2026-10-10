/**
 * @vitest-environment jsdom
 *
 * /transactions/[id]/edit renders the SAME TransactionEntryScreen as New, in edit mode.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import * as React from "react";
import { render, screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";

const H = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  mutate: vi.fn(async () => undefined),
  search: "",
  id: "7",
}));

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
import { revalidateTransactionLists } from "@/lib/transactions/revalidate";

const tx: any = {
  id: 7, date: "2026-01-01", accountId: 1, accountName: "Checking", categoryId: 1, categoryName: "Food", categoryType: "E",
  currency: "USD", amount: -5, enteredAmount: -5, enteredCurrency: "USD", quantity: null, portfolioHolding: null,
  note: "n", payee: "p", tags: "t1", isBusiness: 1, linkId: null, kind: null,
  createdAt: "2026-01-01T10:00:00Z", updatedAt: "2026-01-02T11:00:00Z", source: "mcp_http",
};

type Handler = (init?: RequestInit) => unknown;
let calls: Array<{ url: string; method: string; body: any }> = [];
function stubFetch(over: Record<string, Handler | { status: number; body: unknown }> = {}) {
  const routes: Record<string, Handler | { status: number; body: unknown }> = {
    "/api/transactions/splits": () => [],
    "/api/transactions/linked": () => ({ data: [] }),
    "/api/transactions": (init) =>
      init?.method === "PUT" ? { id: 7 } : init?.method === "DELETE" ? {} : { data: [tx], total: 1 },
    "/api/accounts": () => ACCOUNTS,
    "/api/categories": () => CATS,
    "/api/portfolio": () => [],
    ...over,
  };
  calls = [];
  const fn = vi.fn(async (url: string, init?: RequestInit) => {
    const path = url.split("?")[0];
    const method = init?.method ?? "GET";
    calls.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    const h = routes[`${method} ${path}`] ?? routes[url] ?? routes[path];
    const out: any = typeof h === "function" ? h(init) : h ?? {};
    const failing = out && typeof out === "object" && "status" in out && "body" in out;
    const status: number = failing ? out.status : 200;
    const body = failing ? out.body : out;
    return { ok: status >= 200 && status < 300, status, json: async () => body, clone() { return this; } };
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}
const find = (method: string, path: string) => calls.find((c) => c.method === method && c.url.split("?")[0] === path);

beforeEach(() => {
  H.push.mockClear(); H.replace.mockClear(); H.mutate.mockClear(); (revalidateTransactionLists as any).mockClear();
  H.search = "returnTo=%2Ftransactions%3Fpage%3D2"; H.id = "7";
  sessionStorage.clear(); localStorage.clear();
  (globalThis as any).ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
  (Element.prototype as any).scrollIntoView ??= () => {};
  (Element.prototype as any).hasPointerCapture ??= () => false;
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

async function mountReady() {
  render(<EditTransactionRoute />);
  await screen.findByTestId("txnew-root");
}
const save = () => fireEvent.click(screen.getByRole("button", { name: "Save" }));

describe("edit page = entry screen: chrome", () => {
  it("shows the loading state, then the entry screen titled Edit expense with Back to returnTo, Save and Cancel", async () => {
    stubFetch();
    render(<EditTransactionRoute />);
    expect(screen.getByTestId("tx-edit-loading")).toBeTruthy();
    await screen.findByTestId("txnew-root");
    expect(screen.getByRole("heading", { name: "Edit expense" })).toBeTruthy();
    const back = screen.getAllByRole("link").find((a) => a.getAttribute("href")?.startsWith("/transactions"));
    expect(back?.getAttribute("href")).toBe("/transactions?page=2");
    expect(screen.getByTestId("txnew-save").textContent).toBe("Save");
    expect(screen.getByTestId("txnew-cancel").textContent).toBe("Cancel");
    expect(screen.queryByText(/continue/i)).toBeNull();
    expect(screen.queryByTestId("tx-edit-root")).toBeNull(); // not the old form
  });

  it("an income row is titled Edit income", async () => {
    stubFetch({ "/api/transactions": () => ({ data: [{ ...tx, categoryId: 2, amount: 9, enteredAmount: 9 }] }) });
    await mountReady();
    expect(screen.getByRole("heading", { name: "Edit income" })).toBeTruthy();
  });

  it("the type control keeps Transfer out of reach for a plain transaction", async () => {
    stubFetch();
    await mountReady();
    const transfer = screen.getByRole("radio", { name: "Transfer" }) as HTMLButtonElement;
    expect(transfer.disabled).toBe(true);
    fireEvent.click(transfer);
    expect(screen.getByRole("heading", { name: "Edit expense" })).toBeTruthy();
    expect((screen.getByRole("radio", { name: "Income" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("shows the muted Created / Updated line with the source badge under the fields", async () => {
    stubFetch();
    await mountReady();
    const meta = screen.getByTestId("txnew-edit-meta");
    expect(meta.textContent).toContain("Created");
    expect(meta.textContent).toContain("· Updated");
    expect(meta.textContent).toContain("MCP (web)");
    const list = screen.getByTestId("txnew-list");
    expect(list.compareDocumentPosition(meta) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("no meta line when the row has no audit data", async () => {
    stubFetch({ "/api/transactions": () => ({ data: [{ ...tx, createdAt: null, updatedAt: null, source: null }] }) });
    await mountReady();
    expect(screen.queryByTestId("txnew-edit-meta")).toBeNull();
  });

  it("does not offer the create-only rule suggestion", async () => {
    stubFetch();
    await mountReady();
    expect(screen.queryByText("Also create a rule for next time")).toBeNull();
  });
});

describe("edit page = entry screen: prefill", () => {
  it("seeds every field from the loaded row", async () => {
    stubFetch();
    await mountReady();
    expect((document.getElementById("txnew-date") as HTMLInputElement).value).toBe("2026-01-01");
    expect((screen.getByLabelText("Amount") as HTMLInputElement).value).toBe("5");
    expect(screen.getByRole("button", { name: "Currency" }).textContent).toContain("USD");
    expect(screen.getByTestId("txnew-row-category").textContent).toContain("Food");
    expect(screen.getByTestId("txnew-row-account").textContent).toContain("Checking");
    expect((document.getElementById("txnew-payee") as HTMLInputElement).value).toBe("p");
    expect((document.getElementById("txnew-note") as HTMLTextAreaElement).value).toBe("n");
    // Tags and Business make More details open.
    expect(screen.getByTestId("txnew-more").getAttribute("aria-expanded")).toBe("true");
    expect((document.getElementById("txnew-tags") as HTMLInputElement).value).toBe("t1");
    expect(screen.getByRole("switch", { name: /Business/ }).getAttribute("aria-checked")).toBe("true");
  });

  it("More details stays closed for a row with no tags / business / splits", async () => {
    stubFetch({ "/api/transactions": () => ({ data: [{ ...tx, tags: "", isBusiness: 0 }] }) });
    await mountReady();
    expect(screen.getByTestId("txnew-more").getAttribute("aria-expanded")).toBe("false");
  });

  it("ignores a stale Duplicate prefill in sessionStorage and the ?account= preset", async () => {
    sessionStorage.setItem("finlynq:tx-prefill", JSON.stringify({ v: 1, amount: "999", accountId: "2", categoryId: "2", payee: "X", note: "", tags: "", isBusiness: false, txType: "Income", ts: Date.now() }));
    stubFetch();
    await mountReady();
    expect((screen.getByLabelText("Amount") as HTMLInputElement).value).toBe("5");
    expect(screen.getByRole("heading", { name: "Edit expense" })).toBeTruthy();
  });

  it("seeds the stored splits (count and rows) and opens More details", async () => {
    stubFetch({
      "/api/transactions/splits": () => [{ categoryId: 1, amount: -2, note: "a" }, { categoryId: 1, amount: -3, note: null }],
    });
    await mountReady();
    expect(screen.getByTestId("txnew-more").getAttribute("aria-expanded")).toBe("true");
    expect((document.getElementById("txnew-split-count") as HTMLInputElement | null)?.value ?? "2").toBe("2");
    expect(screen.getByTestId("split-row-1")).toBeTruthy();
    expect(screen.getByTestId("split-row-2")).toBeTruthy();
  });
});

describe("edit page = entry screen: save", () => {
  it("PUTs the same body the old edit form sent, refreshes the lists and goes back to returnTo", async () => {
    stubFetch();
    await mountReady();
    fireEvent.change(document.getElementById("txnew-payee")!, { target: { value: "shop" } });
    save();
    await waitFor(() => expect(H.push).toHaveBeenCalledWith("/transactions?page=2"));
    expect(find("PUT", "/api/transactions")!.body).toEqual({
      id: 7, date: "2026-01-01", accountId: 1, categoryId: 1, enteredCurrency: "USD", enteredAmount: -5,
      payee: "shop", note: "n", tags: "t1", isBusiness: 1,
    });
    expect(find("POST", "/api/transactions")).toBeUndefined();
    expect(find("POST", "/api/transactions/splits")).toBeUndefined();
    expect(revalidateTransactionLists).toHaveBeenCalled();
    expect(H.mutate).toHaveBeenCalledWith("/api/accounts");
  });

  it("an emptied payee is sent as an empty string (clears it), not dropped", async () => {
    stubFetch();
    await mountReady();
    fireEvent.change(document.getElementById("txnew-payee")!, { target: { value: "" } });
    save();
    await waitFor(() => expect(find("PUT", "/api/transactions")).toBeTruthy());
    expect(find("PUT", "/api/transactions")!.body.payee).toBe("");
  });

  it("an income row saves a positive amount and the typed amount keeps its sign convention", async () => {
    stubFetch({ "/api/transactions": (init) => (init?.method === "PUT" ? { id: 7 } : { data: [{ ...tx, categoryId: 2, amount: 9, enteredAmount: 9 }] }) });
    await mountReady();
    fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "12" } });
    save();
    await waitFor(() => expect(find("PUT", "/api/transactions")).toBeTruthy());
    expect(find("PUT", "/api/transactions")!.body).toMatchObject({ categoryId: 2, enteredAmount: 12 });
  });

  it("with splits: PUT, then POST /api/transactions/splits with the parent's sign", async () => {
    stubFetch({
      "/api/transactions/splits": (init) =>
        init?.method === "POST" ? {} : [{ categoryId: 1, amount: -2, note: "a" }, { categoryId: 1, amount: -3, note: null }],
    });
    await mountReady();
    save();
    await waitFor(() => expect(H.push).toHaveBeenCalledWith("/transactions?page=2"));
    expect(find("PUT", "/api/transactions")!.body).toMatchObject({ id: 7, categoryId: 1, enteredAmount: -5 });
    expect(find("POST", "/api/transactions/splits")!.body).toEqual({
      transactionId: 7,
      splits: [{ categoryId: 1, amount: -2, note: "a" }, { categoryId: 1, amount: -3, note: "" }],
    });
  });

  it("a failed splits write keeps the page and says the transaction itself was saved", async () => {
    stubFetch({
      "/api/transactions/splits": (init) =>
        init?.method === "POST" ? { status: 500, body: { error: "boom" } } : [{ categoryId: 1, amount: -2, note: null }, { categoryId: 1, amount: -3, note: null }],
    });
    await mountReady();
    save();
    expect(await screen.findByText("Transaction saved, but the splits were not: boom")).toBeTruthy();
    expect(H.push).not.toHaveBeenCalled();
  });

  it("HTTP 423 shows the unlock message and stays on the page", async () => {
    stubFetch({ "PUT /api/transactions": { status: 423, body: {} } });
    await mountReady();
    save();
    expect(await screen.findByText("Unlock your data to make changes")).toBeTruthy();
    expect(H.push).not.toHaveBeenCalled();
  });

  it("fx-currency-needs-override names the currency", async () => {
    stubFetch({ "PUT /api/transactions": { status: 409, body: { code: "fx-currency-needs-override", currency: "EUR" } } });
    await mountReady();
    save();
    expect(await screen.findByText("No FX rate for EUR.")).toBeTruthy();
  });

  it("portfolio_edit_blocked offers Reallocate & save, which re-PUTs with confirmReallocation", async () => {
    let puts = 0;
    stubFetch({
      "PUT /api/transactions": () => (++puts === 1 ? { status: 409, body: { code: "portfolio_edit_blocked", error: "x" } } : { id: 7 }),
      "/api/transactions/lot-replan-preview": () => ({ preview: { affectedHoldingIds: [], dependentCloseTxIds: [9], proposedClosures: [], openedShortLots: [], realizedGainDeltaByYear: {} } }),
    });
    await mountReady();
    save();
    const confirm = await screen.findByRole("button", { name: "Reallocate & save" });
    expect(find("PUT", "/api/transactions")!.body.confirmReallocation).toBeUndefined();
    expect(find("POST", "/api/transactions/lot-replan-preview")!.body).toEqual({ op: "edit", id: 7 });
    fireEvent.click(confirm);
    await waitFor(() => expect(H.push).toHaveBeenCalledWith("/transactions?page=2"));
    const puts2 = calls.filter((c) => c.method === "PUT" && c.url === "/api/transactions");
    expect(puts2).toHaveLength(2);
    expect(puts2[1].body.confirmReallocation).toBe(true);
  });

  it("an empty amount is refused client-side and sends no request", async () => {
    stubFetch();
    await mountReady();
    fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "" } });
    save();
    expect(await screen.findByText("Please enter a valid amount greater than 0")).toBeTruthy();
    expect(find("PUT", "/api/transactions")).toBeUndefined();
  });

  it("Save locks after it books, so a second click cannot PUT twice", async () => {
    stubFetch();
    await mountReady();
    fireEvent.click(screen.getByTestId("txnew-save"));
    fireEvent.click(screen.getByTestId("txnew-save"));
    await waitFor(() => expect(H.push).toHaveBeenCalled());
    expect(calls.filter((c) => c.method === "PUT")).toHaveLength(1);
  });
});

describe("edit page = entry screen: navigation and header actions", () => {
  it("Cancel goes to returnTo", async () => {
    stubFetch();
    await mountReady();
    fireEvent.click(screen.getByTestId("txnew-cancel"));
    expect(H.push).toHaveBeenCalledWith("/transactions?page=2");
    expect(find("PUT", "/api/transactions")).toBeUndefined();
  });

  it.each([
    ["//evil.example/x"], ["https://evil.example"], ["javascript:alert(1)"],
  ])("a hostile returnTo %s falls back to /transactions for Back and Cancel", async (raw) => {
    H.search = `returnTo=${encodeURIComponent(raw)}`;
    stubFetch();
    await mountReady();
    const back = screen.getAllByRole("link").find((a) => a.getAttribute("href")?.startsWith("/transactions"));
    expect(back?.getAttribute("href")).toBe("/transactions");
    fireEvent.click(screen.getByTestId("txnew-cancel"));
    expect(H.push).toHaveBeenCalledWith("/transactions");
  });

  it("overflow offers Duplicate and Delete", async () => {
    stubFetch();
    await mountReady();
    fireEvent.click(screen.getByRole("button", { name: "More actions" }));
    expect(await screen.findByRole("menuitem", { name: "Duplicate" })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "Delete" })).toBeTruthy();
  });

  it("Duplicate writes the prefill from the loaded row and opens New with ?prefill=1", async () => {
    stubFetch();
    await mountReady();
    fireEvent.click(screen.getByRole("button", { name: "More actions" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Duplicate" }));
    expect(H.push).toHaveBeenCalledWith("/transactions/new?prefill=1");
    const written = JSON.parse(sessionStorage.getItem("finlynq:tx-prefill")!);
    expect(written).toMatchObject({
      v: 1, amount: "5", accountId: "1", categoryId: "1", payee: "p", note: "n", tags: "t1", isBusiness: true, txType: "Expense",
    });
  });

  it("Delete asks first, then sends DELETE /api/transactions?id=7, refreshes and returns", async () => {
    stubFetch();
    await mountReady();
    fireEvent.click(screen.getByRole("button", { name: "More actions" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Delete" }));
    const dlg = await screen.findByRole("dialog");
    expect(within(dlg).getByText("Delete this transaction?")).toBeTruthy();
    expect(find("DELETE", "/api/transactions")).toBeUndefined();
    fireEvent.click(within(dlg).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(H.push).toHaveBeenCalledWith("/transactions?page=2"));
    expect(calls.some((c) => c.method === "DELETE" && c.url === "/api/transactions?id=7")).toBe(true);
    expect(revalidateTransactionLists).toHaveBeenCalled();
    expect(H.mutate).toHaveBeenCalledWith("/api/accounts");
  });

  it("Cancel in the confirm dialog deletes nothing", async () => {
    stubFetch();
    await mountReady();
    fireEvent.click(screen.getByRole("button", { name: "More actions" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Delete" }));
    const dlg = await screen.findByRole("dialog");
    fireEvent.click(within(dlg).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(find("DELETE", "/api/transactions")).toBeUndefined();
    expect(H.push).not.toHaveBeenCalled();
  });

  it("a blocked delete shows the server message in the dialog and does not navigate", async () => {
    stubFetch({ "DELETE /api/transactions": { status: 409, body: { code: "portfolio_edit_blocked", error: "Lot is in use." } } });
    await mountReady();
    fireEvent.click(screen.getByRole("button", { name: "More actions" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Delete" }));
    const dlg = await screen.findByRole("dialog");
    fireEvent.click(within(dlg).getByRole("button", { name: "Delete" }));
    expect(await within(dlg).findByText("Lot is in use.")).toBeTruthy();
    expect(H.push).not.toHaveBeenCalled();
  });
});

describe("edit page: which UI a row opens in", () => {
  it("an investment-account row keeps the old edit form", async () => {
    stubFetch({ "/api/transactions": () => ({ data: [{ ...tx, accountId: 3, portfolioHolding: null }] }) });
    render(<EditTransactionRoute />);
    await screen.findByTestId("tx-edit-root");
    expect(screen.queryByTestId("txnew-root")).toBeNull();
  });

  it("a row with holdings fields keeps the old edit form", async () => {
    stubFetch({ "/api/transactions": () => ({ data: [{ ...tx, quantity: 3, portfolioHolding: "VFV" }] }) });
    render(<EditTransactionRoute />);
    await screen.findByTestId("tx-edit-root");
    expect(screen.queryByTestId("txnew-root")).toBeNull();
  });

  it("a row in a multi-leg group keeps the old edit form with its linked siblings", async () => {
    stubFetch({
      "/api/transactions": () => ({ data: [{ ...tx, linkId: "L-9" }] }),
      "/api/transactions/linked": () => ({ data: [
        { id: 8, accountId: 1, amount: 5, date: "2026-01-01", currency: "USD", accountName: "Checking" },
        { id: 9, accountId: 2, amount: 5, date: "2026-01-01", currency: "USD", accountName: "Savings" },
      ] }),
    });
    render(<EditTransactionRoute />);
    await screen.findByTestId("tx-edit-root");
    expect(screen.queryByTestId("txnew-root")).toBeNull();
  });

  it("a refund on an expense category keeps the old edit form", async () => {
    stubFetch({ "/api/transactions": () => ({ data: [{ ...tx, amount: 5, enteredAmount: 5 }] }) });
    render(<EditTransactionRoute />);
    await screen.findByTestId("tx-edit-root");
  });

  it("stored splits that cannot load keep the old edit form", async () => {
    stubFetch({ "/api/transactions/splits": { status: 500, body: {} } });
    render(<EditTransactionRoute />);
    await screen.findByTestId("tx-edit-root");
  });

  it("a clean transfer leg still redirects to the transfer edit page, a portfolio row to its op page", async () => {
    stubFetch({
      "/api/transactions/linked": () => ({ data: [{ id: 9, accountId: 2, amount: 5 }] }),
      "/api/transactions": () => ({ data: [{ ...tx, linkId: "L-1" }] }),
    });
    render(<EditTransactionRoute />);
    await waitFor(() => expect(H.replace).toHaveBeenCalled());
    expect(H.replace.mock.calls[0][0]).toMatch(/^\/transactions\/transfer\/L-1\/edit/);
    expect(screen.queryByTestId("txnew-root")).toBeNull();
  });

  it("a missing row shows the not-found message", async () => {
    stubFetch({ "/api/transactions": () => ({ data: [] }) });
    render(<EditTransactionRoute />);
    expect(await screen.findByText("This transaction no longer exists.")).toBeTruthy();
  });
});
