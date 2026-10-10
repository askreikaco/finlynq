/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as React from "react";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";

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
  it("rows are in order: Date, Amount, Category, Account, Payee, Note", () => {
    seedPrefill();
    render(<Page />);
    expect(rowIds()).toEqual([
      "txnew-row-date",
      "txnew-row-amount",
      "txnew-row-category",
      "txnew-row-account",
      "txnew-row-payee",
      "txnew-row-note",
    ]);
  });

  it("More details is collapsed by default and expands inline (aria-expanded)", () => {
    seedPrefill();
    render(<Page />);
    const more = screen.getByRole("button", { name: /More details/ });
    expect(more.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByPlaceholderText("Comma-separated")).toBeNull();
    fireEvent.click(more);
    expect(more.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByPlaceholderText("Comma-separated")).toBeTruthy();
  });

  it("Continue posts once, clears amount and payee, and keeps date and account", async () => {
    seedPrefill();
    render(<Page />);
    const dateBefore = screen.getByTestId("txnew-row-date").textContent;
    expect(screen.getByTestId("txnew-row-account").textContent).toContain("Savings");
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await waitFor(() => expect(postsTo("/api/transactions").length).toBe(1));
    await waitFor(() =>
      expect((screen.getByLabelText("Amount") as HTMLInputElement).value).toBe(""),
    );
    expect((screen.getByLabelText("Payee") as HTMLInputElement).value).toBe("");
    expect(screen.getByTestId("txnew-row-date").textContent).toBe(dateBefore);
    expect(screen.getByTestId("txnew-row-account").textContent).toContain("Savings");
    expect((screen.getByRole("button", { name: "Save" }) as HTMLButtonElement).disabled).toBe(false);
    expect(H.push).not.toHaveBeenCalled();
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
