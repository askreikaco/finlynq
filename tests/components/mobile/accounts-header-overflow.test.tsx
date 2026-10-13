/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import React from "react";
import { render, screen, cleanup, fireEvent, within, waitFor } from "@testing-library/react";

vi.mock("next/link", () => ({
  default: ({ children, href, ...p }: React.PropsWithChildren<{ href: string }>) => React.createElement("a", { href, ...p }, children),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => "/accounts", useSearchParams: () => new URLSearchParams() }));
vi.mock("@/components/currency-provider", () => ({ useDisplayCurrency: () => ({ displayCurrency: "VND" }) }));
vi.mock("@/components/dropdown-order-provider", () => ({
  useDropdownOrder: () => <T,>(items: T[]) => items,
}));
vi.mock("@/components/onboarding-tips", () => ({ OnboardingTips: () => null }));

import AccountsPage from "@/app/(app)/accounts/page";

const balances = [
  { accountId: 1, accountName: "TCB", accountType: "A", accountGroup: "Cash", currency: "VND", balance: 100, convertedBalance: 100 },
  { accountId: 2, accountName: "Old", accountType: "A", accountGroup: "Cash", currency: "VND", balance: 5, convertedBalance: 5, archived: true },
];

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => ({
    ok: true,
    json: async () => (String(url).includes("/api/dashboard") ? { balances } : {}),
  })));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const cls = (el: Element) => el.className.toString().split(/\s+/);

describe("Accounts header on mobile", () => {
  it("secondary actions are hidden from the bar at every width (HEADER_SECONDARY); the primary stays; overflow lists them", async () => {
    render(<AccountsPage />);
    await screen.findByRole("heading", { level: 1, name: "Accounts" });

    const manageInline = screen.getByTitle("Rename, reorder, or merge account groups");
    const archivedInline = screen.getByTitle("Show archived accounts");
    expect(cls(manageInline)).toContain("header-secondary");
    expect(cls(archivedInline)).toContain("header-secondary");

    const primary = screen.getByRole("link", { name: /Create Account|Add/ });
    expect(cls(primary)).not.toContain("header-secondary");

    fireEvent.click(screen.getByRole("button", { name: "More actions" }));
    const menu = await screen.findByRole("menu", undefined, { timeout: 5000 });
    expect(within(menu).getAllByRole("menuitem").map((i) => i.textContent)).toEqual(["Manage groups", "Show archived"]);
  });

  it("Manage groups (inline and overflow) links to /accounts/groups; overflow Show archived still toggles", async () => {
    render(<AccountsPage />);
    await screen.findByRole("heading", { level: 1, name: "Accounts" });
    expect(screen.getByTitle("Rename, reorder, or merge account groups").closest("a")?.getAttribute("href")).toBe("/accounts/groups");

    fireEvent.click(screen.getByRole("button", { name: "More actions" }));
    const menu = within(await screen.findByRole("menu", undefined, { timeout: 5000 }));
    expect(menu.getByText("Manage groups").closest("a")?.getAttribute("href")).toBe("/accounts/groups");

    // "Show archived" toggles the label to "Hide archived"
    fireEvent.click(menu.getByText("Show archived"));
    await waitFor(() => expect(screen.getByTitle("Hide archived accounts")).toBeTruthy());
  });

  it("title is the one bar style at every width (text-base semibold); no desktop title override", async () => {
    render(<AccountsPage />);
    const h1 = await screen.findByRole("heading", { level: 1, name: "Accounts" });
    expect(cls(h1)).toEqual(expect.arrayContaining(["text-base", "font-semibold"]));
    expect(cls(h1)).not.toContain("md:text-2xl");
    expect(cls(h1)).not.toContain("text-3xl/9");
    // Subtitle is shown at every size: a truncated text-xs caption.
    const sub = screen.getByText("Overview of your assets, liabilities, and net worth");
    expect(cls(sub)).toEqual(expect.arrayContaining(["block", "text-xs", "truncate"]));
    expect(cls(sub)).not.toContain("hidden");
    expect(cls(sub)).not.toContain("header-secondary");
  });
});
