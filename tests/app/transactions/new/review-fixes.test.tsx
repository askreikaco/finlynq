/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as React from "react";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";

const H = vi.hoisted(() => ({
  accounts: [] as Array<Record<string, unknown>>,
  mutate: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }), usePathname: () => "/transactions/new",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) =>
    React.createElement("a", { href }, children),
}));
vi.mock("swr", () => ({ mutate: H.mutate, useSWRConfig: () => ({ mutate: H.mutate, cache: new Map() }) }));
vi.mock("@/lib/data/use-api", () => ({
  useApi: (url: string) => {
    if (url === "/api/accounts") return { isLoading: false, data: H.accounts };
    if (url === "/api/categories")
      return { isLoading: false, data: [{ id: 10, name: "Food", type: "E" }] };
    return { isLoading: false, data: { suggestions: [] } };
  },
}));

import Page from "@/app/(app)/transactions/new/page";

const KEY = "finlynq:tx-prefill";
const DEFAULT_ACCOUNTS = [
  { id: 1, name: "Checking", currency: "USD", archived: false },
  { id: 2, name: "Savings", currency: "USD", archived: false },
  { id: 3, name: "Brokerage", currency: "USD", archived: false, isInvestment: true },
];

function seedPrefill(over: Record<string, unknown> = {}) {
  sessionStorage.setItem(
    KEY,
    JSON.stringify({
      v: 1, amount: "150", accountId: "2", categoryId: "10", payee: "ACME", note: "",
      tags: "", isBusiness: false, txType: "Expense", ts: Date.now(), ...over,
    }),
  );
  window.history.replaceState({}, "", "/transactions/new?prefill=1");
}

let calls: { url: string; init?: RequestInit }[];
let fxResponse: () => { ok: boolean; json: () => Promise<unknown> };

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear(); // last-used account and recent picks persist per browser
  window.history.replaceState({}, "", "/transactions/new");
  H.accounts = DEFAULT_ACCOUNTS.map((a) => ({ ...a }));
  H.mutate.mockReset();
  calls = [];
  fxResponse = () => ({
    ok: true,
    json: async () => ({ rate: 1.25, source: "ecb", converted: 125, date: "2026-10-09" }),
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      if (url.startsWith("/api/fx/preview")) return fxResponse();
      if (url === "/api/settings/active-currencies")
        return { ok: true, json: async () => ({ active: ["USD", "EUR"] }) };
      return { ok: true, json: async () => ({ id: 99 }) };
    }),
  );
  (Element.prototype as unknown as Record<string, unknown>).hasPointerCapture ??= () => false;
  (Element.prototype as unknown as Record<string, unknown>).scrollIntoView ??= () => {};
  (globalThis as unknown as Record<string, unknown>).ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const postsTo = (url: string) => calls.filter((c) => c.url === url && c.init?.method === "POST");
const bodyOf = (c: { init?: RequestInit }) => JSON.parse(String(c.init?.body));

/** Groups start collapsed; expand the open picker sheet's collapsed group rows like a user would. */
function expandCollapsedGroups() {
  const headers = document.querySelectorAll('[data-slot="sheet-content"] [aria-expanded="false"]');
  headers.forEach((h) => fireEvent.click(h));
}

describe("new transaction page review fixes", () => {
  it("double Save posts once, and stays locked after the save has succeeded", async () => {
    seedPrefill();
    render(<Page />);
    const save = screen.getByRole("button", { name: "Save" });
    fireEvent.click(save);
    fireEvent.click(save);
    await waitFor(() => expect(screen.getByText("Expense saved successfully!")).toBeTruthy());
    expect(postsTo("/api/transactions").length).toBe(1);
    // After success the button must stay disabled, so a further click is a no-op.
    expect((screen.getByRole("button", { name: "Saved" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Saved" }));
    await new Promise((r) => setTimeout(r, 20));
    expect(postsTo("/api/transactions").length).toBe(1);
  });

  it("investment accounts are excluded from the default account and the account picker", async () => {
    window.history.replaceState({}, "", "/transactions/new");
    render(<Page />);
    await waitFor(() => expect(screen.getByText("Checking")).toBeTruthy());
    fireEvent.click(screen.getByText("Account"));
    expect(await screen.findByText("Savings")).toBeTruthy();
    expect(screen.queryByText("Brokerage")).toBeNull();
  });

  it("?account=<investment id> shows the Buy/Sell notice and does not select that account", async () => {
    window.history.replaceState({}, "", "/transactions/new?account=3");
    render(<Page />);
    expect(await screen.findByText(/Investment accounts use Buy\/Sell/)).toBeTruthy();
    const link = screen.getByRole("link", { name: "Open Buy/Sell" });
    expect(link.getAttribute("href")).toBe("/portfolio/new?account=3");
    expect(screen.getByText("Select Account")).toBeTruthy();
    expect(screen.queryByText("Brokerage")).toBeNull();
  });

  it("cross-currency transfer shows the received-amount input and posts receivedAmount", async () => {
    H.accounts = [
      { id: 1, name: "Checking", currency: "USD", archived: false },
      { id: 4, name: "Euro Account", currency: "EUR", archived: false },
    ];
    seedPrefill({ txType: "Transfer", accountId: "1", amount: "100" });
    window.history.replaceState({}, "", "/transactions/new?prefill=1&kind=transfer");
    render(<Page />);
    fireEvent.click(screen.getByText("Select Destination Account"));
    expandCollapsedGroups();
    fireEvent.click(await screen.findByText("Euro Account"));

    const received = (await screen.findByLabelText("Received (EUR)")) as HTMLInputElement;
    await waitFor(() => expect(received.value).toBe("125.00"));
    fireEvent.change(received, { target: { value: "130" } });

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(postsTo("/api/transactions/transfer").length).toBe(1));
    expect(bodyOf(postsTo("/api/transactions/transfer")[0])).toMatchObject({
      fromAccountId: 1,
      toAccountId: 4,
      receivedAmount: 130,
    });
  });

  it("transfer typed in EUR from a USD account posts enteredCurrency and previews the To amount from the converted amount", async () => {
    H.accounts = [
      { id: 1, name: "Checking", currency: "USD", archived: false },
      { id: 4, name: "Euro Account", currency: "EUR", archived: false },
    ];
    seedPrefill({ txType: "Transfer", accountId: "1", amount: "100" });
    window.history.replaceState({}, "", "/transactions/new?prefill=1&kind=transfer");
    // Pair rates: EUR->USD x1.25, USD->EUR x0.8. The preview echoes amount * rate.
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        calls.push({ url, init });
        if (url.startsWith("/api/fx/preview")) {
          const q = new URL(url, "http://x").searchParams;
          const rate = q.get("from") === "EUR" ? 1.25 : 0.8;
          const amt = Number(q.get("amount"));
          return { ok: true, json: async () => ({ rate, source: "ecb", converted: amt * rate, date: "2026-10-09" }) };
        }
        if (url === "/api/settings/active-currencies")
          return { ok: true, json: async () => ({ active: ["USD", "EUR"] }) };
        return { ok: true, json: async () => ({ id: 99 }) };
      }),
    );
    render(<Page />);
    fireEvent.click(screen.getByText("Select Destination Account"));
    expandCollapsedGroups();
    fireEvent.click(await screen.findByText("Euro Account"));

    fireEvent.click(screen.getByLabelText("Currency"));
    fireEvent.click(await screen.findByRole("button", { name: /^EUR/ }));

    // Entry leg: 100 EUR -> 125 USD (From currency), then To preview: 125 USD -> 100 EUR.
    const received = (await screen.findByLabelText("Received (EUR)")) as HTMLInputElement;
    await waitFor(() => expect(received.value).toBe("100.00"));
    expect(calls.some((c) => c.url.includes("from=EUR") && c.url.includes("to=USD"))).toBe(true);
    expect(calls.some((c) => c.url.includes("from=USD") && c.url.includes("to=EUR") && c.url.includes("amount=125"))).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(postsTo("/api/transactions/transfer").length).toBe(1));
    expect(bodyOf(postsTo("/api/transactions/transfer")[0])).toMatchObject({
      fromAccountId: 1,
      toAccountId: 4,
      enteredAmount: 100,
      enteredCurrency: "EUR",
    });
  });

  it("fx-currency-needs-override on a transfer shows the friendly message, not raw text", async () => {
    H.accounts = [
      { id: 1, name: "Checking", currency: "USD", archived: false },
      { id: 4, name: "Euro Account", currency: "EUR", archived: false },
    ];
    seedPrefill({ txType: "Transfer", accountId: "1", amount: "100" });
    window.history.replaceState({}, "", "/transactions/new?prefill=1&kind=transfer");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        calls.push({ url, init });
        if (url.startsWith("/api/fx/preview")) return fxResponse();
        if (url === "/api/transactions/transfer")
          return {
            ok: false,
            status: 422,
            json: async () => ({ code: "fx-currency-needs-override", currency: "EUR", error: "raw" }),
          };
        return { ok: true, json: async () => ({ active: ["USD", "EUR"] }) };
      }),
    );
    render(<Page />);
    fireEvent.click(screen.getByText("Select Destination Account"));
    expandCollapsedGroups();
    fireEvent.click(await screen.findByText("Euro Account"));
    fireEvent.click(await screen.findByRole("button", { name: "Save" }));
    expect(await screen.findByText("No FX rate for EUR.")).toBeTruthy();
    expect(screen.queryByText("raw")).toBeNull();
  });

  it("invalidates transaction lists with a key predicate, not an exact key", async () => {
    seedPrefill();
    render(<Page />);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(H.mutate).toHaveBeenCalled());
    const predicate = H.mutate.mock.calls.find((c) => typeof c[0] === "function")?.[0] as (
      k: unknown,
    ) => boolean;
    expect(predicate).toBeTypeOf("function");
    expect(predicate("/api/transactions?limit=50")).toBe(true);
    expect(predicate("/api/transactions")).toBe(true);
    expect(predicate("/api/accounts")).toBe(false);
  });
});

describe("header Save (the round yellow check)", () => {
  it("is in the header, books once, and shares the bottom Save's lock", async () => {
    seedPrefill();
    render(<Page />);
    const headerSave = screen.getByTestId("txnew-header-save") as HTMLButtonElement;
    expect(headerSave.getAttribute("aria-label")).toBe("Save transaction");
    expect(document.querySelector('[data-slot="page-header"]')!.contains(headerSave)).toBe(true);
    fireEvent.click(headerSave);
    fireEvent.click(headerSave);
    await waitFor(() => expect(screen.getByText("Expense saved successfully!")).toBeTruthy());
    expect(postsTo("/api/transactions").length).toBe(1);
    expect(headerSave.disabled).toBe(true);
  });
});
