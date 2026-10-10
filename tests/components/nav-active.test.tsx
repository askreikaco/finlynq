/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, screen, cleanup, within } from "@testing-library/react";
import { Home } from "lucide-react";
import { pickActiveHref, navGroups, adminLinks, allFlatItems, AppTabs } from "@/components/nav";

let mockPath = "/dashboard";
vi.mock("next/navigation", () => ({
  usePathname: () => mockPath,
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/components/theme-toggle", () => ({ ThemeToggle: () => null }));
vi.mock("@/components/FinlynqLogo", () => ({ FinlynqLogo: () => null }));
vi.mock("@/components/feedback-dialog", () => ({ FeedbackDialog: () => null }));
vi.mock("framer-motion", () => ({
  motion: new Proxy({}, { get: () => (p: React.PropsWithChildren<Record<string, unknown>>) => React.createElement("div", null, p.children) }),
  AnimatePresence: ({ children }: React.PropsWithChildren) => children,
}));

describe("pickActiveHref: longest matching prefix logic", () => {
  it("returns /admin/instance for /admin/instance", () => {
    const active = pickActiveHref("/admin/instance");
    expect(active).not.toBeNull();
    expect(active?.href).toBe("/admin/instance");
  });

  it("returns /admin for /admin (exact match)", () => {
    const active = pickActiveHref("/admin");
    expect(active).not.toBeNull();
    expect(active?.href).toBe("/admin");
  });

  it("returns Environment item for /admin/system via activePrefixes", () => {
    const active = pickActiveHref("/admin/system");
    expect(active).not.toBeNull();
    expect(active?.label).toBe("Environment");
    expect(active?.href).toBe("/admin/env");
  });

  it("returns /portfolio for /portfolio/dividends", () => {
    const active = pickActiveHref("/portfolio/dividends");
    expect(active).not.toBeNull();
    expect(active?.href).toBe("/portfolio");
  });

  it("returns /settings for /settings/general", () => {
    const active = pickActiveHref("/settings/general");
    expect(active).not.toBeNull();
    // Check if it matches one of the sidebar items (Settings is not in navGroups, but in a more menu)
    expect(active?.href).toBe("/settings");
  });

  it("returns /accounts for /accounts/5", () => {
    const active = pickActiveHref("/accounts/5");
    expect(active).not.toBeNull();
    expect(active?.href).toBe("/accounts");
  });

  it("returns null for unknown path", () => {
    const active = pickActiveHref("/unknown-path");
    expect(active).toBeNull();
  });

  it("chooses the longest matching prefix when multiple prefixes match", () => {
    // If both /portfolio and /portfolio/holdings match, choose the longer one
    const active = pickActiveHref("/portfolio/holdings/9");
    expect(active).not.toBeNull();
    expect(active?.href).toBe("/portfolio");
  });

  it("uses activePrefixes when available instead of href", () => {
    // Environment has activePrefixes that include /admin/system, /admin/diagnostics, etc.
    const envItem = adminLinks.find((i) => i.label === "Environment");
    expect(envItem?.activePrefixes).toBeDefined();
    expect(envItem?.activePrefixes).toContain("/admin/system");

    const active = pickActiveHref("/admin/system");
    expect(active).toBe(envItem);
  });

  it("respects tie-breaking: same item across multiple calls", () => {
    // For /portfolio, the same item should be returned consistently
    const active1 = pickActiveHref("/portfolio");
    const active2 = pickActiveHref("/portfolio");
    expect(active1).toBe(active2);
  });
});

describe("pickActiveHref: with custom items array", () => {
  it("accepts a custom items array for filtering", () => {
    const navItems = navGroups.flatMap((g) => g.items);
    const active = pickActiveHref("/dashboard", navItems);
    expect(active).not.toBeNull();
    expect(active?.href).toBe("/dashboard");
  });

  it("uses allFlatItems by default", () => {
    const active1 = pickActiveHref("/admin/instance");
    const active2 = pickActiveHref("/admin/instance", allFlatItems);
    expect(active1).toBe(active2);
  });

  const mk = (href: string) => ({ href, label: href, icon: Home, color: "x" });
  it("picks the longest prefix regardless of item order", () => {
    expect(pickActiveHref("/a/b/c", [mk("/a"), mk("/a/b")])?.href).toBe("/a/b");
    expect(pickActiveHref("/a/b/c", [mk("/a/b"), mk("/a")])?.href).toBe("/a/b");
  });
});

// Mock fetch for rendering tests
function mockFetch({ admin = false, announcements = [], feedback = [] } = {}) {
  const fn = vi.fn(async (url: string) => {
    const json = (body: unknown) => ({ ok: true, json: async () => body }) as Response;
    if (url.startsWith("/api/auth/session")) return json({ isAdmin: admin });
    if (url.startsWith("/api/announcements")) return json(announcements);
    if (url.startsWith("/api/feedback")) return json(feedback);
    if (url.startsWith("/api/settings/dev-mode")) return json({ devMode: false });
    return json([]);
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

describe("AppTabs active tab: longest-match rule, both layouts", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  const currentIn = (name: string) =>
    within(screen.getByRole("navigation", { name }))
      .queryAllByRole("link")
      .filter((l) => l.getAttribute("aria-current") === "page")
      .map((l) => l.getAttribute("href"));

  it.each([
    ["/admin/instance", "/more"],
    ["/admin/system", "/more"],
    ["/admin", "/more"],
    ["/settings/general", "/more"],
    ["/account/info", "/more"],
    ["/budgets", "/more"],
    ["/dashboard", "/dashboard"],
    ["/accounts/3", "/accounts"],
    ["/transactions", "/transactions"],
    ["/portfolio/dividends", "/portfolio"],
  ])("at %s: exactly one current tab, %s, in the bar and in the rail", (path, expected) => {
    mockPath = path;
    render(<AppTabs />);
    expect(currentIn("Mobile navigation")).toEqual([expected]);
    expect(currentIn("Main navigation")).toEqual([expected]);
  });

  it("at /transactions/new (full-screen entry): bar is hidden by design, rail marks Transactions", () => {
    mockPath = "/transactions/new";
    render(<AppTabs />);
    expect(screen.queryByRole("navigation", { name: "Mobile navigation" })).toBeNull();
    expect(currentIn("Main navigation")).toEqual(["/transactions"]);
  });
});
