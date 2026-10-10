/**
 * @vitest-environment jsdom
 *
 * Edit mode on a series row: read-only pill, hint, and the two-scope Delete dialog.
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

const INST = { installmentGroupId: "g-1", installmentSeq: 2, installmentCount: 6, subscriptionId: null };
const withTx = (extra: Record<string, unknown>) => ({ "/api/transactions": (init?: RequestInit) =>
  init?.method === "PUT" ? { id: 7 } : init?.method === "DELETE" ? {} : { data: [{ ...tx, ...extra }], total: 1 } });

async function openDelete() {
  fireEvent.click(screen.getByRole("button", { name: "More actions" }));
  fireEvent.click(await screen.findByRole("menuitem", { name: "Delete" }));
  return await screen.findByRole("dialog");
}

describe("series pill on an edited row (read-only)", () => {
  it("an installment row shows Installment 2/6 as plain text and the hint", async () => {
    stubFetch(withTx(INST));
    await mountReady();
    const b = screen.getByTestId("txnew-series-badge");
    expect(b.textContent).toBe("Installment 2/6");
    expect(b.tagName).toBe("SPAN");
    expect(screen.getByTestId("txnew-row-date").contains(b)).toBe(true);
    expect(screen.getByTestId("txnew-series-hint").textContent).toBe("Edits apply to this payment only");
    expect(screen.queryByTestId("txnew-repeat-pill")).toBeNull();
  });

  it("a row booked with a repeat shows Repeating, linking to /subscriptions", async () => {
    stubFetch(withTx({ installmentGroupId: null, installmentSeq: null, subscriptionId: 4 }));
    await mountReady();
    const link = screen.getByRole("link", { name: "Repeating" }); // the next/link mock keeps only href
    expect(screen.getByTestId("txnew-row-date").contains(link)).toBe(true);
    expect(link.getAttribute("href")).toBe("/subscriptions");
    expect(link.textContent).toBe("Repeating");
    expect(screen.queryByTestId("txnew-series-hint")).toBeNull();
  });

  it("a plain row has neither pill nor hint", async () => {
    stubFetch();
    await mountReady();
    expect(screen.queryByTestId("txnew-series-badge")).toBeNull();
    expect(screen.queryByTestId("txnew-repeat-pill")).toBeNull();
    expect(screen.queryByTestId("txnew-series-hint")).toBeNull();
  });

  it("saving an installment row is a normal single-row PUT", async () => {
    stubFetch(withTx(INST));
    await mountReady();
    fireEvent.click(screen.getByTestId("txnew-save"));
    await waitFor(() => expect(find("PUT", "/api/transactions")).toBeTruthy());
    const put = find("PUT", "/api/transactions")!;
    expect(put.body).not.toHaveProperty("repeat");
    expect(put.body).not.toHaveProperty("scope");
    expect(calls.some((c) => c.url.includes("/installments"))).toBe(false);
  });
});

describe("Delete on an installment row: two scopes", () => {
  it("offers This payment only / This and following / Cancel", async () => {
    stubFetch(withTx(INST));
    await mountReady();
    const dlg = await openDelete();
    expect(within(dlg).getByText("Delete this installment?")).toBeTruthy();
    expect(within(dlg).getByRole("button", { name: "This payment only" })).toBeTruthy();
    expect(within(dlg).getByRole("button", { name: "This and following" })).toBeTruthy();
    expect(within(dlg).getByRole("button", { name: "Cancel" })).toBeTruthy();
    expect(find("DELETE", "/api/transactions")).toBeUndefined();
  });

  it("This payment only -> DELETE ?id=7&scope=this, refresh, return", async () => {
    stubFetch(withTx(INST));
    await mountReady();
    const dlg = await openDelete();
    fireEvent.click(within(dlg).getByRole("button", { name: "This payment only" }));
    await waitFor(() => expect(H.push).toHaveBeenCalledWith("/transactions?page=2"));
    expect(calls.filter((c) => c.method === "DELETE").map((c) => c.url)).toEqual(["/api/transactions?id=7&scope=this"]);
    expect(revalidateTransactionLists).toHaveBeenCalled();
  });

  it("This and following -> DELETE ?id=7&scope=following", async () => {
    stubFetch(withTx(INST));
    await mountReady();
    const dlg = await openDelete();
    fireEvent.click(within(dlg).getByRole("button", { name: "This and following" }));
    await waitFor(() => expect(H.push).toHaveBeenCalledWith("/transactions?page=2"));
    expect(calls.filter((c) => c.method === "DELETE").map((c) => c.url)).toEqual(["/api/transactions?id=7&scope=following"]);
  });

  it("a server error stays in the dialog and does not navigate", async () => {
    stubFetch({ ...withTx(INST), "DELETE /api/transactions": { status: 400, body: { code: "not_installment", error: "Not an installment." } } });
    await mountReady();
    const dlg = await openDelete();
    fireEvent.click(within(dlg).getByRole("button", { name: "This and following" }));
    expect(await within(dlg).findByText("Not an installment.")).toBeTruthy();
    expect(H.push).not.toHaveBeenCalled();
  });

  it("a non-series row keeps the single confirm and the old URL (no scope)", async () => {
    stubFetch();
    await mountReady();
    const dlg = await openDelete();
    expect(within(dlg).queryByRole("button", { name: "This payment only" })).toBeNull();
    fireEvent.click(within(dlg).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(H.push).toHaveBeenCalled());
    expect(calls.filter((c) => c.method === "DELETE").map((c) => c.url)).toEqual(["/api/transactions?id=7"]);
  });
});
