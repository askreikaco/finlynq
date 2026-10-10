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
  usePathname: () => mockPath,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

import { AppTabs, mobileBarItems } from "@/components/nav";

const EXPECTED_TABS = [
  ["Home", "/dashboard"],
  ["Accounts", "/accounts"],
  ["Portfolio", "/portfolio"],
  ["Transactions", "/transactions"],
  ["More", "/more"],
];

const bar = () => screen.getByRole("navigation", { name: "Mobile navigation" });
const rail = () => screen.getByRole("navigation", { name: "Main navigation" });
const tabsOf = (nav: HTMLElement) => within(nav).getAllByRole("link").map((l) => [l.textContent, l.getAttribute("href")]);
const currentOf = (nav: HTMLElement) =>
  within(nav).queryAllByRole("link").filter((l) => l.getAttribute("aria-current") === "page").map((l) => l.textContent);
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
  it("bar and rail render the same hrefs, labels and order (Home, Accounts, Portfolio, Transactions, More)", () => {
    render(<AppTabs />);
    expect(tabsOf(bar())).toEqual(EXPECTED_TABS);
    expect(tabsOf(rail())).toEqual(EXPECTED_TABS);
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
    expect(LAYOUT_SRC).toContain("pb-[calc(var(--mobile-bar-clearance)+80px)] regular:pb-0");
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
    expect(currentOf(rail())).toEqual([label]);
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
    expect(currentOf(rail())).toEqual(["Transactions"]);
  });

  it("portfolio operation form hides the bar; the rail stays", () => {
    mockPath = "/portfolio/new/buy";
    render(<AppTabs />);
    expect(queryBar()).toBeNull();
    expect(currentOf(rail())).toEqual(["Portfolio"]);
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
    for (const nav of [bar(), rail()]) {
      await waitFor(() => expect(nav.querySelectorAll('[data-testid="more-unread-dot"]')).toHaveLength(1));
      // The dot is aria-hidden: the More link carries the text alternative in both layouts.
      const moreLink = within(nav).getByRole("link", { name: "More, has unread items" });
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
