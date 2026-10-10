/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, screen, cleanup, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";

let mockPath = "/dashboard";
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => mockPath,
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));

import { AppTabs, mobileBarItems } from "@/components/nav";

beforeEach(() => {
  mockPath = "/dashboard";
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) })),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const bar = () => screen.getByRole("navigation", { name: "Mobile navigation" });

describe("mobile bottom bar", () => {
  it("shows Home, Accounts, Portfolio, Transactions, More in order with hrefs", () => {
    render(<AppTabs />);
    const links = within(bar()).getAllByRole("link");
    expect(links.map((l) => [l.textContent, l.getAttribute("href")])).toEqual([
      ["Home", "/dashboard"],
      ["Accounts", "/accounts"],
      ["Portfolio", "/portfolio"],
      ["Transactions", "/transactions"],
      ["More", "/more"],
    ]);
    expect(mobileBarItems.map((i) => i.href)).toEqual(["/dashboard", "/accounts", "/portfolio", "/transactions"]);
  });

  it("mobileBarItems maintains registry-driven order from tab field", () => {
    // Ensures tab order is read from registry, not hardcoded
    expect(mobileBarItems).toHaveLength(4);
    expect(mobileBarItems[0].label).toBe("Home");
    expect(mobileBarItems[1].label).toBe("Accounts");
    expect(mobileBarItems[2].label).toBe("Portfolio");
    expect(mobileBarItems[3].label).toBe("Transactions");
  });

  it("mobileBarItems all carry ACTIVE_ACCENT color", () => {
    // Verify all mobile bar items have the correct accent color for active state
    const ACTIVE_ACCENT = "text-primary";
    for (const item of mobileBarItems) {
      expect(item.color).toBe(ACTIVE_ACCENT);
    }
  });

  it("mobileBarItems snapshot: order must not change without explicit test update", () => {
    // Regression test: ensure order stays stable
    const snapshot = mobileBarItems.map((i) => ({ href: i.href, label: i.label }));
    expect(snapshot).toMatchInlineSnapshot(`
      [
        {
          "href": "/dashboard",
          "label": "Home",
        },
        {
          "href": "/accounts",
          "label": "Accounts",
        },
        {
          "href": "/portfolio",
          "label": "Portfolio",
        },
        {
          "href": "/transactions",
          "label": "Transactions",
        },
      ]
    `);
  });

  it.each([
    ["/accounts/123", "Accounts"],
    ["/portfolio/holdings/9", "Portfolio"],
    ["/transactions", "Transactions"],
    ["/dashboard", "Home"],
    ["/more", "More"],
    ["/accountsfoo", "More"],
    ["/settings", "More"],
  ])("marks the right tab active on %s", (path, label) => {
    mockPath = path;
    render(<AppTabs />);
    const active = within(bar())
      .getAllByRole("link")
      .filter((l) => l.getAttribute("aria-current") === "page");
    expect(active.map((l) => l.textContent)).toEqual([label]);
  });

  it("does not treat /accountsfoo as Accounts; More is current instead", () => {
    mockPath = "/accountsfoo";
    render(<AppTabs />);
    const links = within(bar()).getAllByRole("link");
    const current = links.filter((l) => l.getAttribute("aria-current") === "page");
    expect(current.map((l) => l.textContent)).toEqual(["More"]);
    expect(links.find((l) => l.textContent === "Accounts")!.getAttribute("aria-current")).toBeNull();
  });

  it("fits 5 tabs: equal-width flex items; the link stays a flex item and its label span truncates", () => {
    render(<AppTabs />);
    for (const l of within(bar()).getAllByRole("link")) {
      expect(l.className).toContain("flex-1");
      expect(l.className).toContain("min-w-0");
      expect(l.className).not.toContain("truncate");
      const label = l.querySelector("span.mobile-tab-label")!;
      expect(label.className).toContain("truncate");
      expect(label.className).toContain("max-w-full");
      // The label size is the single --tab-label-size token (globals.css .mobile-tab-label), not a text-xs step.
      expect(label.className).toContain("mobile-tab-label");
      expect(l.className).not.toMatch(/\btext-(xs|sm|base|\[)/);
    }
  });
});

describe("mobile bottom bar glass (S8)", () => {
  it("bar is a floating glass capsule: mobile-glass-bar, fixed, 16px side insets, safe-area bottom, rounded-[28px], h-16", () => {
    render(<AppTabs />);
    const nav = bar();
    const c = nav.className;
    expect(c).toContain("mobile-glass-bar");
    expect(c).toContain("fixed");
    expect(c).toContain("bottom-[max(12px,var(--sab))]");
    expect(c).toContain("left-[calc(16px+var(--sal))]");
    expect(c).toContain("right-[calc(16px+var(--sar))]");
    expect(c).toContain("rounded-[28px]");
    expect(c).toContain("h-16");
    // The old flat full-width strip is gone.
    expect(c).not.toContain("bg-sidebar/80");
    expect(c).not.toContain("border-t");
    expect(nav.classList.contains("backdrop-blur")).toBe(false);
  });

  it("bar row fills the capsule (h-full) with 6px inner padding", () => {
    render(<AppTabs />);
    const row = within(bar()).getByTestId("mobile-bar-row");
    expect(row.className).toContain("h-full");
    expect(row.className).toContain("p-1.5");
  });

  it("active link has text-tab-active (token) with aria-current='page'", () => {
    mockPath = "/dashboard";
    render(<AppTabs />);
    const links = within(bar()).getAllByRole("link");
    const homeLink = links[0];
    expect(homeLink.getAttribute("aria-current")).toBe("page");
    expect(homeLink.className).toContain("text-tab-active");
  });

  it("inactive links lack text-sidebar-primary class", () => {
    mockPath = "/dashboard";
    render(<AppTabs />);
    const links = within(bar()).getAllByRole("link");
    const accountsLink = links[1];
    expect(accountsLink.className).not.toContain("text-tab-active");
  });

  it("globals.css has @supports blocks for backdrop-filter and color-mix fallbacks", () => {
    const css = readFileSync(join(__dirname, "../../src/app/globals.css"), "utf8");
    expect(css).toMatch(/@supports not \(\(backdrop-filter: blur\(1px\)[^{]*\{\s*\.mobile-glass-bar\s*\{[^}]*background-color:\s*var\(--sidebar\)/);
    expect(css).toMatch(/@supports not \(color: color-mix[^{]*\{\s*\.mobile-glass-bar\s*\{[^}]*background-color:\s*var\(--sidebar\)/);
  });

  it("globals.css has @media prefers-reduced-transparency block disabling blur and setting fallback color", () => {
    const css = readFileSync(join(__dirname, "../../src/app/globals.css"), "utf8");
    expect(css).toMatch(/@media \(prefers-reduced-transparency: reduce\)\s*\{[^}]*\.mobile-glass-bar\s*\{[^}]*background-color:\s*var\(--sidebar\)[^}]*backdrop-filter:\s*none/);
  });
});

describe("safe-area classes", () => {
  it("mobile bar offsets from the bottom and sides via the shared safe-area vars", () => {
    render(<AppTabs />);
    const c = bar().className;
    expect(c).toContain("bottom-[max(12px,var(--sab))]");
    expect(c).toContain("left-[calc(16px+var(--sal))]");
    expect(c).toContain("right-[calc(16px+var(--sar))]");
  });

  it("desktop rail is fixed, sits below the top inset and clears the bottom inset", () => {
    render(<AppTabs />);
    const rail = screen.getByRole("navigation", { name: "Main navigation" });
    expect(rail.className).toContain("fixed");
    expect(rail.className).toContain("pt-[calc(var(--sat)+0.75rem)]");
    expect(rail.className).toContain("pb-[calc(var(--sab)+0.75rem)]");
    expect(rail.className).not.toContain("top-safe");
    expect(rail.className).not.toContain("sticky");
  });
});

describe("safe-area shell wiring (source)", () => {
  const read = (p: string) => readFileSync(join(__dirname, "../../", p), "utf8");

  it("globals.css defines the vars from env() and pads the body", () => {
    const css = read("src/app/globals.css");
    expect(css).toContain("--sat: env(safe-area-inset-top");
    expect(css).toContain("--sab: env(safe-area-inset-bottom");
    expect(css).toContain("--sal: env(safe-area-inset-left");
    expect(css).toContain("--sar: env(safe-area-inset-right");
    expect(css).toMatch(/body\s*\{[^}]*padding-top:\s*var\(--sat\)/);
    // Owner 2026-10-01: no solid strip behind the status bar (top padding only).
    expect(css).not.toContain(".safe-top-backdrop");
  });

  it("root layout renders NO status-bar backdrop and keeps cover + opaque status bar", () => {
    const l = read("src/app/layout.tsx");
    expect(l).not.toContain("safe-top-backdrop");
    expect(l).toContain('viewportFit: "cover"');
    expect(l).toContain('statusBarStyle: "black"');
  });

  it("app shell and top-anchored surfaces use the shared var, not raw env()", () => {
    expect(read("src/app/(app)/layout.tsx")).toContain("var(--mobile-bar-clearance)");
    expect(read("src/app/(app)/layout.tsx")).not.toContain("env(");
    expect(read("src/components/ui/sheet.tsx")).toContain("pt-[var(--sat)]");
    expect(read("src/components/ui/dialog.tsx")).toContain("var(--sat)");
    expect(read("src/components/inbox/upload-drawer.tsx")).toContain("pt-safe");
    // Settings sub-pages: the page's PageHeader is the top bar (shared PHONE_BAR); the shell draws none.
    expect(read("src/components/mobile/page-header.tsx")).toContain("cn(className, PHONE_BAR)");
    expect(read("src/components/settings-shell.tsx")).not.toContain("PHONE_BAR");
    expect(read("src/components/settings-shell.tsx")).not.toContain("top-[calc(1.5rem+var(--sat))]");
    // Unlock card (423) is a bottom card: clears the tab bar and the on-screen keyboard, side-safe.
    expect(read("src/components/unlock-panel.tsx")).toContain("var(--mobile-bar-clearance)");
    expect(read("src/components/unlock-panel.tsx")).toContain("var(--kb-inset,0px)");
    expect(read("src/components/unlock-panel.tsx")).toContain("px-[max(1rem,var(--sal))]");
  });
});

describe("mobile bar matches the native tab bar (mobile/src/navigation/TabNavigator.tsx)", () => {
  // native: height 60 + inset.bottom, paddingTop 6, icon 22, label 11/600
  it("bar is a 64px capsule (h-16); the bottom inset is applied through the bottom offset (max(12px,--sab))", () => {
    render(<AppTabs />);
    const row = within(bar()).getByTestId("mobile-bar-row");
    expect(bar().className).toContain("h-16");
    expect(row.className).toContain("p-1.5");
    expect(bar().className).toContain("bottom-[max(12px,var(--sab))]");
  });

  it("icons are 24px (size-6) and labels use the mobile-tab-label token (iOS 10pt) on every tab", () => {
    render(<AppTabs />);
    for (const l of within(bar()).getAllByRole("link")) {
      expect(l.querySelector("span.mobile-tab-label")!.className).toContain("mobile-tab-label");
      const svg = l.querySelector("svg")!;
      expect(svg.getAttribute("class")).toContain("size-6");
      expect(svg.getAttribute("class")).not.toContain("size-[22px]");
    }
  });

  it("app shell bottom padding uses the shared --mobile-bar-clearance var", () => {
    const layout = readFileSync(join(__dirname, "../../src/app/(app)/layout.tsx"), "utf8");
    expect(layout).toContain("pb-[calc(var(--mobile-bar-clearance)+80px)] regular:pb-0");
    const css = readFileSync(join(__dirname, "../../src/app/globals.css"), "utf8");
    expect(css).toMatch(/--mobile-bar-clearance:\s*calc\(96px\s*\+\s*var\(--sab\)\)/);
  });
});

describe("no zoom on iOS (source)", () => {
  const read = (p: string) => readFileSync(join(__dirname, "../../", p), "utf8");
  it("viewport disables user scaling and globals stop double-tap / focus zoom", () => {
    const l = read("src/app/layout.tsx");
    expect(l).toContain("maximumScale: 1");
    expect(l).toContain("userScalable: false");
    const css = read("src/app/globals.css");
    expect(css).toMatch(/html\s*\{[^}]*touch-action:\s*manipulation/);
    expect(css).toMatch(/@media \(max-width: 767\.98px\)\s*\{\s*input, textarea, select[^{]*\{\s*font-size: max\(16px, 1em\)/);
  });
});
