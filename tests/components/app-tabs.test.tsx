/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, screen, within, cleanup, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";

let mockPath = "/dashboard";
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => mockPath,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

import { AppTabs, mobileBarItems } from "@/components/nav";
import { getRailExtrasSorted } from "@/lib/nav-config";

const EXPECTED_TABS = [
  ["Home", "/dashboard"],
  ["Accounts", "/accounts"],
  ["Portfolio", "/portfolio"],
  ["Transactions", "/transactions"],
  ["More", "/more"],
];

const bar = () => screen.getByRole("navigation", { name: "Mobile navigation" });
const rail = () => screen.getByRole("navigation", { name: "Main navigation" });
// The rail renders every item in the DOM; CSS decides what shows. Tablet (regular, not wide) hides
// `hidden` items (desktop-only extras) and the desktop More (`hidden wide:flex`). Desktop (wide) hides
// `wide:hidden` items (the tablet More). `visibleLinks` mirrors that, so tests read what the user sees.
type Bp = "tablet" | "wide";
const visibleLinks = (nav: HTMLElement, bp: Bp) =>
  within(nav)
    .queryAllByRole("link")
    .filter((l) => (bp === "wide" ? !l.classList.contains("wide:hidden") : !l.classList.contains("hidden")));
const tabsOf = (nav: HTMLElement, bp?: Bp) =>
  (bp ? visibleLinks(nav, bp) : within(nav).getAllByRole("link")).map((l) => [l.textContent, l.getAttribute("href")]);
const currentOf = (nav: HTMLElement, bp?: Bp) =>
  (bp ? visibleLinks(nav, bp) : within(nav).queryAllByRole("link")).filter((l) => l.getAttribute("aria-current") === "page").map((l) => l.textContent);
const queryBar = () => screen.queryByRole("navigation", { name: "Mobile navigation" });

const APP_TABS_SRC = readFileSync(join(__dirname, "../../src/components/nav.tsx"), "utf8");
const LAYOUT_SRC = readFileSync(join(__dirname, "../../src/app/(app)/layout.tsx"), "utf8");

beforeEach(() => {
  mockPath = "/dashboard";
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, json: async () => [] })));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("one tab list, two layouts", () => {
  it("bar shows the 4 mobile tabs then More (Home, Accounts, Portfolio, Transactions, More)", () => {
    render(<AppTabs />);
    expect(tabsOf(bar())).toEqual(EXPECTED_TABS);
  });

  it("rail shows the same first 4 tabs in the same order as the bar", () => {
    render(<AppTabs />);
    expect(tabsOf(rail(), "tablet").slice(0, 4)).toEqual(EXPECTED_TABS.slice(0, 4));
    expect(tabsOf(rail(), "wide").slice(0, 4)).toEqual(EXPECTED_TABS.slice(0, 4));
  });

  it("the tab list is the registry mobileBar order plus More", () => {
    expect(mobileBarItems.map((i) => i.href)).toEqual(["/dashboard", "/accounts", "/portfolio", "/transactions"]);
  });

  it("rail labels use the single --tab-label-size token class (mobile-tab-label)", () => {
    render(<AppTabs />);
    for (const l of within(rail()).getAllByRole("link")) {
      expect(l.querySelector("span.mobile-tab-label")).not.toBeNull();
    }
  });
});

describe("visibility by viewport (regular: is a viewport query, 40rem)", () => {
  it("compact bar is hidden from regular up (regular:hidden), never md:hidden", () => {
    render(<AppTabs />);
    expect(bar().className).toContain("regular:hidden");
    expect(bar().className).not.toMatch(/(^|\s)(max-)?md:/);
  });

  it("rail carries data-testid app-rail (visual harness contract)", () => {
    render(<AppTabs />);
    expect(rail().getAttribute("data-testid")).toBe("app-rail");
  });

  it("rail is hidden below regular and flex from regular up (hidden regular:flex)", () => {
    render(<AppTabs />);
    const cls = rail().className.split(/\s+/);
    expect(cls).toContain("hidden");
    expect(cls).toContain("regular:flex");
    expect(cls).toContain("fixed");
    expect(rail().className).not.toMatch(/(^|\s)(max-)?md:/);
  });

  it("rail is fixed, full height, 80px plus safe-area left, and never inside main", () => {
    render(<AppTabs />);
    const c = rail().className;
    expect(c).toContain("inset-y-0");
    expect(c).toContain("left-0");
    expect(c).toContain("w-[calc(5rem+var(--sal))]");
    expect(c).toContain("pt-[calc(var(--sat)+0.75rem)]");
    expect(c).toContain("pb-[calc(var(--sab)+0.75rem)]");
    expect(c).toContain("z-50");
  });

  it("rail tab targets are at least 44px tall (min-h-14 = 56px)", () => {
    render(<AppTabs />);
    for (const l of within(rail()).getAllByRole("link")) {
      expect(l.className).toContain("min-h-14");
    }
  });

  it("app shell clears the rail on the left and drops bottom clearance from regular up", () => {
    expect(LAYOUT_SRC).toContain("regular:pl-[calc(5rem+var(--sal))]");
    expect(LAYOUT_SRC).toContain("regular:pb-0");
    expect(LAYOUT_SRC).toContain("pb-[calc(var(--mobile-bar-clearance)+16px)] regular:pb-0");
    expect(LAYOUT_SRC).not.toMatch(/(^|\s)md:(pb|pl)-/);
  });
});

describe("no sidebar markers remain", () => {
  it("no collapse or expand control", () => {
    render(<AppTabs />);
    expect(screen.queryByRole("button", { name: /collapse|expand/i })).toBeNull();
    expect(screen.queryByLabelText(/collapse sidebar|expand sidebar/i)).toBeNull();
  });

  it("no buttons at all in either layout (no group headers, no admin toggle, no account switcher)", () => {
    render(<AppTabs />);
    expect(within(rail()).queryAllByRole("button")).toHaveLength(0);
    expect(within(bar()).queryAllByRole("button")).toHaveLength(0);
    expect(screen.queryByRole("button", { name: /account menu/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /^admin$/i })).toBeNull();
  });

  it("no sidebar group headers in the rail", () => {
    render(<AppTabs />);
    for (const g of ["Tracking", "Wealth", "Analysis", "Planning", "Tools", "Admin", "Settings"]) {
      expect(rail().textContent).not.toContain(g);
    }
  });

  it("the source has no sidebar state (collapse, group open, admin pref) and no AccountSwitcher", () => {
    expect(APP_TABS_SRC).not.toContain("pf-sidebar-collapsed");
    expect(APP_TABS_SRC).not.toContain("nav.adminOpen");
    expect(APP_TABS_SRC).not.toContain("AccountSwitcher");
    expect(APP_TABS_SRC).not.toMatch(/\bmd:/);
    expect(APP_TABS_SRC).not.toMatch(/\bmax-md:/);
  });
});

describe("active tab logic (same rule in both layouts)", () => {
  it.each([
    ["/dashboard", "Home"],
    ["/accounts/5", "Accounts"],
    ["/portfolio/dividends", "Portfolio"],
    ["/transactions", "Transactions"],
    ["/more", "More"],
    ["/settings/general", "More"],
    ["/admin/system", "More"],
    ["/accountsfoo", "More"],
  ])("at %s the current tab is %s in both layouts, exactly one", (path, label) => {
    mockPath = path;
    render(<AppTabs />);
    expect(currentOf(bar())).toEqual([label]);
    expect(currentOf(rail(), "tablet")).toEqual([label]);
    expect(currentOf(rail(), "wide")).toEqual([label]);
  });

  it("active tab carries the glass pill and the active token; inactive uses the inactive token", () => {
    mockPath = "/accounts";
    render(<AppTabs />);
    const railAccounts = within(rail()).getByRole("link", { name: "Accounts" });
    const railHome = within(rail()).getByRole("link", { name: "Home" });
    expect(railAccounts.className).toContain("mobile-glass-pill");
    expect(railAccounts.className).toContain("text-tab-active");
    expect(railHome.className).toContain("text-tab-inactive");
    expect(railHome.className).not.toContain("mobile-glass-pill");
  });

  it("full-screen entry route hides the bar but keeps the rail, which marks its section", () => {
    mockPath = "/transactions/new";
    render(<AppTabs />);
    expect(queryBar()).toBeNull();
    expect(currentOf(rail(), "tablet")).toEqual(["Transactions"]);
    expect(currentOf(rail(), "wide")).toEqual(["Transactions"]);
  });

  it("portfolio operation form hides the bar; the rail stays", () => {
    mockPath = "/portfolio/new/buy";
    render(<AppTabs />);
    expect(queryBar()).toBeNull();
    expect(currentOf(rail(), "tablet")).toEqual(["Portfolio"]);
    expect(currentOf(rail(), "wide")).toEqual(["Portfolio"]);
  });
});

describe("unread dot on More (both layouts)", () => {
  it("appears on the More tab of both layouts when there are unread announcements", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => ({
      ok: true,
      status: 200,
      json: async () => (url.startsWith("/api/announcements") ? [{ id: 1, read: false }] : []),
    })));
    render(<AppTabs />);
    // The rail has two More links (tablet and desktop variant); the one visible at a breakpoint carries the dot.
    for (const bp of ["tablet", "wide"] as const) {
      await waitFor(() => expect(visibleLinks(rail(), bp).flatMap((a) => [...a.querySelectorAll('[data-testid="more-unread-dot"]')])).toHaveLength(1));
    }
    for (const nav of [bar(), rail()]) {
      // The dot is aria-hidden: the More link carries the text alternative in both layouts.
      const moreLink = visibleLinks(nav, "wide").find((a) => a.getAttribute("href") === "/more")!;
      expect(moreLink.getAttribute("aria-label") ?? moreLink.textContent).toMatch(/More/);
      expect(moreLink.querySelector('[data-testid="more-unread-dot"]')).not.toBeNull();
    }
  });

  it("does not appear on any other tab", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, json: async () => [{ unread: true }] })));
    render(<AppTabs />);
    await waitFor(() => expect(bar().querySelectorAll('[data-testid="more-unread-dot"]')).toHaveLength(1));
    for (const l of within(bar()).getAllByRole("link").filter((a) => !a.textContent?.startsWith("More"))) {
      expect(l.querySelector('[data-testid="more-unread-dot"]')).toBeNull();
    }
  });
});

describe("unread badges come from the shared store (nav-unread)", () => {
  it("AppTabs asks the store once per render: one announcements request and one feedback request", async () => {
    const fn = vi.fn(async (_url: string) => ({ ok: true, status: 200, json: async () => [] }));
    vi.stubGlobal("fetch", fn);
    render(<AppTabs />);
    await waitFor(() => expect(fn).toHaveBeenCalled());
    const urls = fn.mock.calls.map((c) => c[0]);
    expect(urls.filter((u) => u === "/api/announcements")).toHaveLength(1);
    expect(urls.filter((u) => u === "/api/feedback")).toHaveLength(1);
  });

  it("the source reads counts from useNavUnread and keeps no fetch of its own", () => {
    expect(APP_TABS_SRC).toContain('from "@/components/nav-unread"');
    expect(APP_TABS_SRC).toContain("useNavUnread()");
    expect(APP_TABS_SRC).not.toContain("fetch(");
  });
});

describe("extended rail: tablet 9 tabs + More, desktop 14 tabs + More", () => {
  const RAIL_WIDE = ["Home", "Accounts", "Portfolio", "Transactions", "Budgets", "Spending by category", "Reports", "Goals", "Loans & Debt", "Subscriptions", "Scenarios", "FIRE Calculator", "Import", "Tax", "More"];
  const RAIL_TABLET = RAIL_WIDE.slice(0, 9).concat("More");

  it("the rail DOM holds 15 desktop items in order, More last (plus the tablet More variant)", () => {
    render(<AppTabs />);
    const wide = visibleLinks(rail(), "wide").map((l) => l.textContent);
    expect(wide).toEqual(RAIL_WIDE);
    expect(wide.at(-1)).toBe("More");
  });

  it("tablet shows 10 items in order: 4 mobile tabs, 5 extras, More last", () => {
    render(<AppTabs />);
    const tablet = visibleLinks(rail(), "tablet").map((l) => l.textContent);
    expect(tablet).toEqual(RAIL_TABLET);
    expect(tablet.at(-1)).toBe("More");
  });

  it("the bar still has exactly 5 links (4 mobile tabs + More)", () => {
    render(<AppTabs />);
    expect(within(bar()).getAllByRole("link")).toHaveLength(5);
  });

  it("items 5-9 carry no wide-only hiding class; items 10-14 carry hidden wide:flex", () => {
    render(<AppTabs />);
    const links = within(rail()).queryAllByRole("link");
    // 0-3 mobile tabs, 4-8 tablet extras (5 items), 9 tablet More, 10-14 desktop-only extras, 15 desktop More.
    for (const i of [0, 1, 2, 3, 4, 5, 6, 7, 8]) {
      expect(links[i].className.split(" ")).not.toContain("hidden");
    }
    for (const i of [10, 11, 12, 13, 14]) {
      expect(links[i].className).toContain("hidden wide:flex");
    }
    expect(links[9].className).toContain("wide:hidden");
    expect(links[15].className).toContain("hidden wide:flex");
  });

  it("the extras are registry sidebar entries with rail order 5..14 (no extra is a mobileBar tab)", () => {
    const ids = getRailExtrasSorted().map((e) => e.path);
    expect(ids).toEqual(["/budgets", "/categories", "/reports", "/goals", "/loans", "/subscriptions", "/scenarios", "/fire", "/import", "/tax"]);
    for (const e of getRailExtrasSorted()) {
      expect(e.surfaces).toContain("sidebar");
      expect(e.surfaces).not.toContain("mobileBar");
    }
  });

  it("an extra page's own route marks its tab active at desktop and More is not active there", () => {
    mockPath = "/fire";
    render(<AppTabs />);
    expect(currentOf(rail(), "wide")).toEqual(["FIRE Calculator"]);
    expect(currentOf(bar())).toEqual(["More"]);
  });

  it("on tablet a desktop-only page (/fire) is not in the rail, so tablet More is the current item", () => {
    mockPath = "/fire";
    render(<AppTabs />);
    expect(currentOf(rail(), "tablet")).toEqual(["More"]);
  });

  it("a tablet extra (/budgets) marks its tab active on tablet and desktop; More is not active", () => {
    mockPath = "/budgets/12";
    render(<AppTabs />);
    expect(currentOf(rail(), "tablet")).toEqual(["Budgets"]);
    expect(currentOf(rail(), "wide")).toEqual(["Budgets"]);
    expect(currentOf(bar())).toEqual(["More"]);
  });

  it("an unrelated route (/settings) marks More active in the bar, on tablet and on desktop", () => {
    mockPath = "/settings";
    render(<AppTabs />);
    expect(currentOf(bar())).toEqual(["More"]);
    expect(currentOf(rail(), "tablet")).toEqual(["More"]);
    expect(currentOf(rail(), "wide")).toEqual(["More"]);
  });

  it("More links are the same route in both variants and the rail never shows two at one breakpoint", () => {
    render(<AppTabs />);
    expect(visibleLinks(rail(), "tablet").filter((l) => l.getAttribute("href") === "/more")).toHaveLength(1);
    expect(visibleLinks(rail(), "wide").filter((l) => l.getAttribute("href") === "/more")).toHaveLength(1);
  });
});
