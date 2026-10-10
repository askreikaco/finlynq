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
import { HEADER_SECONDARY } from "@/components/mobile";

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
  it("secondary actions are inline from regular up (HEADER_SECONDARY); the primary pill stays; overflow lists them", async () => {
    render(<AccountsPage />);
    await screen.findByRole("heading", { level: 1, name: "Accounts" });

    const manageInline = screen.getByTitle("Rename, reorder, or merge account groups");
    const archivedInline = screen.getByTitle("Show archived accounts");
    expect(cls(manageInline)).toContain(HEADER_SECONDARY);
    expect(cls(archivedInline)).toContain(HEADER_SECONDARY);

    const primary = screen.getByRole("link", { name: /Create Account|Add/ });
    expect(cls(primary)).not.toContain(HEADER_SECONDARY);

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

  it("title is the one system style from regular up (text-3xl/9 extrabold); the caller's titleClassName is ignored", async () => {
    render(<AccountsPage />);
    const h1 = await screen.findByRole("heading", { level: 1, name: "Accounts" });
    expect(cls(h1)).toEqual(expect.arrayContaining(["text-3xl/9", "font-extrabold"]));
    expect(cls(h1)).not.toContain("md:text-2xl");
    // Subtitle is shown at every size: a phone caption below regular, text-sm from regular.
    const sub = screen.getByText("Overview of your assets, liabilities, and net worth");
    expect(cls(sub)).toEqual(expect.arrayContaining(["block", "max-regular:text-xs", "max-regular:truncate"]));
    expect(cls(sub)).not.toContain("hidden");
    expect(cls(sub)).not.toContain(HEADER_SECONDARY);
  });
});
