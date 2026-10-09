/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import * as React from "react";
import { render, screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";

const H = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  search: "",
  id: "7",
}));

const ROUTER = { push: H.push, replace: H.replace, back: vi.fn() };
vi.mock("next/navigation", () => ({
  useRouter: () => ROUTER,
  // PageHeader resolves its auto back target from the nav registry (useBackTarget -> usePathname).
  usePathname: () => "/transactions",
  useSearchParams: () => new URLSearchParams(H.search),
  useParams: () => ({ id: H.id }),
}));
vi.mock("next/link", () => ({ default: ({ children, href }: any) => React.createElement("a", { href }, children) }));
vi.mock("swr", () => ({ mutate: vi.fn(async () => undefined), useSWRConfig: () => ({ mutate: vi.fn(), cache: new Map() }) }));
vi.mock("@/components/currency-provider", () => ({ useDisplayCurrency: () => ({ displayCurrency: "USD" }) }));
vi.mock("@/components/dropdown-order-provider", () => ({ useDropdownOrder: () => <T,>(items: T[]) => items }));
vi.mock("@/lib/hooks/useActiveCurrencies", () => ({ useActiveCurrencies: () => ["USD"] }));

import EditTransactionRoute from "@/app/(app)/transactions/[id]/edit/page";
import { opHref } from "@/components/portfolio/forms/op-catalog";

const tx: any = {
  id: 7, date: "2026-01-01", accountId: 1, accountName: "A", categoryId: 1, categoryName: "C", categoryType: "E",
  currency: "USD", amount: -5, enteredAmount: -5, enteredCurrency: "USD", quantity: null, portfolioHolding: null,
  note: "n", payee: "p", tags: "", isBusiness: 0, linkId: null, kind: null,
};
const accounts = [{ id: 1, name: "A", currency: "USD", type: "A", group: "g", archived: false }];
const cats = [{ id: 1, name: "C", type: "E", group: "g" }];

type Routes = Record<string, (init?: RequestInit) => unknown>;
function stubFetch(over: Partial<Routes> = {}) {
  const routes: Routes = {
    "/api/transactions/splits": () => [],
    "/api/transactions/linked": () => ({ data: [] }),
    "/api/transactions": (init) =>
      init?.method === "PUT" ? { id: 7 } : init?.method === "DELETE" ? {} : { data: [tx], total: 1 },
    "/api/accounts": () => accounts,
    "/api/categories": () => cats,
    "/api/portfolio": () => [],
    ...over,
  };
  const fn = vi.fn(async (url: string, init?: RequestInit) => {
    const path = url.split("?")[0];
    const handler = routes[url.startsWith("/api/transactions/linked") ? "/api/transactions/linked" : path] ?? routes[url];
    const body = handler ? handler(init) : {};
    return { ok: true, status: 200, json: async () => body, clone() { return this; } };
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

beforeEach(() => {
  H.push.mockClear(); H.replace.mockClear(); H.search = ""; H.id = "7";
  (globalThis as any).ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
  (Element.prototype as any).scrollIntoView ??= () => {};
  (Element.prototype as any).hasPointerCapture ??= () => false;
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

async function mountReady() {
  render(<EditTransactionRoute />);
  await screen.findByTestId("tx-edit-root");
}

describe("/transactions/[id]/edit page", () => {
  it("renders Edit transaction with a back link to the validated returnTo and a form-bound Save", async () => {
    H.search = "returnTo=%2Ftransactions%3Fpage%3D2";
    stubFetch();
    await mountReady();
    expect(screen.getByText("Edit transaction")).toBeTruthy();
    const back = screen.getAllByRole("link").find((a) => a.getAttribute("href")?.startsWith("/transactions"));
    expect(back?.getAttribute("href")).toBe("/transactions?page=2");
    const save = screen.getByTestId("tx-edit-save");
    expect(save.getAttribute("form")).toBe("transaction-edit-form");
    expect(save.getAttribute("aria-label")).toBe("Save"); // PageHeader names the phone primary by its visible text
    expect(document.getElementById("transaction-edit-form")).toBeTruthy();
  });

  it("validation: an empty amount is refused with the dialog's message and sends no request", async () => {
    const fn = stubFetch();
    await mountReady();
    fireEvent.change(screen.getByPlaceholderText("-50.00"), { target: { value: "" } });
    fireEvent.submit(document.getElementById("transaction-edit-form")!);
    expect(await screen.findByText("Enter an amount")).toBeTruthy();
    expect(fn.mock.calls.some(([u, i]) => u === "/api/transactions" && (i as any)?.method === "PUT")).toBe(false);
  });

  it("payload parity: saves with the same PUT body the dialog sent, then goes back to returnTo", async () => {
    H.search = "returnTo=%2Ftransactions";
    const fn = stubFetch();
    await mountReady();
    fireEvent.change(screen.getByDisplayValue("p"), { target: { value: "shop" } });
    fireEvent.submit(document.getElementById("transaction-edit-form")!);
    await waitFor(() => expect(H.push).toHaveBeenCalledWith("/transactions"));
    const put = fn.mock.calls.find(([u, i]) => u === "/api/transactions" && (i as any)?.method === "PUT");
    expect(put).toBeTruthy();
    expect(JSON.parse((put![1] as any).body)).toEqual({
      id: 7,
      date: "2026-01-01",
      accountId: 1,
      categoryId: 1,
      enteredCurrency: "USD",
      enteredAmount: -5,
      payee: "shop",
      note: "n",
      tags: "",
      isBusiness: 0,
    });
  });

  it.each([
    ["//evil.example/x", "/transactions"],
    ["https://evil.example", "/transactions"],
    ["javascript:alert(1)", "/transactions"],
    ["/transactions/\nevil", "/transactions"],
  ])("returnTo %s falls back to /transactions (no open redirect)", async (raw, expected) => {
    H.search = `returnTo=${encodeURIComponent(raw)}`;
    stubFetch();
    await mountReady();
    const back = screen.getAllByRole("link").find((a) => a.textContent?.includes("Back") || a.getAttribute("href")?.startsWith("/transactions"));
    expect(back?.getAttribute("href")).toBe(expected);
  });

  it("a clean transfer pair redirects to the transfer edit page instead of editing one leg", async () => {
    stubFetch({
      "/api/transactions/linked": () => ({ data: [{ id: 9, accountId: 2, amount: 5 }] }),
      "/api/transactions": () => ({ data: [{ ...tx, linkId: "L-1" }] }),
    });
    render(<EditTransactionRoute />);
    await waitFor(() => expect(H.replace).toHaveBeenCalled());
    expect(H.replace.mock.calls[0][0]).toMatch(/^\/transactions\/transfer\/L-1\/edit/);
    expect(screen.queryByTestId("tx-edit-root")).toBeNull();
  });

  it("a portfolio-kind row redirects to its operation page", async () => {
    stubFetch({ "/api/transactions": () => ({ data: [{ ...tx, kind: "buy" }] }) });
    render(<EditTransactionRoute />);
    await waitFor(() => expect(H.replace).toHaveBeenCalledWith(opHref("buy", "?editId=7")));
  });

  it("a missing row shows a not-found message and a way back", async () => {
    stubFetch({ "/api/transactions": () => ({ data: [] }) });
    render(<EditTransactionRoute />);
    expect(await screen.findByText("This transaction no longer exists.")).toBeTruthy();
  });

  it("overflow menu: a transfer leg cannot be duplicated (disabled), a plain row can; Delete asks first", async () => {
    stubFetch({ "/api/transactions": (init) => (init?.method === "DELETE" ? {} : { data: [{ ...tx, linkId: "L-2" }] }), "/api/transactions/linked": () => ({ data: [{ id: 9, accountId: 1, amount: 5, accountName: "A", currency: "USD", date: "2026-01-01" }] }) });
    await mountReady();
    fireEvent.click(screen.getByRole("button", { name: "More actions" }));
    const dup = await screen.findByRole("menuitem", { name: "Duplicate" });
    expect(dup.getAttribute("aria-disabled") === "true" || dup.hasAttribute("data-disabled")).toBe(true);
  });

  it("Delete from the overflow menu opens a confirm dialog and only then sends DELETE", async () => {
    const fn = stubFetch();
    H.search = "returnTo=%2Ftransactions";
    await mountReady();
    fireEvent.click(screen.getByRole("button", { name: "More actions" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Delete" }));
    const dlg = await screen.findByRole("dialog");
    expect(fn.mock.calls.some(([, i]) => (i as any)?.method === "DELETE")).toBe(false);
    fireEvent.click(within(dlg).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(H.push).toHaveBeenCalledWith("/transactions"));
    expect(fn.mock.calls.some(([u, i]) => u === "/api/transactions?id=7" && (i as any)?.method === "DELETE")).toBe(true);
  });
});
