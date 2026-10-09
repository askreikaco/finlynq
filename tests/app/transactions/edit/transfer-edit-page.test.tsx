/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import * as React from "react";
import { render, screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";

const H = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), search: "", linkId: "L-1" }));
const ROUTER = { push: H.push, replace: H.replace, back: vi.fn() };
vi.mock("next/navigation", () => ({
  useRouter: () => ROUTER,
  useSearchParams: () => new URLSearchParams(H.search),
  useParams: () => ({ linkId: H.linkId }),
}));
vi.mock("next/link", () => ({ default: ({ children, href }: any) => React.createElement("a", { href }, children) }));
vi.mock("swr", () => ({ mutate: vi.fn(async () => undefined), useSWRConfig: () => ({ mutate: vi.fn(), cache: new Map() }) }));
vi.mock("@/components/currency-provider", () => ({ useDisplayCurrency: () => ({ displayCurrency: "USD" }) }));
vi.mock("@/components/dropdown-order-provider", () => ({ useDropdownOrder: () => <T,>(items: T[]) => items }));
vi.mock("@/lib/hooks/useActiveCurrencies", () => ({ useActiveCurrencies: () => ["USD"] }));

import EditTransferRoute from "@/app/(app)/transactions/transfer/[linkId]/edit/page";

const legs = {
  1: { id: 1, date: "2026-02-01", accountId: 1, accountName: "Chequing", categoryId: 3, currency: "USD", amount: -100, enteredAmount: -100, enteredCurrency: "USD", quantity: null, portfolioHolding: null, note: "rent", payee: "", tags: "", isBusiness: 0, linkId: "L-1" },
  2: { id: 2, date: "2026-02-01", accountId: 2, accountName: "Savings", categoryId: 3, currency: "USD", amount: 100, enteredAmount: 100, enteredCurrency: "USD", quantity: null, portfolioHolding: null, note: "rent", payee: "", tags: "", isBusiness: 0, linkId: "L-1" },
} as const;
const accounts = [
  { id: 1, name: "Chequing", currency: "USD", type: "A", group: "g", archived: false },
  { id: 2, name: "Savings", currency: "USD", type: "A", group: "g", archived: false },
];

function stub() {
  const fn = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    let body: unknown = {};
    if (url.startsWith("/api/transactions/linked")) body = { data: [{ ...legs[1], id: 1 }, { ...legs[2], id: 2 }] };
    else if (url.startsWith("/api/transactions/transfer")) body = method === "PUT" ? { fromTransactionId: 1 } : {};
    else if (url.startsWith("/api/transactions?id=")) body = { data: [legs[Number(url.split("=")[1]) as 1 | 2]] };
    else if (url.startsWith("/api/transactions/splits")) body = [];
    else if (url.startsWith("/api/accounts")) body = accounts;
    else if (url.startsWith("/api/categories")) body = [{ id: 3, name: "Transfers", type: "R", group: "g" }];
    else if (url.startsWith("/api/portfolio")) body = [];
    return { ok: true, status: 200, json: async () => body, clone() { return this; } };
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

beforeEach(() => {
  H.push.mockClear(); H.replace.mockClear(); H.search = "returnTo=%2Ftransactions"; H.linkId = "L-1";
  (globalThis as any).ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
  (Element.prototype as any).scrollIntoView ??= () => {};
  (Element.prototype as any).hasPointerCapture ??= () => false;
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

async function mountReady() {
  render(<EditTransferRoute />);
  await screen.findByTestId("tx-edit-root");
}

describe("/transactions/transfer/[linkId]/edit page", () => {
  it("loads both legs and titles the page Edit transfer", async () => {
    stub();
    await mountReady();
    expect(screen.getByText("Edit transfer")).toBeTruthy();
    expect(screen.getByText("Note (applied to both legs)")).toBeTruthy();
    expect(screen.getByDisplayValue("rent")).toBeTruthy();
  });

  it("saves with the same transfer PUT body the dialog sent, then returns to returnTo", async () => {
    const fn = stub();
    await mountReady();
    fireEvent.submit(document.getElementById("transaction-edit-form")!);
    await waitFor(() => expect(H.push).toHaveBeenCalledWith("/transactions"));
    const put = fn.mock.calls.find(([u, i]) => u === "/api/transactions/transfer" && (i as any)?.method === "PUT");
    expect(put).toBeTruthy();
    expect(JSON.parse((put![1] as any).body)).toEqual({
      fromAccountId: 1,
      toAccountId: 2,
      enteredAmount: 100,
      date: "2026-02-01",
      note: "rent",
      linkId: "L-1",
      holdingName: null,
      destHoldingName: null,
      quantity: null,
      destQuantity: null,
    });
  });

  it("Delete transfer asks first, then deletes both legs by linkId", async () => {
    const fn = stub();
    await mountReady();
    fireEvent.click(screen.getByRole("button", { name: "More actions" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Delete transfer" }));
    const dlg = await screen.findByRole("dialog");
    expect(fn.mock.calls.some(([u, i]) => String(u).startsWith("/api/transactions/transfer") && (i as any)?.method === "DELETE")).toBe(false);
    fireEvent.click(within(dlg).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(H.push).toHaveBeenCalledWith("/transactions"));
    expect(fn.mock.calls.some(([u, i]) => u === "/api/transactions/transfer?linkId=L-1" && (i as any)?.method === "DELETE")).toBe(true);
  });

  it("an unknown link shows a not-found message", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ data: [] }), clone() { return this; } })));
    render(<EditTransferRoute />);
    expect(await screen.findByText("This transfer no longer exists.")).toBeTruthy();
  });
});
