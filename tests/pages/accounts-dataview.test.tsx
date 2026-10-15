/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import * as React from "react";
import * as fs from "fs";
import * as path from "path";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import type { SizeClass } from "@/components/ui/size-class";

// Size class and session are controlled per test. Everything else is the real code.
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
vi.mock("@/components/notice/feeds", () => ({ NoticeFeed: () => null }));

import AccountsPage from "@/app/(app)/accounts/page";

const SRC = fs.readFileSync(path.resolve(__dirname, "../../src/app/(app)/accounts/page.tsx"), "utf-8");

const balances = [
  { accountId: 1, accountName: "Techcombank", accountType: "A", accountGroup: "Banks", currency: "VND", balance: 40000000, convertedBalance: 40000000 },
  { accountId: 4, accountName: "Visa", accountType: "L", accountGroup: "Credit Card", currency: "VND", balance: -5000000, convertedBalance: -5000000 },
];

let uid = 0;
beforeEach(() => {
  uid += 1;
  session.userId = `accounts-dataview-user-${uid}`;
  size.current = "compact";
  vi.stubGlobal("fetch", vi.fn(async (url: string) => ({ ok: true, json: async () => (String(url).includes("/api/dashboard") ? { balances } : {}) })));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  try { localStorage.clear(); } catch { /* storage may be unavailable */ }
});

async function mountPage() {
  render(<AccountsPage />);
  await screen.findByRole("heading", { level: 1, name: "Accounts" });
}

describe("Accounts page: a single list layout, no view toggle", () => {
  it("renders no Cards/List toggle and no DataView at any size class", async () => {
    for (const sc of ["compact", "regular", "wide"] as const) {
      size.current = sc;
      await mountPage();
      expect(screen.queryAllByRole("radiogroup", { name: "View" })).toHaveLength(0);
      expect(screen.queryAllByRole("radio")).toHaveLength(0);
      expect(document.querySelector("[data-view]")).toBeNull();
      expect(document.querySelector("[data-slot=accounts-mobile-list]")).toBeNull();
      expect(document.querySelectorAll("[data-slot=accounts-list]")).toHaveLength(1);
      cleanup();
    }
  });

  it("source has no DataView / ViewModeToggle / renderMobileSection / NetWorthHero", () => {
    expect(SRC).not.toMatch(/DataView|ViewModeToggle|renderMobileSection|\bNetWorthHero\b/);
  });
});

describe("Accounts page: summary tiles reuse the Home components", () => {
  it("one NetWorthHeroCard above exactly two MetricCards in a 2-column grid", async () => {
    await mountPage();
    expect(screen.getAllByText("Total Net Worth")).toHaveLength(1);
    expect(screen.getAllByText("Total Assets")).toHaveLength(1);
    expect(screen.getAllByText("Total Liabilities")).toHaveLength(1);
    const grid = document.querySelector("[data-slot=accounts-summary]") as HTMLElement;
    expect(grid.className).toContain("grid-cols-2");
    expect(grid.className).not.toMatch(/hidden/);
    // regular+: the two tiles dissolve into the parent's 3-column metric row (net worth + assets + liabilities)
    expect(grid.className).toContain("regular:contents");
    const row = document.querySelector("[data-slot=accounts-metrics]") as HTMLElement;
    expect(row.className).toContain("regular:grid-cols-3");
    expect(grid.querySelectorAll("[data-slot=card]").length).toBe(2);
    expect(SRC).not.toMatch(/regular:hidden|hidden regular:grid/);
    expect(SRC).toMatch(/<NetWorthHeroCard\b/);
    expect(SRC.match(/<MetricCard\b/g)).toHaveLength(2);
  });
});

describe("Accounts page: no size-class wrappers around sections", () => {
  it("no CompactOnly / FromMd and no regular:hidden pair: the Add label is one element, the summary switches by size class", () => {
    expect(SRC).not.toMatch(/<(CompactOnly|FromMd)\b/);
    expect(SRC).not.toMatch(/(?<!max-)regular:hidden|hidden regular:/);
  });

  it("the list layout is one column on a phone and carries no viewport tokens (md:/lg:/max-md:)", () => {
    const i = SRC.indexOf('data-slot="accounts-list"');
    expect(i).toBeGreaterThan(-1);
    const list = SRC.slice(i, SRC.indexOf(">", i));
    expect(list).not.toMatch(/(^|[\s"'`])(max-)?(sm|md|lg|xl|2xl):/);
    expect(list).toContain("flex-col");
    expect(list).toContain("regular:grid-cols-2");
    expect(list).not.toMatch(/(^|[\s"'`])(wide:)?grid-cols-(?!2\b)/);
  });
});
