/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as React from "react";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { readFileSync } from "fs";
import path from "path";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
}));
vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) =>
    React.createElement("a", { href }, children),
}));
vi.mock("swr", () => ({ mutate: vi.fn() }));
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
const SRC = path.join(process.cwd(), "src/app/(app)/transactions/new/page.tsx");

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

beforeEach(() => {
  sessionStorage.clear();
  window.history.replaceState({}, "", "/transactions/new");
});
afterEach(() => cleanup());

describe("compact new-transaction layout", () => {
  it("Expense tiles sit in a two-column grid: Date & Time | Category, Account | Payee", () => {
    seedPrefill();
    render(<Page />);
    const grid = screen.getByText("Date & Time").closest("div.grid") as HTMLElement;
    expect(grid).toBeTruthy();
    expect(grid.className).toContain("grid-cols-2");
    expect(grid.textContent).toContain("Category");
    expect(grid.textContent).toContain("Account");
    expect(grid.querySelector('input[aria-label="Payee"]')).toBeTruthy();
    expect(grid.children.length).toBe(4);
  });

  it("Transfer tiles sit in the same two-column grid: From | To, plus Date & Time", () => {
    seedPrefill({ txType: "Transfer" });
    render(<Page />);
    fireEvent.click(screen.getByRole("button", { name: "Transfer" }));
    const grid = screen.getByText("From Account").closest("div.grid") as HTMLElement;
    expect(grid.className).toContain("grid-cols-2");
    expect(grid.textContent).toContain("To Account");
    expect(grid.textContent).toContain("Date & Time");
    expect(grid.textContent).not.toContain("Category");
  });

  it("notes and tags are collapsed by default and expand on click", () => {
    seedPrefill();
    render(<Page />);
    expect(screen.queryByPlaceholderText("Note / Description")).toBeNull();
    expect(screen.queryByPlaceholderText("Tags (comma-separated)")).toBeNull();
    const toggle = screen.getByRole("button", { name: /Notes & tags/ });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByPlaceholderText("Note / Description")).toBeTruthy();
    expect(screen.getByPlaceholderText("Tags (comma-separated)")).toBeTruthy();
  });

  it("numpad wrapper docks at the safe-area bottom (tab bar hidden on this route)", () => {
    seedPrefill({ amount: "" });
    render(<Page />);
    fireEvent.click(screen.getByText("0.00").closest("button") as HTMLElement);
    const wrapper = screen.getByRole("button", { name: "OK" }).closest(".fixed") as HTMLElement;
    expect(wrapper).toBeTruthy();
    expect(wrapper.className).toContain("max-md:bottom-[var(--sab,0px)]");
    expect(wrapper.className).not.toContain("--mobile-bar-clearance");
  });

  it("the new-transaction header does not repeat the top safe-area inset (body already pads --sat)", () => {
    seedPrefill();
    render(<Page />);
    const header = document.querySelector("header") as HTMLElement;
    expect(header.className).not.toContain("pt-[var(--sat)]");
    const src = readFileSync(SRC, "utf8");
    expect(src).not.toContain("pt-[var(--sat)]");
    expect(src).toContain("max-md:top-[var(--sat)]");
    const css = readFileSync(path.join(process.cwd(), "src/app/globals.css"), "utf8");
    expect(css).toMatch(/body\s*\{[^}]*padding-top:\s*var\(--sat\)/);
  });

  it("Save button is present with the numpad closed and hidden while the numpad is open", () => {
    seedPrefill();
    render(<Page />);
    expect(screen.getByRole("button", { name: "Save Expense" })).toBeTruthy();
    fireEvent.click(screen.getByText("150").closest("button") as HTMLElement);
    expect(screen.queryByRole("button", { name: "Save Expense" })).toBeNull();
  });
});
