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
vi.mock("@/components/notice/feeds", () => ({ NoticeFeed: () => null }));

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
  it("the bar's secondary group is More only here (Manage groups lives in it); the primary stays; no inline duplicate", async () => {
    render(<AccountsPage />);
    await screen.findByRole("heading", { level: 1, name: "Accounts" });

    // Manage groups is a More item only: no hidden inline duplicate in the bar.
    expect(screen.queryByTitle("Rename, reorder, or merge account groups")).toBeNull();
    // Archived accounts are a filter now (funnel icon -> filter page), not a header action.
    expect(screen.queryByTitle("Show archived accounts")).toBeNull();

    const primary = screen.getByRole("link", { name: /Create Account|Add/ });
    expect(primary.getAttribute("data-slot")).toBe("topbar-primary");

    fireEvent.click(screen.getByRole("button", { name: "More actions" }));
    const menu = await screen.findByRole("menu", undefined, { timeout: 5000 });
    expect(within(menu).getAllByRole("menuitem").map((i) => i.textContent)).toEqual(["Manage groups", "Customize cards"]);
  });

  it("Manage groups links to /accounts/groups", async () => {
    render(<AccountsPage />);
    await screen.findByRole("heading", { level: 1, name: "Accounts" });

    fireEvent.click(screen.getByRole("button", { name: "More actions" }));
    const menu = within(await screen.findByRole("menu", undefined, { timeout: 5000 }));
    expect(menu.getByText("Manage groups").closest("a")?.getAttribute("href")).toBe("/accounts/groups");
  });

  it("title is the one bar style at every width (text-base semibold); no desktop title override", async () => {
    render(<AccountsPage />);
    const h1 = await screen.findByRole("heading", { level: 1, name: "Accounts" });
    expect(cls(h1)).toEqual(expect.arrayContaining(["text-base", "font-semibold"]));
    expect(cls(h1)).not.toContain("md:text-2xl");
    expect(cls(h1)).not.toContain("text-3xl/9");
    // No subtitle line: the help text is only in the (i) InfoTip.
    expect(screen.queryByText("Overview of your assets, liabilities, and net worth")).toBeNull();
    expect(screen.getByRole("button", { name: "About Accounts" })).toBeTruthy();
  });
});
