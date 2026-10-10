/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as React from "react";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }), usePathname: () => "/transactions/new",
}));
vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) =>
    React.createElement("a", { href }, children),
}));
vi.mock("swr", () => ({ mutate: vi.fn(), useSWRConfig: () => ({ mutate: vi.fn(), cache: new Map() }) }));
vi.mock("@/lib/data/use-api", () => ({
  useApi: (url: string) => {
    if (url === "/api/accounts")
      return { isLoading: false, data: [
        { id: 1, name: "Checking", currency: "USD", archived: false },
        { id: 2, name: "Savings", currency: "USD", archived: false },
      ] };
    if (url === "/api/categories")
      return { isLoading: false, data: [
        { id: 10, name: "Food", type: "E" },
        { id: 20, name: "Salary", type: "I" },
      ] };
    return { isLoading: false, data: { suggestions: [] } };
  },
}));

import Page from "@/app/(app)/transactions/new/page";

const KEY = "finlynq:tx-prefill";
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

// Prefill seeds amount/account/category/payee so the test needs no numpad.
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
let fetchMock: ReturnType<typeof vi.fn>;

function respond(url: string) {
  if (url.startsWith("/api/fx/preview"))
    return { ok: true, json: async () => ({ rate: 1.25, source: "ecb", converted: 125, date: today() }) };
  if (url === "/api/settings/active-currencies")
    return { ok: true, json: async () => ({ active: ["USD", "EUR", "CAD"] }) };
  return { ok: true, json: async () => ({ id: 99 }) };
}

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear(); // last-used account and recent picks persist per browser
  window.history.replaceState({}, "", "/transactions/new");
  calls = [];
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return respond(url);
  });
  vi.stubGlobal("fetch", fetchMock);
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

// The option list fills once /api/settings/active-currencies resolves, so wait for it.
async function pickCurrency(code: string) {
  // Currency is the chip in the amount row; it opens the currency bottom sheet.
  fireEvent.click(screen.getByLabelText("Currency"));
  const opt = await screen.findByRole("button", { name: new RegExp(`^${code}`) });
  fireEvent.click(opt);
}

async function saveExpense() {
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() => expect(postsTo("/api/transactions").length).toBe(1));
}

describe("new transaction page parity with the dialog", () => {
  it("currency select defaults to the account currency and posts the chosen enteredCurrency", async () => {
    seedPrefill();
    render(<Page />);
    expect(screen.getByLabelText("Currency").textContent).toContain("USD");
    await pickCurrency("EUR");
    await waitFor(() => expect(screen.getByLabelText("Currency").textContent).toContain("EUR"));
    await saveExpense();
    expect(bodyOf(postsTo("/api/transactions")[0])).toMatchObject({ enteredCurrency: "EUR", enteredAmount: -150 });
  });

  it("FX preview appears when the entered currency differs from the account currency, and not otherwise", async () => {
    seedPrefill();
    render(<Page />);
    expect(screen.queryByText(/^Account:/)).toBeNull();
    expect(calls.some((c) => c.url.startsWith("/api/fx/preview"))).toBe(false);
    await pickCurrency("EUR");
    await waitFor(() => expect(screen.getByText(/^Account:/)).toBeTruthy());
    const fx = calls.find((c) => c.url.startsWith("/api/fx/preview"));
    expect(fx?.url).toContain("from=EUR");
    expect(fx?.url).toContain("to=USD");
  });

  it("rule checkbox adds a payee rule after the transaction when checked", async () => {
    seedPrefill();
    render(<Page />);
    fireEvent.click(screen.getByRole("switch", { name: /Also create a rule for next time/ }));
    await saveExpense();
    await waitFor(() => expect(postsTo("/api/rules").length).toBe(1));
    const rule = bodyOf(postsTo("/api/rules")[0]);
    expect(rule.conditions.all[0]).toMatchObject({ field: "payee", value: "ACME" });
    expect(rule.actions[0]).toMatchObject({ kind: "set_category", categoryId: 10 });
    const txIdx = calls.indexOf(postsTo("/api/transactions")[0]);
    const ruleIdx = calls.indexOf(postsTo("/api/rules")[0]);
    expect(ruleIdx).toBeGreaterThan(txIdx);
  });

  it("no rule request when the checkbox is left unticked", async () => {
    seedPrefill();
    render(<Page />);
    expect(screen.getByRole("switch", { name: /Also create a rule for next time/ })).toBeTruthy();
    await saveExpense();
    expect(postsTo("/api/rules").length).toBe(0);
  });

  it("?kind=transfer opens the Transfer tab (currency chip shown but disabled, destination field shown)", () => {
    window.history.replaceState({}, "", "/transactions/new?kind=transfer");
    render(<Page />);
    expect(screen.getByRole("heading", { name: "New Transfer" })).toBeTruthy();
    expect(screen.getByText("To")).toBeTruthy();
    expect((screen.getByLabelText("Currency") as HTMLButtonElement).disabled).toBe(true);
  });

  it("?kind accepts only transfer|expense|income; anything else keeps the Expense default", () => {
    window.history.replaceState({}, "", "/transactions/new?kind=income");
    const { unmount } = render(<Page />);
    expect(screen.getByRole("heading", { name: "New Income" })).toBeTruthy();
    unmount();
    window.history.replaceState({}, "", "/transactions/new?kind=bogus");
    render(<Page />);
    expect(screen.getByRole("heading", { name: "New Expense" })).toBeTruthy();
  });
});
