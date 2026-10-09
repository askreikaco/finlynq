/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import * as React from "react";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";

const H = vi.hoisted(() => ({ push: vi.fn(), search: "", id: "7" }));
const ROUTER = { push: H.push, replace: vi.fn(), back: vi.fn() };
vi.mock("next/navigation", () => ({
  useRouter: () => ROUTER,
  // PageHeader resolves its auto back target from the nav registry (useBackTarget -> usePathname).
  usePathname: () => "/transactions",
  useSearchParams: () => new URLSearchParams(H.search),
  useParams: () => ({ id: H.id }),
}));
vi.mock("next/link", () => ({ default: ({ children, href }: any) => React.createElement("a", { href }, children) }));
vi.mock("swr", () => ({ mutate: vi.fn(async () => undefined), useSWRConfig: () => ({ mutate: vi.fn(), cache: new Map() }) }));

import SplitRoute from "@/app/(app)/transactions/[id]/split/page";

const CATS = [{ id: 1, name: "Food", type: "E", group: "Daily" }, { id: 2, name: "Fun", type: "E", group: "Leisure" }];
const ACCTS = [{ id: 1, name: "Chequing", currency: "USD", type: "A", archived: false }, { id: 9, name: "Old", currency: "USD", type: "A", archived: true }];

function stub(splits: unknown[] = []) {
  const fn = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    let body: unknown = {};
    if (url.startsWith("/api/transactions?id=")) body = { data: [{ id: 7, amount: -50, currency: "USD" }] };
    else if (url.startsWith("/api/transactions/splits") && method === "GET") body = splits;
    else if (url.startsWith("/api/transactions/splits")) body = {};
    else if (url.startsWith("/api/categories")) body = CATS;
    else if (url.startsWith("/api/accounts")) body = ACCTS;
    return { ok: true, status: 200, json: async () => body, clone() { return this; } };
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

beforeEach(() => {
  H.push.mockClear(); H.search = "returnTo=%2Ftransactions"; H.id = "7";
  (globalThis as any).ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
  (Element.prototype as any).scrollIntoView ??= () => {};
  (Element.prototype as any).hasPointerCapture ??= () => false;
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

async function mountReady() {
  render(<SplitRoute />);
  await screen.findByTestId("tx-split-root");
}

describe("/transactions/[id]/split page", () => {
  it("opens with one row holding the full absolute total and a Balanced state", async () => {
    stub();
    await mountReady();
    expect(screen.getByText("Split transaction")).toBeTruthy();
    expect((document.getElementById("split-0-amount") as HTMLInputElement).value).toBe("50");
    expect(screen.getByText("Balanced")).toBeTruthy();
  });

  it("a single row is refused with the dialog's message and nothing is posted", async () => {
    const fn = stub();
    await mountReady();
    fireEvent.click(screen.getByTestId("tx-split-save"));
    expect(await screen.findByText("A split requires at least 2 rows.")).toBeTruthy();
    expect(fn.mock.calls.some(([u, i]) => u === "/api/transactions/splits" && (i as any)?.method === "POST")).toBe(false);
  });

  it("an unbalanced split disables Save and shows what is left", async () => {
    stub();
    await mountReady();
    fireEvent.change(document.getElementById("split-0-amount")!, { target: { value: "20" } });
    expect((screen.getByTestId("tx-split-save") as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("30.00 left", { exact: false })).toBeTruthy();
  });

  it("balanced two-row split posts the dialog's payload (outflow sign), then returns to returnTo", async () => {
    const fn = stub();
    await mountReady();
    fireEvent.change(document.getElementById("split-0-amount")!, { target: { value: "20" } });
    fireEvent.click(screen.getByRole("button", { name: "Add row" }));
    fireEvent.change(document.getElementById("split-1-amount")!, { target: { value: "30" } });
    fireEvent.change(document.getElementById("split-1-note")!, { target: { value: "beer" } });
    fireEvent.click(screen.getByTestId("tx-split-save"));
    await waitFor(() => expect(H.push).toHaveBeenCalledWith("/transactions"));
    const post = fn.mock.calls.find(([u, i]) => u === "/api/transactions/splits" && (i as any)?.method === "POST");
    expect(JSON.parse((post![1] as any).body)).toEqual({
      transactionId: 7,
      splits: [
        { categoryId: null, accountId: null, amount: -20, note: "", description: "", tags: "" },
        { categoryId: null, accountId: null, amount: -30, note: "beer", description: "", tags: "" },
      ],
    });
  });

  it("Clear splits sends DELETE for the transaction and returns", async () => {
    const fn = stub([{ categoryId: 1, accountId: null, amount: -10, note: null, description: null, tags: null }, { categoryId: 2, accountId: null, amount: -40, note: "x", description: null, tags: null }]);
    await mountReady();
    fireEvent.click(screen.getByRole("button", { name: "Clear splits" }));
    await waitFor(() => expect(H.push).toHaveBeenCalledWith("/transactions"));
    expect(fn.mock.calls.some(([u, i]) => u === "/api/transactions/splits?transactionId=7" && (i as any)?.method === "DELETE")).toBe(true);
  });

  it.each([["//evil.example", "/transactions"], ["https://evil.example", "/transactions"], ["javascript:alert(1)", "/transactions"]])(
    "returnTo %s is not used for Back",
    async (raw, expected) => {
      H.search = `returnTo=${encodeURIComponent(raw)}`;
      stub();
      await mountReady();
      const back = screen.getAllByRole("link").find((a) => a.getAttribute("href")?.startsWith("/"));
      expect(back?.getAttribute("href")).toBe(expected);
    },
  );
});
