/**
 * @vitest-environment jsdom
 * New-transaction save with the offline write queue (local-first L3).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as React from "react";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";

const Q = vi.hoisted(() => ({ active: false, queueCreate: vi.fn(async (_f: unknown) => true), queueEdit: vi.fn(async () => true), push: vi.fn() }));
vi.mock("@/lib/data/local-write-queue", () => ({
  isLocalWriteQueueActive: () => Q.active,
  queueOfflineCreate: Q.queueCreate,
  queueOfflineEdit: Q.queueEdit,
}));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: Q.push, back: vi.fn() }),
  usePathname: () => "/transactions/new",
}));
vi.mock("next/link", () => ({ default: ({ children, href }: any) => React.createElement("a", { href }, children) }));
vi.mock("swr", () => ({ mutate: vi.fn(), useSWRConfig: () => ({ mutate: vi.fn(), cache: new Map() }) }));
vi.mock("@/lib/data/use-api", () => ({
  useApi: (url: string) => {
    if (url === "/api/accounts") return { isLoading: false, data: [{ id: 2, name: "Savings", currency: "USD", archived: false }] };
    if (url === "/api/categories") return { isLoading: false, data: [{ id: 10, name: "Food", type: "E" }] };
    return { isLoading: false, data: { suggestions: [] } };
  },
}));

import Page from "@/app/(app)/transactions/new/page";

function seed(over: Record<string, unknown> = {}) {
  sessionStorage.setItem("finlynq:tx-prefill", JSON.stringify({ v: 1, amount: "150", accountId: "2", categoryId: "10", payee: "ACME", note: "", tags: "", isBusiness: false, txType: "Expense", ts: Date.now(), ...over }));
  window.history.replaceState({}, "", "/transactions/new?prefill=1");
}
const offlineFetch = () => vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));

beforeEach(() => {
  Q.active = false; Q.queueCreate.mockClear(); Q.push.mockClear();
  sessionStorage.clear(); localStorage.clear();
  (globalThis as any).ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
  (Element.prototype as any).scrollIntoView ??= () => {};
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("new transaction + offline queue", () => {
  it("flag off: network failure shows today's error and never touches the queue", async () => {
    seed(); offlineFetch();
    render(<Page />);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByText("Failed to fetch");
    expect(Q.queueCreate).not.toHaveBeenCalled();
    expect(Q.push).not.toHaveBeenCalled();
  });

  it("flag on: a simple create is queued (signed amount, allowlisted fields) and the screen succeeds", async () => {
    Q.active = true; seed(); offlineFetch();
    render(<Page />);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByText("Saved on this device — will sync when online");
    expect(Q.queueCreate).toHaveBeenCalledTimes(1);
    const f = Q.queueCreate.mock.calls[0][0] as Record<string, unknown>;
    expect(f).toMatchObject({ accountId: 2, categoryId: 10, enteredAmount: -150, payee: "ACME", enteredCurrency: "USD" });
    expect(Object.keys(f).sort()).toEqual(["accountId", "categoryId", "date", "enteredAmount", "enteredCurrency", "payee"]);
    await waitFor(() => expect(Q.push).toHaveBeenCalledWith("/transactions"), { timeout: 3000 });
  });

  it("flag on: a business-flagged create is online-only (keeps the error)", async () => {
    Q.active = true; seed({ isBusiness: true }); offlineFetch();
    render(<Page />);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByText("Failed to fetch");
    expect(Q.queueCreate).not.toHaveBeenCalled();
  });
});
