/**
 * @vitest-environment jsdom
 *
 * The /transactions split-view pane renders the SAME TransactionEntryScreen the pages render (data-form="transaction"),
 * embedded: no page chrome, no navigation; the callbacks run instead.
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
import NewTransactionRoute from "@/app/(app)/transactions/new/page";
import { TransactionFormScreen } from "@/app/(app)/transactions/_components/transaction-form-screen";
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
  H.push.mockClear(); H.replace.mockClear(); H.mutate.mockClear();
  H.search = ""; H.id = "7";
  sessionStorage.clear(); localStorage.clear();
  (globalThis as any).ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
  (Element.prototype as any).scrollIntoView ??= () => {};
  (Element.prototype as any).hasPointerCapture ??= () => false;
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const CB = () => ({ onSaved: vi.fn(), onCancel: vi.fn(), onDeleted: vi.fn(), onDuplicate: vi.fn() });

describe("one form: the pages and the pane mount the same TransactionEntryScreen", () => {
  it("edit page and edit pane both render data-form=transaction", async () => {
    stubFetch();
    H.search = "returnTo=%2Ftransactions";
    const page = render(<EditTransactionRoute />);
    const pageRoot = await screen.findByTestId("txnew-root");
    expect(pageRoot.getAttribute("data-form")).toBe("transaction");
    expect(pageRoot.getAttribute("data-embedded")).toBeNull();
    page.unmount();
    render(<TransactionFormScreen mode="edit" id="7" embedded={CB()} />);
    const paneRoot = await screen.findByTestId("txnew-root");
    expect(paneRoot.getAttribute("data-form")).toBe("transaction");
    expect(paneRoot.getAttribute("data-embedded")).toBe("true");
  });

  it("new page and create pane both render data-form=transaction", async () => {
    stubFetch();
    const page = render(<NewTransactionRoute />);
    expect((await screen.findByTestId("txnew-root")).getAttribute("data-form")).toBe("transaction");
    page.unmount();
    render(<TransactionFormScreen mode="create" embedded={CB()} />);
    const root = await screen.findByTestId("txnew-root");
    expect(root.getAttribute("data-form")).toBe("transaction");
    expect(root.getAttribute("data-mode")).toBe("create");
  });
});

describe("embedded pane chrome", () => {
  it("has a compact title row (no page header, no back link), the same fields and the Save / Cancel footer", async () => {
    stubFetch();
    render(<TransactionFormScreen mode="edit" id="7" embedded={CB()} />);
    await screen.findByTestId("txnew-root");
    expect(screen.getByRole("heading", { name: "Edit expense" })).toBeTruthy();
    expect(document.querySelector('[data-slot="page-header"]')).toBeNull();
    expect(screen.queryByTestId("txnew-header-save")).toBeNull();
    expect(screen.getByTestId("txnew-root").className).not.toContain("max-w-md");
    expect((document.getElementById("txnew-payee") as HTMLInputElement).value).toBe("p");
    expect(screen.getByTestId("txnew-save")).toBeTruthy();
    expect(screen.getByTestId("txnew-cancel")).toBeTruthy();
  });

  it("Save PUTs the same body as the page, then calls onSaved and never navigates", async () => {
    stubFetch();
    const cb = CB();
    render(<TransactionFormScreen mode="edit" id="7" embedded={cb} />);
    await screen.findByTestId("txnew-root");
    fireEvent.change(document.getElementById("txnew-payee")!, { target: { value: "shop" } });
    fireEvent.click(screen.getByTestId("txnew-save"));
    await waitFor(() => expect(cb.onSaved).toHaveBeenCalledTimes(1));
    expect(find("PUT", "/api/transactions")!.body).toMatchObject({ id: 7, payee: "shop", enteredAmount: -5 });
    expect(H.push).not.toHaveBeenCalled();
  });

  it("Cancel calls onCancel and never navigates", async () => {
    stubFetch();
    const cb = CB();
    render(<TransactionFormScreen mode="edit" id="7" embedded={cb} />);
    await screen.findByTestId("txnew-root");
    fireEvent.click(screen.getByTestId("txnew-cancel"));
    expect(cb.onCancel).toHaveBeenCalledTimes(1);
    expect(cb.onSaved).not.toHaveBeenCalled();
    expect(H.push).not.toHaveBeenCalled();
  });

  it("Delete keeps the page's confirm dialog, sends the same DELETE, then calls onDeleted", async () => {
    stubFetch();
    const cb = CB();
    render(<TransactionFormScreen mode="edit" id="7" embedded={cb} />);
    await screen.findByTestId("txnew-root");
    fireEvent.click(screen.getByRole("button", { name: "More actions" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Delete" }));
    const dlg = await screen.findByRole("dialog");
    expect(within(dlg).getByText("Delete this transaction?")).toBeTruthy();
    fireEvent.click(within(dlg).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(cb.onDeleted).toHaveBeenCalledTimes(1));
    expect(calls.some((c) => c.method === "DELETE" && c.url === "/api/transactions?id=7")).toBe(true);
    expect(H.push).not.toHaveBeenCalled();
  });

  it("Duplicate writes the prefill and asks the host to open a create pane", async () => {
    stubFetch();
    const cb = CB();
    render(<TransactionFormScreen mode="edit" id="7" embedded={cb} />);
    await screen.findByTestId("txnew-root");
    fireEvent.click(screen.getByRole("button", { name: "More actions" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Duplicate" }));
    expect(cb.onDuplicate).toHaveBeenCalledTimes(1);
    expect(JSON.parse(sessionStorage.getItem("finlynq:tx-prefill")!)).toMatchObject({ payee: "p", amount: "5" });
    expect(H.push).not.toHaveBeenCalled();
  });

  it("a clean transfer pair opened from one leg switches the pane to the transfer editor, never navigating", async () => {
    const debit = { ...tx, id: 7, amount: -5, enteredAmount: -5, linkId: "L1", categoryId: null };
    const credit = { ...tx, id: 8, accountId: 2, accountName: "Savings", amount: 5, enteredAmount: 5, linkId: "L1", categoryId: null };
    stubFetch({
      "/api/transactions": () => ({ data: [debit], total: 1 }),
      "/api/transactions/linked": () => ({ data: [debit, credit].map((t) => ({ ...t })) }),
    });
    const base = globalThis.fetch;
    const reply = (data: unknown[]) => Promise.resolve({ ok: true, status: 200, json: async () => ({ data }), clone() { return this; } });
    vi.stubGlobal("fetch", (url: string, init?: RequestInit) =>
      String(url).startsWith("/api/transactions?id=8")
        ? reply([credit])
        : String(url).startsWith("/api/transactions/linked") && String(url).includes("excludeId")
          ? reply([credit])
          : base(url, init),
    );
    render(<TransactionFormScreen mode="edit" id="7" embedded={CB()} />);
    const root = await screen.findByTestId("txnew-root");
    expect(root.getAttribute("data-form")).toBe("transaction");
    expect(root.getAttribute("data-mode")).toBe("edit-transfer");
    expect(H.replace).not.toHaveBeenCalled();
    expect(H.push).not.toHaveBeenCalled();
  });
});

describe("embedded pane: dock and null names", () => {
  it("the numpad dock is constrained to the pane column at wide (not across the list)", () => {
    const src = require("node:fs").readFileSync("src/components/transactions/entry/transaction-entry-screen.tsx", "utf8");
    expect(src).toMatch(/className=\{embedded \? "wide:left-auto wide:right-8 wide:w-\[calc/);
  });
  it("account sort tolerates null names (locked session)", () => {
    const src = require("node:fs").readFileSync("src/components/transactions/entry/transaction-entry-screen.tsx", "utf8");
    expect(src).not.toContain("a.name.localeCompare(z.name)");
  });
});
