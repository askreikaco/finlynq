/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import * as React from "react";
import { render, screen, cleanup, within } from "@testing-library/react";
import { formatCurrency } from "@/lib/currency";

vi.mock("next/link", () => ({
  default: ({ children, href, ...p }: React.PropsWithChildren<{ href: string }>) => React.createElement("a", { href, ...p }, children),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => "/accounts" }));
vi.mock("@/components/currency-provider", () => ({ useDisplayCurrency: () => ({ displayCurrency: "VND" }) }));
vi.mock("@/components/dropdown-order-provider", () => ({ useDropdownOrder: () => <T,>(items: T[]) => items }));
vi.mock("@/components/onboarding-tips", () => ({ OnboardingTips: () => null }));
vi.mock("@/app/(app)/accounts/_components/account-dialog", () => ({ AccountDialog: () => null }));
vi.mock("@/app/(app)/accounts/_components/manage-groups-dialog", () => ({ ManageGroupsDialog: () => null }));

import AccountsPage from "@/app/(app)/accounts/page";

const balances = [
  { accountId: 1, accountName: "Techcombank", accountType: "A", accountGroup: "Banks", currency: "VND", balance: 40000000, convertedBalance: 40000000 },
  { accountId: 2, accountName: "Wise USD", accountType: "A", accountGroup: "Banks", currency: "USD", balance: 100, convertedBalance: 2500000 },
  { accountId: 3, accountName: "TCBS", accountType: "A", accountGroup: "Investments", currency: "VND", balance: 10000000, convertedBalance: 10000000, isInvestment: true },
  { accountId: 4, accountName: "Visa", accountType: "L", accountGroup: "Credit Card", currency: "VND", balance: -5000000, convertedBalance: -5000000 },
];

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => ({ ok: true, json: async () => (String(url).includes("/api/dashboard") ? { balances } : {}) })));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const cls = (el: Element) => el.className.toString().split(/\s+/);

describe("Accounts page below md", () => {
  async function mobile() {
    render(<AccountsPage />);
    await screen.findByRole("heading", { level: 1, name: "Accounts" });
    return document.querySelector("[data-slot=accounts-mobile-list]") as HTMLElement;
  }

  it("net worth hero: assets, liabilities and their sum (desktop stat cards hidden below md)", async () => {
    await mobile();
    const hero = document.querySelector("[data-slot=net-worth-hero]") as HTMLElement;
    expect(hero.closest("div.md\\:hidden")).not.toBeNull();
    const assets = 40000000 + 2500000 + 10000000;
    expect(within(hero).getByText(formatCurrency(assets, "VND"))).toBeTruthy();
    expect(within(hero).getByText(formatCurrency(-5000000, "VND"))).toBeTruthy();
    expect(within(hero).getByText(formatCurrency(assets - 5000000, "VND"))).toBeTruthy();
    // original two stat cards still there for desktop, hidden below md
    const desktopStats = screen.getByText("Total Assets").closest("div.grid") as HTMLElement;
    expect(cls(desktopStats)).toContain("max-md:hidden");
  });

  it("accounts are grouped by type then group, each an AccountRow linking to /accounts/[id]", async () => {
    const list = await mobile();
    expect(cls(list)).toContain("md:hidden");
    const sections = Array.from(list.querySelectorAll("section.space-y-2 > h2")).map((h) => h.textContent);
    expect(sections).toEqual(expect.arrayContaining(["Assets", "Liabilities"]));
    const groups = Array.from(list.querySelectorAll("[data-slot=section-card] > [data-slot=section-label]")).map((h) => h.textContent);
    expect(groups).toEqual(expect.arrayContaining(["Banks", "Investments", "Credit Card"]));

    const banks = Array.from(list.querySelectorAll("[data-slot=section-card]")).find((c) => c.querySelector("[data-slot=section-label]")?.textContent === "Banks") as HTMLElement;
    const links = within(banks).getAllByRole("link");
    expect(links.map((a) => a.getAttribute("href"))).toEqual(["/accounts/1", "/accounts/2"]);
    // native amount primary + converted equivalent for the USD account
    expect(within(links[1]).getByText(formatCurrency(100, "USD"))).toBeTruthy();
    expect(within(links[1]).getByText(formatCurrency(2500000, "VND"))).toBeTruthy();

    const visa = within(list).getByRole("link", { name: /Visa/ });
    expect(cls(within(visa).getByText(formatCurrency(-5000000, "VND")))).toContain("text-neg");
  });

  it("desktop list markup is untouched, just hidden below md", async () => {
    await mobile();
    const grid = document.querySelector("div.lg\\:grid-cols-2") as HTMLElement;
    expect(within(grid).getAllByText("Techcombank")).toHaveLength(1);
    expect(cls(grid)).toEqual(expect.arrayContaining(["grid", "grid-cols-1", "lg:grid-cols-2", "gap-4", "max-md:hidden"]));
  });
});
