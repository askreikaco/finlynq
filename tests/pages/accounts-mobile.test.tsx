/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import * as React from "react";
import { render, screen, cleanup, within, fireEvent, waitFor } from "@testing-library/react";
import { formatCurrency } from "@/lib/currency";
import type { SizeClass } from "@/components/ui/size-class";

// Size and session are controlled here; the page has one list layout at every size.
const size: { current: SizeClass } = { current: "compact" };
const session: { userId: string | null; ready: boolean } = { userId: null, ready: true };

vi.mock("@/components/adaptive/size-class-context", async (orig) => ({
  ...(await orig<typeof import("@/components/adaptive/size-class-context")>()),
  useAppSizeClass: () => size.current,
}));
vi.mock("@/lib/client/user-storage", async (orig) => ({
  ...(await orig<typeof import("@/lib/client/user-storage")>()),
  useSessionUserId: () => ({ userId: session.userId, ready: session.ready }),
}));

vi.mock("next/link", () => ({
  default: ({ children, href, ...p }: React.PropsWithChildren<{ href: string }>) => React.createElement("a", { href, ...p }, children),
}));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(), useRouter: () => ({ push: vi.fn() }), usePathname: () => "/accounts" }));
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

let uid = 0;
beforeEach(() => {
  uid += 1;
  // A fresh user per test: the shared view-mode store keeps the loaded user between tests.
  session.userId = `accounts-mobile-user-${uid}`;
  size.current = "compact";
  vi.stubGlobal("fetch", vi.fn(async (url: string) => ({ ok: true, json: async () => (String(url).includes("/api/dashboard") ? { balances } : {}) })));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const cls = (el: Element) => el.className.toString().split(/\s+/);
// Group accordion items (cards or list) and their header parts.
const items = (root: Element) => Array.from(root.querySelectorAll("[data-slot=accordion-item]")) as HTMLElement[];
const nameOf = (item: Element) => item.querySelector("[data-testid=group-name]")?.textContent;
const totalOf = (item: Element) => item.querySelector("[data-testid=group-total]")?.textContent;
const trigger = (item: Element) => item.querySelector("[data-slot=accordion-trigger]") as HTMLElement;

describe("Accounts page: single list layout (phone-first)", () => {
  async function list() {
    render(<AccountsPage />);
    await screen.findByRole("heading", { level: 1, name: "Accounts" });
    return document.querySelector("[data-slot=accounts-list]") as HTMLElement;
  }

  it("summary: net worth hero + two stat tiles show assets, liabilities and their sum, (no show/hide pair)", async () => {
    await list();
    const assets = 40000000 + 2500000 + 10000000;
    expect(screen.getAllByText(formatCurrency(assets, "VND")).length).toBeGreaterThan(0);
    expect(screen.getAllByText(formatCurrency(-5000000, "VND")).length).toBeGreaterThan(0);
    expect(screen.getAllByText(formatCurrency(assets - 5000000, "VND")).length).toBeGreaterThan(0);
    expect(document.querySelector("[data-slot=net-worth-hero]")).toBeNull();
  });

  it("accounts are grouped by type then group; every group is expanded by default and toggles on its own", async () => {
    const root = await list();
    expect(root.closest("[data-view]")).toBeNull();
    const sections = Array.from(root.querySelectorAll("h2")).map((h) => h.textContent);
    expect(sections).toEqual(expect.arrayContaining(["Assets", "Liabilities"]));
    expect(items(root).map(nameOf)).toEqual(expect.arrayContaining(["Banks", "Investments", "Credit Card"]));

    for (const i of items(root)) expect(trigger(i).getAttribute("aria-expanded")).toBe("true");
    const banks = items(root).find((i) => nameOf(i) === "Banks")!;
    const links = within(banks).getAllByRole("link");
    expect(links.map((a) => a.getAttribute("href"))).toEqual(["/accounts/1", "/accounts/2"]);
    expect(within(links[1]).getByText(formatCurrency(100, "USD"))).toBeTruthy();
    expect(within(links[1]).getByText(formatCurrency(2500000, "VND"))).toBeTruthy();

    const card = items(root).find((i) => nameOf(i) === "Credit Card")!;
    expect(within(card).getByRole("link", { name: /Visa/ })).toBeTruthy();

    fireEvent.click(trigger(banks));
    await waitFor(() => expect(trigger(banks).getAttribute("aria-expanded")).toBe("false"));
    expect(trigger(card).getAttribute("aria-expanded")).toBe("true");
  });

  it("Assets and Liabilities headers show their section total", async () => {
    const root = await list();
    const totals = Array.from(root.querySelectorAll("[data-testid=section-total]")).map((e) => e.textContent);
    expect(totals).toEqual([
      formatCurrency(40000000 + 2500000 + 10000000, "VND"),
      formatCurrency(-5000000, "VND"),
    ]);
  });

  it("each group header shows its account count (pill) and total in the display currency", async () => {
    const root = await list();
    const byName = Object.fromEntries(items(root).map((i) => [nameOf(i), totalOf(i)]));
    expect(byName).toEqual({
      Banks: formatCurrency(40000000 + 2500000, "VND"),
      Investments: formatCurrency(10000000, "VND"),
      "Credit Card": formatCurrency(-5000000, "VND"),
    });
    const banks = items(root).find((i) => nameOf(i) === "Banks")!;
    const count = banks.querySelector("[data-testid=group-count]") as HTMLElement;
    expect(count.textContent).toBe("2");
    expect(cls(count)).toEqual(expect.arrayContaining(["rounded-full", "bg-muted"]));
  });

  it("the grid is one column on a phone and two from the wide size class", async () => {
    const grid = await list();
    expect(cls(grid)).toEqual(expect.arrayContaining(["grid", "grid-cols-1", "wide:grid-cols-2", "gap-4"]));
  });
});
