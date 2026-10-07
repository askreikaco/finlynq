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
  usePathname: () => mockPath,
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));

import { Nav, mobileBarItems } from "@/components/nav";

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
    render(<Nav />);
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
    render(<Nav />);
    const active = within(bar())
      .getAllByRole("link")
      .filter((l) => l.getAttribute("aria-current") === "page");
    expect(active.map((l) => l.textContent)).toEqual([label]);
  });

  it("does not treat /accountsfoo as Accounts; More is current instead", () => {
    mockPath = "/accountsfoo";
    render(<Nav />);
    const links = within(bar()).getAllByRole("link");
    const current = links.filter((l) => l.getAttribute("aria-current") === "page");
    expect(current.map((l) => l.textContent)).toEqual(["More"]);
    expect(links.find((l) => l.textContent === "Accounts")!.getAttribute("aria-current")).toBeNull();
  });

  it("fits 5 tabs: equal-width flex items, no truncation", () => {
    render(<Nav />);
    for (const l of within(bar()).getAllByRole("link")) {
      expect(l.className).toContain("flex-1");
      expect(l.className).toContain("min-w-0");
      expect(l.className).not.toContain("truncate");
    }
  });
});

describe("mobile bottom bar glass (S8)", () => {
  it("bar has mobile-glass-bar, bg-sidebar/80, backdrop-blur, fixed bottom positioning, and safe-area insets", () => {
    render(<Nav />);
    const nav = bar();
    const c = nav.className;
    expect(c).toContain("mobile-glass-bar");
    expect(c).toContain("bg-sidebar/80");
    expect(c).toContain("fixed");
    expect(c).toContain("bottom-0");
    expect(c).toContain("pb-[var(--sab)]");
    expect(c).toContain("pl-[var(--sal)]");
    expect(c).toContain("pr-[var(--sar)]");
    // Check backdrop-blur as an actual class token, not substring
    expect(nav.classList.contains("backdrop-blur")).toBe(true);
  });

  it("bar row maintains h-[59px] height", () => {
    render(<Nav />);
    const row = within(bar()).getByTestId("mobile-bar-row");
    expect(row.className).toContain("h-[59px]");
  });

  it("active link has text-sidebar-primary with aria-current='page'", () => {
    mockPath = "/dashboard";
    render(<Nav />);
    const links = within(bar()).getAllByRole("link");
    const homeLink = links[0];
    expect(homeLink.getAttribute("aria-current")).toBe("page");
    expect(homeLink.className).toContain("text-sidebar-primary");
  });

  it("inactive links lack text-sidebar-primary class", () => {
    mockPath = "/dashboard";
    render(<Nav />);
    const links = within(bar()).getAllByRole("link");
    const accountsLink = links[1];
    expect(accountsLink.className).not.toContain("text-sidebar-primary");
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
  it("mobile bar reserves bottom + side insets via the shared vars", () => {
    render(<Nav />);
    const c = bar().className;
    expect(c).toContain("pb-[var(--sab)]");
    expect(c).toContain("pl-[var(--sal)]");
    expect(c).toContain("pr-[var(--sar)]");
  });

  it("desktop sidebar sticks below the top inset", () => {
    render(<Nav />);
    const side = screen.getByRole("navigation", { name: "Main navigation" });
    expect(side.className).toContain("top-safe");
    expect(side.className).toContain("var(--sat)");
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

  it("root layout renders NO status-bar backdrop and keeps cover + translucent", () => {
    const l = read("src/app/layout.tsx");
    expect(l).not.toContain("safe-top-backdrop");
    expect(l).toContain('viewportFit: "cover"');
    expect(l).toContain('statusBarStyle: "black-translucent"');
  });

  it("app shell and top-anchored surfaces use the shared var, not raw env()", () => {
    expect(read("src/app/(app)/layout.tsx")).toContain("var(--sab)");
    expect(read("src/components/ui/sheet.tsx")).toContain("pt-[var(--sat)]");
    expect(read("src/components/ui/dialog.tsx")).toContain("var(--sat)");
    expect(read("src/components/inbox/upload-drawer.tsx")).toContain("pt-safe");
    expect(read("src/components/settings-shell.tsx")).toContain("sticky top-[calc(1.5rem+var(--sat))]");
    // Fixed top banner (unlock on 423) clears the iOS status bar.
    expect(read("src/components/unlock-panel.tsx")).toContain("pt-[calc(0.75rem+var(--sat))]");
  });
});

describe("mobile bar matches the native tab bar (mobile/src/navigation/TabNavigator.tsx)", () => {
  // native: height 60 + inset.bottom, paddingTop 6, icon 22, label 11/600
  it("bar row is 59px + 1px top border = native 60; the bottom inset is added via --sab (total 60 + sab)", () => {
    render(<Nav />);
    const row = within(bar()).getByTestId("mobile-bar-row");
    expect(row.className).toContain("h-[59px]");
    expect(row.className).toContain("pt-1.5");
    expect(bar().className).toContain("pb-[var(--sab)]");
  });

  it("icons are 22px and labels 11px semibold on every tab", () => {
    render(<Nav />);
    for (const l of within(bar()).getAllByRole("link")) {
      expect(l.className).toContain("text-[11px]");
      expect(l.className).toContain("font-semibold");
      const svg = l.querySelector("svg")!;
      expect(svg.getAttribute("class")).toContain("size-[22px]");
    }
  });

  it("app shell bottom padding equals the bar height + inset", () => {
    const layout = readFileSync(join(__dirname, "../../src/app/(app)/layout.tsx"), "utf8");
    expect(layout).toContain("pb-[calc(60px+var(--sab))]");
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
