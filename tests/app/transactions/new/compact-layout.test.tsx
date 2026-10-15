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
  it("Expense fields are one ListCard of rows: Date, Amount, Category, Account, Payee, Note, Tags, Business", () => {
    seedPrefill();
    render(<Page />);
    const list = screen.getByTestId("txnew-list");
    expect(list.querySelector("[class*='shadow-[var(--list-divider)]']")).not.toBeNull(); // inset hairline between rows
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

  it("Transfer rows: Date, Amount, From Account, To Account, Note (no Category or Payee)", () => {
    seedPrefill({ txType: "Transfer" });
    render(<Page />);
    expect(rowIds()).toEqual([
      "txnew-row-date",
      "txnew-row-amount",
      "txnew-row-account",
      "txnew-row-to-account",
      "txnew-row-note",
      "txnew-row-tags",
      "txnew-row-business",
    ]);
    expect(screen.getByTestId("txnew-row-account").textContent).toContain("From");
  });

  it("Tags and Business are inline; Split is an accordion card with its count in the header", () => {
    seedPrefill();
    render(<Page />);
    expect(screen.queryByRole("button", { name: /More details/ })).toBeNull();
    expect(screen.getByPlaceholderText("Tags")).toBeTruthy();
    expect(screen.getByRole("switch", { name: /Business/ })).toBeTruthy();
    // Split is a count field in the card header (was the "Split this transaction" switch; S-4).
    expect(screen.getByTestId("split-count")).toBeTruthy();
    expect(screen.getByTestId("txnew-split").getAttribute("data-state")).toBe("closed");
    expect(screen.queryByTestId("split-row-1")).toBeNull();
    expect(screen.queryByRole("switch", { name: /Split this transaction/ })).toBeNull();
  });

  it("Split card: a count above 1 expands the rows, 0 / empty collapses them", () => {
    seedPrefill();
    render(<Page />);
    const card = () => screen.getByTestId("txnew-split");
    const count = screen.getByTestId("split-count") as HTMLInputElement;
    expect(count.placeholder).toBe("0");
    fireEvent.change(count, { target: { value: "1" } });
    expect(card().getAttribute("data-state")).toBe("closed");
    expect(document.getElementById("txnew-split-count-hint")?.textContent).toBe("Enter 2 or more to split");
    fireEvent.change(count, { target: { value: "3" } });
    expect(card().getAttribute("data-state")).toBe("open");
    expect(screen.getByTestId("split-row-1")).toBeTruthy();
    expect(screen.getByTestId("split-row-3")).toBeTruthy();
    // the count lives in the header and is not duplicated inside the rows
    expect(screen.getAllByTestId("split-count")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Decrease splits" }));
    expect(screen.getByTestId("split-row-2")).toBeTruthy();
    expect(screen.queryByTestId("split-row-3")).toBeNull();
    fireEvent.change(count, { target: { value: "" } });
    expect(card().getAttribute("data-state")).toBe("closed");
    expect(screen.queryByTestId("split-row-1")).toBeNull();
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
