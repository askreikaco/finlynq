/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as React from "react";
import { render, screen, cleanup, waitFor } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
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

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  window.history.replaceState({}, "", "/transactions/new");
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ active: ["USD", "EUR"] }) })));
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

function expectIconInLabel(testId: string) {
  const row = screen.getByTestId(testId);
  const icon = row.querySelector('[data-slot="form-row-icon"]');
  expect(icon, `icon in ${testId}`).not.toBeNull();
  expect(icon!.tagName.toLowerCase()).toBe("svg");
  expect(icon!.getAttribute("aria-hidden")).toBe("true");
  // Icon-only: the visible label is the icon; the label text stays in the DOM (sr-only) as the accessible name.
  const label = icon!.parentElement;
  expect(label, `label around icon in ${testId}`).not.toBeNull();
  expect(label!.querySelector(".sr-only"), `sr-only label in ${testId}`).not.toBeNull();
  expect(row.querySelector(".w-24, .w-28"), `no label column in ${testId}`).toBeNull();
}

describe("New Transaction rows render an icon in their label cell", () => {
  it("Expense: Date, Amount currency, Category, Account, Payee, Note", async () => {
    seedPrefill();
    render(<Page />);
    await waitFor(() => expect(screen.getByTestId("txnew-row-date")).toBeTruthy());
    expectIconInLabel("txnew-row-date");
    expectIconInLabel("txnew-row-category");
    expectIconInLabel("txnew-row-account");
    expectIconInLabel("txnew-row-payee");
    expectIconInLabel("txnew-row-note");
    // Amount row: the icon is the row's first child (like the other rows) and the currency chip is at the right end.
    const amountRow = screen.getByTestId("txnew-row-amount");
    expect(amountRow.querySelector('[data-slot="form-row-icon"]')).not.toBeNull();
    expect(amountRow.querySelector('[data-slot="amount-label-cell"]')).toBeNull();
    expect(amountRow.querySelector('[data-slot="amount-currency-chip"]')).not.toBeNull();
  });

  it("Note is a two-row auto-growing textarea with the doubled tall-row minimum", async () => {
    seedPrefill();
    render(<Page />);
    await waitFor(() => expect(screen.getByTestId("txnew-row-note")).toBeTruthy());
    const row = screen.getByTestId("txnew-row-note");
    const area = screen.getByRole("textbox", { name: "Note" }) as HTMLTextAreaElement;
    expect(area.tagName).toBe("TEXTAREA");
    expect(area.id).toBe("txnew-note");
    expect(area.getAttribute("rows")).toBe("2");
    expect(area.getAttribute("placeholder")).toBe("Note");
    expect(area.className).toContain("max-h-48");
    // Icon-only row: the label cell no longer reserves the narrow label width, the text is sr-only.
    expect(row.querySelector(".w-24")).toBeNull();
    expect(row.querySelector(".sr-only")?.textContent).toBe("Note");
  });

  it("Transfer: From Account and To Account carry icons", async () => {
    seedPrefill({ txType: "Transfer" });
    window.history.replaceState({}, "", "/transactions/new?prefill=1&kind=transfer");
    render(<Page />);
    await waitFor(() => expect(screen.getByTestId("txnew-row-to-account")).toBeTruthy());
    expectIconInLabel("txnew-row-account");
    expectIconInLabel("txnew-row-to-account");
  });
});
