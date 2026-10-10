/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as React from "react";
import { render, screen, cleanup, waitFor } from "@testing-library/react";

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
  // The icon sits in the label cell: its nearest w-24 ancestor is that row's label cell.
  const cell = icon!.closest(".w-24");
  expect(cell, `w-24 label cell around icon in ${testId}`).not.toBeNull();
  expect(cell!.classList.contains("shrink-0")).toBe(true);
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
    // Amount row: the icon sits in the currency trigger inside the w-24 label cell.
    const amountRow = screen.getByTestId("txnew-row-amount");
    const cell = amountRow.querySelector('[data-slot="amount-label-cell"]') as HTMLElement;
    expect(cell.classList.contains("w-24")).toBe(true);
    expect(cell.querySelector('[data-slot="form-row-icon"]')).not.toBeNull();
  });

  it("keeps the value column left edge: every label cell is w-24 shrink-0", async () => {
    seedPrefill();
    render(<Page />);
    await waitFor(() => expect(screen.getByTestId("txnew-row-date")).toBeTruthy());
    for (const id of ["txnew-row-date", "txnew-row-category", "txnew-row-account", "txnew-row-payee", "txnew-row-note"]) {
      const row = screen.getByTestId(id);
      const cell = row.querySelector(".w-24") as HTMLElement;
      expect(cell, `${id} label cell`).not.toBeNull();
      expect(cell.classList.contains("shrink-0")).toBe(true);
      expect(row.classList.contains("gap-3")).toBe(true);
      expect(row.classList.contains("px-4")).toBe(true);
    }
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
    expect(area.getAttribute("placeholder")).toBe("Note / Description");
    expect(row.className).toContain("min-h-[calc(var(--spacing-row-tall)*2)]");
    expect(area.className).toContain("max-h-48");
    // Label cell keeps the shared narrow label width.
    expect(row.querySelector(".w-24")).not.toBeNull();
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
