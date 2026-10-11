/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as React from "react";
import { within, render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";

const H = vi.hoisted(() => ({ push: vi.fn(), back: vi.fn() }));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: H.push, back: H.back }),
  usePathname: () => "/transactions/new",
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
        { id: 3, name: "Brokerage", currency: "USD", archived: false, isInvestment: true },
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

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear(); // last-used account and recent picks persist per browser
  window.history.replaceState({}, "", "/transactions/new");
  H.push.mockClear();
  H.back.mockClear();
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
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
const rowIds = () =>
  Array.from(screen.getByTestId("txnew-list").querySelectorAll("[data-testid^='txnew-row-']")).map((el) => el.getAttribute("data-testid"));

describe("new transaction row layout", () => {
  it("rows are in order: Date, Amount, Category, Account, Payee, Note, Tags, Business", () => {
    seedPrefill();
    render(<Page />);
    expect(rowIds()).toEqual([
      "txnew-row-date",
      "txnew-row-amount",
      "txnew-row-category",
      "txnew-row-account",
      "txnew-row-payee",
      "txnew-row-note",
      "txnew-row-tags",
      "txnew-row-business",
    ]);
  });

  it("there is no More details: Tags and Business are inline, Repeat and Split are accordion cards", () => {
    seedPrefill();
    render(<Page />);
    expect(screen.queryByRole("button", { name: /More details/ })).toBeNull();
    expect(screen.getByPlaceholderText("Tags")).toBeTruthy();
    expect(screen.getByTestId("txnew-repeat").getAttribute("data-state")).toBe("closed");
    expect(screen.getByTestId("txnew-split").getAttribute("data-state")).toBe("closed");
  });

  it("rows show only their icon: the label text is visually hidden (sr-only) and the wording is the placeholder", () => {
    seedPrefill({ categoryId: "", accountId: "", payee: "", note: "" });
    render(<Page />);
    for (const [row, label] of [
      ["txnew-row-date", "Date"],
      ["txnew-row-category", "Category"],
      ["txnew-row-account", "Account"],
      ["txnew-row-payee", "Payee"],
      ["txnew-row-note", "Note"],
    ] as const) {
      const el = within(screen.getByTestId(row)).getAllByText(label).find((n) => n.classList.contains("sr-only"));
      expect(el, `${row} keeps a sr-only "${label}"`).toBeTruthy();
      expect(screen.getByTestId(row).querySelector('[data-slot="form-row-icon"]')).toBeTruthy();
    }
    expect(screen.getByPlaceholderText("Payee / Merchant")).toBeTruthy();
    expect(screen.getByPlaceholderText("Note")).toBeTruthy();
    expect(screen.getByTestId("txnew-row-category").textContent).toContain("Category");
  });

  it("Cancel leaves without booking anything", async () => {
    seedPrefill();
    render(<Page />);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(postsTo("/api/transactions").length).toBe(0);
  });

  it("empty amount: Save marks the amount row invalid, shows the error and opens the numpad", async () => {
    seedPrefill({ amount: "" });
    render(<Page />);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Please enter a valid amount greater than 0")).toBeTruthy();
    const amount = screen.getByLabelText("Amount");
    expect(amount.getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByRole("group", { name: "Amount keypad" })).toBeTruthy();
    expect(postsTo("/api/transactions").length).toBe(0);
  });

  it("Back button calls router.back() when there is history", () => {
    window.history.pushState({}, "", "/transactions/new");
    seedPrefill();
    render(<Page />);
    fireEvent.click(screen.getByRole("button", { name: "Back to transactions" }));
    expect(H.back).toHaveBeenCalledTimes(1);
    expect(H.push).not.toHaveBeenCalled();
  });

  it("numpad opens when the amount is tapped and not on load", () => {
    seedPrefill({ amount: "" });
    render(<Page />);
    expect(screen.queryByRole("group", { name: "Amount keypad" })).toBeNull();
    fireEvent.focus(screen.getByLabelText("Amount"));
    expect(screen.getByRole("group", { name: "Amount keypad" })).toBeTruthy();
  });
});
