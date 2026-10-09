/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import * as React from "react";
import { render, screen, cleanup, within, fireEvent, waitFor } from "@testing-library/react";
import { formatCurrency } from "@/lib/currency";

vi.mock("next/link", () => ({
  default: ({ children, href, ...p }: React.PropsWithChildren<{ href: string }>) => React.createElement("a", { href, ...p }, children),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => "/accounts" }));
vi.mock("@/components/currency-provider", () => ({ useDisplayCurrency: () => ({ displayCurrency: "VND" }) }));
vi.mock("@/components/dropdown-order-provider", () => ({ useDropdownOrder: () => <T,>(items: T[]) => items }));
vi.mock("@/components/onboarding-tips", () => ({ OnboardingTips: () => null }));

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
// Group accordion items (mobile list or desktop grid) and their header parts.
const items = (root: Element) => Array.from(root.querySelectorAll("[data-slot=accordion-item]")) as HTMLElement[];
const nameOf = (item: Element) => item.querySelector("[data-testid=group-name]")?.textContent;
const totalOf = (item: Element) => item.querySelector("[data-testid=group-total]")?.textContent;
const trigger = (item: Element) => item.querySelector("[data-slot=accordion-trigger]") as HTMLElement;

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

  it("accounts are grouped by type then group; every group is expanded by default and toggles on its own", async () => {
    const list = await mobile();
    expect(cls(list)).toContain("md:hidden");
    const sections = Array.from(list.querySelectorAll("section.space-y-2 > div > h2")).map((h) => h.textContent);
    expect(sections).toEqual(expect.arrayContaining(["Assets", "Liabilities"]));
    expect(items(list).map(nameOf)).toEqual(expect.arrayContaining(["Banks", "Investments", "Credit Card"]));

    // All groups open: every account row is visible.
    for (const i of items(list)) expect(trigger(i).getAttribute("aria-expanded")).toBe("true");
    const banks = items(list).find((i) => nameOf(i) === "Banks")!;
    const links = within(banks).getAllByRole("link");
    expect(links.map((a) => a.getAttribute("href"))).toEqual(["/accounts/1", "/accounts/2"]);
    // native amount primary + converted equivalent for the USD account
    expect(within(links[1]).getByText(formatCurrency(100, "USD"))).toBeTruthy();
    expect(within(links[1]).getByText(formatCurrency(2500000, "VND"))).toBeTruthy();

    const card = items(list).find((i) => nameOf(i) === "Credit Card")!;
    const visa = within(card).getByRole("link", { name: /Visa/ });
    expect(cls(within(visa).getByText(formatCurrency(-5000000, "VND")))).toContain("text-neg");

    // Collapsing one group leaves the others open.
    fireEvent.click(trigger(banks));
    await waitFor(() => expect(trigger(banks).getAttribute("aria-expanded")).toBe("false"));
    expect(trigger(card).getAttribute("aria-expanded")).toBe("true");
  });

  it("Assets and Liabilities headers show their section total", async () => {
    const list = await mobile();
    const totals = Object.fromEntries(
      Array.from(list.querySelectorAll("section.space-y-2")).map((sec) => [
        sec.querySelector(":scope > div > h2")?.textContent,
        sec.querySelector(":scope > div > [data-testid=section-total]")?.textContent,
      ]),
    );
    expect(totals).toEqual({
      Assets: formatCurrency(40000000 + 2500000 + 10000000, "VND"),
      Liabilities: formatCurrency(-5000000, "VND"),
    });
  });

  it("each group header shows its account count (pill) and total in the display currency", async () => {
    const list = await mobile();
    const byName = Object.fromEntries(items(list).map((i) => [nameOf(i), totalOf(i)]));
    expect(byName).toEqual({
      Banks: formatCurrency(40000000 + 2500000, "VND"), // USD account counted at its converted value
      Investments: formatCurrency(10000000, "VND"),
      "Credit Card": formatCurrency(-5000000, "VND"),
    });
    const banks = items(list).find((i) => nameOf(i) === "Banks")!;
    const count = banks.querySelector("[data-testid=group-count]") as HTMLElement;
    expect(count.textContent).toBe("2");
    expect(cls(count)).toEqual(expect.arrayContaining(["rounded-full", "bg-muted"]));
  });

  it("desktop groups use the same expanded accordions, hidden below md", async () => {
    await mobile();
    const grid = document.querySelector("div.lg\\:grid-cols-2") as HTMLElement;
    const banks = items(grid).find((i) => nameOf(i) === "Banks")!;
    expect(within(banks).getAllByText("Techcombank")).toHaveLength(1);
    expect(cls(grid)).toEqual(expect.arrayContaining(["grid", "grid-cols-1", "lg:grid-cols-2", "gap-4", "max-md:hidden"]));
  });
});
