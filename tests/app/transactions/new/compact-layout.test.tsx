/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as React from "react";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { readFileSync } from "fs";
import path from "path";

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
const SRC = path.join(process.cwd(), "src/components/transactions/entry/transaction-entry-screen.tsx");

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

// Testids of the direct children of the field list (one ListCard of FormRows).
const rowIds = () =>
  Array.from(screen.getByTestId("txnew-list").querySelectorAll("[data-testid^='txnew-row-']")).map((el) => el.getAttribute("data-testid"));

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear(); // last-used account and recent picks persist per browser
  window.history.replaceState({}, "", "/transactions/new");
});
afterEach(() => cleanup());

describe("compact new-transaction layout", () => {
  it("Expense fields are one ListCard of rows: Date, Amount, Category, Account, Payee, Note", () => {
    seedPrefill();
    render(<Page />);
    const list = screen.getByTestId("txnew-list");
    expect(list.className).toContain("divide-y");
    expect(rowIds()).toEqual([
      "txnew-row-date",
      "txnew-row-amount",
      "txnew-row-category",
      "txnew-row-account",
      "txnew-row-payee",
      "txnew-row-note",
    ]);
  });

  it("Transfer rows: Date, Amount, From Account, To Account, Note (no Category or Payee)", () => {
    seedPrefill({ txType: "Transfer" });
    render(<Page />);
    expect(rowIds()).toEqual([
      "txnew-row-date",
      "txnew-row-amount",
      "txnew-row-account",
      "txnew-row-to-account",
      "txnew-row-note",
    ]);
    expect(screen.getByTestId("txnew-row-account").textContent).toContain("From");
  });

  it("More details is collapsed by default, and expands to Tags, Business and Split", () => {
    seedPrefill();
    render(<Page />);
    expect(screen.queryByPlaceholderText("Comma-separated")).toBeNull();
    const toggle = screen.getByRole("button", { name: /More details/ });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(toggle.getAttribute("aria-controls")).toBeNull();
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(toggle.getAttribute("aria-controls")).toBe("txnew-more-panel");
    expect(screen.getByPlaceholderText("Comma-separated")).toBeTruthy();
    // Split is a count field now (was the "Split this transaction" switch; S-4).
    expect(screen.getByTestId("split-count")).toBeTruthy();
    expect(screen.queryByRole("switch", { name: /Split this transaction/ })).toBeNull();
    expect(screen.getByRole("switch", { name: /Business/ })).toBeTruthy();
  });

  it("numpad dock is touch-only (pointer-coarse) and docks at the safe-area bottom (tab bar hidden on this route)", () => {
    seedPrefill({ amount: "" });
    render(<Page />);
    fireEvent.focus(screen.getByLabelText("Amount"));
    const dock = screen.getByTestId("numpad-dock");
    expect(dock.className).toContain("hidden");
    expect(dock.className).toContain("pointer-coarse:block");
    expect(dock.className).toContain("bottom-[var(--sab,0px)]");
    expect(dock.className).not.toContain("--mobile-bar-clearance");
    expect(dock.className).not.toMatch(/(^|\s)md:(block|flex)(\s|$)/);
  });

  it("the new-transaction header does not repeat the top safe-area inset (body already pads --sat)", () => {
    seedPrefill();
    render(<Page />);
    const header = document.querySelector('[data-slot="page-header"]') as HTMLElement;
    expect(header.className).not.toContain("pt-[var(--sat)]");
    const src = readFileSync(SRC, "utf8");
    expect(src).not.toContain("pt-[var(--sat)]");
    expect(src).toContain("max-regular:top-[var(--sat)]");
    const css = readFileSync(path.join(process.cwd(), "src/app/globals.css"), "utf8");
    expect(css).toMatch(/body\s*\{[^}]*padding-top:\s*var\(--sat\)/);
  });

  it("Save and Cancel stay rendered while the numpad is open (they are in normal flow)", () => {
    seedPrefill();
    render(<Page />);
    fireEvent.focus(screen.getByLabelText("Amount"));
    expect(screen.getByRole("button", { name: "Save" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeTruthy();
  });
});
