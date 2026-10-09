/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import * as React from "react";
import { render, screen, cleanup } from "@testing-library/react";

vi.mock("next/link", () => ({
  default: ({ children, href, ...p }: React.PropsWithChildren<{ href: string }>) => React.createElement("a", { href, ...p }, children),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => "/accounts" }));
vi.mock("@/components/currency-provider", () => ({ useDisplayCurrency: () => ({ displayCurrency: "VND" }) }));
vi.mock("@/components/dropdown-order-provider", () => ({ useDropdownOrder: () => <T,>(items: T[]) => items }));
vi.mock("@/components/onboarding-tips", () => ({ OnboardingTips: () => React.createElement("div", { "data-testid": "tips" }) }));
vi.mock("@/app/(app)/accounts/_components/account-dialog", () => ({ AccountDialog: () => null }));

import AccountsPage from "@/app/(app)/accounts/page";

const balances = [
  { accountId: 1, accountName: "Techcombank", accountType: "A", accountGroup: "Banks", currency: "VND", balance: 40000000, convertedBalance: 40000000 },
  { accountId: 2, accountName: "Wise USD", accountType: "A", accountGroup: "Banks", currency: "USD", balance: 100, convertedBalance: 2500000 },
];

const emptyBalances: typeof balances = [];

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => ({ ok: true, json: async () => (String(url).includes("/api/dashboard") ? { balances } : {}) })));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("Accounts page: OnboardingTips DOM order", () => {
  it("populated state: PageHeader h1 precedes OnboardingTips, and net-worth-hero (if present) follows tips", async () => {
    render(<AccountsPage />);
    const h1 = await screen.findByRole("heading", { level: 1, name: "Accounts" });
    const tips = await screen.findByTestId("tips");

    // h1 should precede tips in the DOM tree
    const position = h1.compareDocumentPosition(tips);
    expect(position & Node.DOCUMENT_POSITION_FOLLOWING).toBe(Node.DOCUMENT_POSITION_FOLLOWING);

    // Check if net-worth-hero element exists and if so, it should follow tips
    const hero = document.querySelector("[data-slot=net-worth-hero]");
    if (hero) {
      const tipsPosition = tips.compareDocumentPosition(hero);
      expect(tipsPosition & Node.DOCUMENT_POSITION_FOLLOWING).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    }
  });

  it("empty state: PageHeader h1 precedes OnboardingTips, and tips precede empty-state element", async () => {
    // Override fetch for empty state
    vi.stubGlobal("fetch", vi.fn(async (url: string) => ({ ok: true, json: async () => (String(url).includes("/api/dashboard") ? { balances: emptyBalances } : {}) })));

    render(<AccountsPage />);
    const h1 = await screen.findByRole("heading", { level: 1, name: "Accounts" });
    const tips = await screen.findByTestId("tips");

    // h1 should precede tips
    const position = h1.compareDocumentPosition(tips);
    expect(position & Node.DOCUMENT_POSITION_FOLLOWING).toBe(Node.DOCUMENT_POSITION_FOLLOWING);

    // Find the empty state element (contains "No accounts yet" text)
    const emptyState = screen.getByText("No accounts yet").closest("div");
    expect(emptyState).toBeTruthy();

    // Tips should precede the empty-state element
    if (emptyState) {
      const tipsPosition = tips.compareDocumentPosition(emptyState);
      expect(tipsPosition & Node.DOCUMENT_POSITION_FOLLOWING).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    }
  });
});
