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

  it.each([
    ["/accounts/123", "Accounts"],
    ["/portfolio/holdings/9", "Portfolio"],
    ["/transactions", "Transactions"],
    ["/dashboard", "Home"],
    ["/more", "More"],
  ])("marks the right tab active on %s", (path, label) => {
    mockPath = path;
    render(<Nav />);
    const active = within(bar())
      .getAllByRole("link")
      .filter((l) => l.getAttribute("aria-current") === "page");
    expect(active.map((l) => l.textContent)).toEqual([label]);
  });

  it("does not treat /accountsfoo as Accounts", () => {
    mockPath = "/accountsfoo";
    render(<Nav />);
    expect(
      within(bar()).queryAllByRole("link").filter((l) => l.getAttribute("aria-current") === "page"),
    ).toHaveLength(0);
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
    expect(read("src/app/(app)/settings/layout.tsx")).toContain("sticky top-[calc(1.5rem+var(--sat))]");
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
