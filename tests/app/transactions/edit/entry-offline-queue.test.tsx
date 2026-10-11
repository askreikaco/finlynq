/**
 * @vitest-environment jsdom
 *
 * Offline write queue wiring in the entry screen (local-first L3). Flag off = today's behaviour, no queue call.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import * as React from "react";
import { render, screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";

const Q = vi.hoisted(() => ({ active: false, queueEdit: vi.fn(async () => true), queueCreate: vi.fn(async () => true) }));
vi.mock("@/lib/data/local-write-queue", () => ({
  isLocalWriteQueueActive: () => Q.active,
  queueOfflineEdit: Q.queueEdit,
  queueOfflineCreate: Q.queueCreate,
}));

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
  note: "n", payee: "p", tags: "t1", isBusiness: 0, linkId: null, kind: null,
  createdAt: "2026-01-01T10:00:00Z", updatedAt: "2026-01-02T11:00:00Z", source: "mcp_http",
};


function stubOfflineFetch() {
  const fn = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    const path = url.split("?")[0];
    if ((method === "PUT" || method === "POST") && path === "/api/transactions") throw new TypeError("Failed to fetch");
    const routes: Record<string, unknown> = {
      "/api/transactions": { data: [tx], total: 1 },
      "/api/transactions/splits": [], "/api/transactions/linked": { data: [] },
      "/api/accounts": ACCOUNTS, "/api/categories": CATS, "/api/portfolio": [],
    };
    return { ok: true, status: 200, json: async () => routes[path] ?? {}, clone() { return this; } };
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

beforeEach(() => {
  H.push.mockClear(); H.replace.mockClear(); H.mutate.mockClear();
  Q.active = false; Q.queueEdit.mockClear(); Q.queueCreate.mockClear();
  H.search = "returnTo=%2Ftransactions%3Fpage%3D2"; H.id = "7";
  sessionStorage.clear(); localStorage.clear();
  (globalThis as any).ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
  (Element.prototype as any).scrollIntoView ??= () => {};
  (Element.prototype as any).hasPointerCapture ??= () => false;
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); });

async function mountReady() {
  render(<EditTransactionRoute />);
  await screen.findByTestId("txnew-root");
}
const save = () => fireEvent.click(screen.getByRole("button", { name: "Save" }));

describe("entry screen + offline queue", () => {
  it("flag off: a network failure keeps today's error, never calls the queue, does not navigate", async () => {
    stubOfflineFetch();
    await mountReady();
    fireEvent.change(document.getElementById("txnew-payee")!, { target: { value: "shop" } });
    save();
    await screen.findByText("Failed to fetch");
    expect(Q.queueEdit).not.toHaveBeenCalled();
    expect(Q.queueCreate).not.toHaveBeenCalled();
    expect(H.push).not.toHaveBeenCalled();
  });

  it("flag on + network failure: edit is queued with only the changed fields, calm notice, navigates back", async () => {
    Q.active = true;
    stubOfflineFetch();
    await mountReady();
    fireEvent.change(document.getElementById("txnew-payee")!, { target: { value: "shop" } });
    save();
    await screen.findByText("Saved on this device — will sync when online");
    expect(Q.queueEdit).toHaveBeenCalledTimes(1);
    const [id, patch, current] = Q.queueEdit.mock.calls[0] as unknown as [number, Record<string, unknown>, Record<string, unknown>];
    expect(id).toBe(7);
    expect(patch).toEqual({ payee: "shop" });
    expect(current.payee).toBe("p");
    await waitFor(() => expect(H.push).toHaveBeenCalledWith("/transactions?page=2"), { timeout: 3000 });
  });

  it("flag on but the queue refuses (returns false): today's error path", async () => {
    Q.active = true; Q.queueEdit.mockResolvedValueOnce(false);
    stubOfflineFetch();
    await mountReady();
    fireEvent.change(document.getElementById("txnew-payee")!, { target: { value: "shop" } });
    save();
    await screen.findByText("Failed to fetch");
    expect(H.push).not.toHaveBeenCalled();
  });

  it("flag on, server answers 500 (not a network failure): not queued", async () => {
    Q.active = true;
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      const path = url.split("?")[0];
      if (init?.method === "PUT") return { ok: false, status: 500, json: async () => ({}), clone() { return this; } };
      const routes: Record<string, unknown> = { "/api/transactions": { data: [tx], total: 1 }, "/api/transactions/splits": [], "/api/transactions/linked": { data: [] }, "/api/accounts": ACCOUNTS, "/api/categories": CATS, "/api/portfolio": [] };
      return { ok: true, status: 200, json: async () => routes[path] ?? {}, clone() { return this; } };
    }));
    await mountReady();
    fireEvent.change(document.getElementById("txnew-payee")!, { target: { value: "shop" } });
    save();
    await screen.findByText(/Save failed \(500\)/);
    expect(Q.queueEdit).not.toHaveBeenCalled();
  });
});
