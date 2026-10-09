/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import { Home } from "lucide-react";
import { pickActiveHref, navGroups, adminLinks, allFlatItems, Nav, MobileBottomBar } from "@/components/nav";

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

describe("Nav rendering with longest-match sidebar highlighting", () => {
  beforeEach(() => {
    mockPath = "/admin/instance";
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("at /admin/instance with instanceAdminEnabled=true: exactly one aria-current=page among admin links", async () => {
    mockFetch({ admin: true });
    localStorage.setItem("nav.adminOpen", "true");
    render(<Nav instanceAdminEnabled={true} />);

    const instanceLink = await waitFor(() => screen.getByRole("link", { name: /Instance config/i }));
    expect(instanceLink).toBeTruthy();
    expect(instanceLink.getAttribute("aria-current")).toBe("page");

    // Verify only one admin link is current (check only admin-related links, not the mobile More button)
    const adminInboxLink = screen.queryByRole("link", { name: /Admin Inbox/i });
    const emailLink = screen.queryByRole("link", { name: /Email Oversight/i });
    const envLink = screen.queryByRole("link", { name: /Environment/i });
    const announcementsLink = screen.queryByRole("link", { name: /Announcements/i });
    const feedbackLink = screen.queryByRole("link", { name: /^User feedback/i });

    const adminLinks = [instanceLink, adminInboxLink, emailLink, envLink, announcementsLink, feedbackLink].filter(Boolean);
    const currentAdminLinks = adminLinks.filter(l => l?.getAttribute("aria-current") === "page");
    expect(currentAdminLinks).toHaveLength(1);
    expect(currentAdminLinks[0]).toBe(instanceLink);
  });

  it("sidebar: exactly ONE link marked aria-current at /admin/instance", async () => {
    mockFetch({ admin: true });
    localStorage.setItem("nav.adminOpen", "true");
    const { container } = render(<Nav instanceAdminEnabled={true} />);

    await waitFor(() => screen.getByRole("link", { name: /Instance config/i }));

    // Find the sidebar nav element (aria-label="Main navigation")
    const sidebar = container.querySelector('nav[aria-label="Main navigation"]');
    expect(sidebar).toBeTruthy();

    // All links with aria-current="page" within the sidebar
    const sidebarCurrentLinks = sidebar ? Array.from(sidebar.querySelectorAll('a[aria-current="page"]')) : [];
    expect(sidebarCurrentLinks).toHaveLength(1);
    expect((sidebarCurrentLinks[0] as HTMLAnchorElement).href).toContain("/admin/instance");
  });

  it("sidebar: exactly ONE link marked aria-current at /admin/system (Environment via activePrefixes)", async () => {
    mockPath = "/admin/system";
    mockFetch({ admin: true });
    localStorage.setItem("nav.adminOpen", "true");
    const { container } = render(<Nav />);

    await waitFor(() => screen.getByRole("link", { name: /Environment/i }));

    const sidebar = container.querySelector('nav[aria-label="Main navigation"]');
    expect(sidebar).toBeTruthy();

    const sidebarCurrentLinks = sidebar ? Array.from(sidebar.querySelectorAll('a[aria-current="page"]')) : [];
    expect(sidebarCurrentLinks).toHaveLength(1);
    // Environment link should be current, not /admin
    const envLink = sidebar?.querySelector('a[href="/admin/env"]');
    expect(envLink?.getAttribute("aria-current")).toBe("page");
  });

  it("sidebar: exactly ONE link marked aria-current at /admin", async () => {
    mockPath = "/admin";
    mockFetch({ admin: true });
    localStorage.setItem("nav.adminOpen", "true");
    const { container } = render(<Nav />);

    await waitFor(() => {
      const adminLink = screen.queryByRole("link", { name: /Admin Inbox/i });
      expect(adminLink).toBeTruthy();
    });

    const sidebar = container.querySelector('nav[aria-label="Main navigation"]');
    expect(sidebar).toBeTruthy();

    const sidebarCurrentLinks = sidebar ? Array.from(sidebar.querySelectorAll('a[aria-current="page"]')) : [];
    expect(sidebarCurrentLinks).toHaveLength(1);
    // /admin link should be current
    const adminLink = sidebar?.querySelector('a[href="/admin"]');
    expect(adminLink?.getAttribute("aria-current")).toBe("page");
  });
});

describe("MobileBottomBar with more-active sidebar logic", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("at /settings: More aria-current=page, no tab current", () => {
    mockPath = "/settings";
    const { container } = render(<MobileBottomBar pathname={mockPath} />);
    const moreLink = container.querySelector('a[href="/more"]');

    const currentLinks = Array.from(container.querySelectorAll('a[aria-current="page"]'));
    expect(currentLinks).toHaveLength(1);
    expect(currentLinks[0]).toBe(moreLink);
  });

  it("at /account: More aria-current=page, no tab current", () => {
    mockPath = "/account";
    const { container } = render(<MobileBottomBar pathname={mockPath} />);
    const moreLink = container.querySelector('a[href="/more"]');

    const currentLinks = Array.from(container.querySelectorAll('a[aria-current="page"]'));
    expect(currentLinks).toHaveLength(1);
    expect(currentLinks[0]).toBe(moreLink);
  });

  it("at /account/info: More aria-current=page, no tab current", () => {
    mockPath = "/account/info";
    const { container } = render(<MobileBottomBar pathname={mockPath} />);
    const moreLink = container.querySelector('a[href="/more"]');

    const currentLinks = Array.from(container.querySelectorAll('a[aria-current="page"]'));
    expect(currentLinks).toHaveLength(1);
    expect(currentLinks[0]).toBe(moreLink);
  });

  it("at /budgets: More aria-current=page, no tab current", () => {
    mockPath = "/budgets";
    const { container } = render(<MobileBottomBar pathname={mockPath} />);
    const moreLink = container.querySelector('a[href="/more"]');

    const currentLinks = Array.from(container.querySelectorAll('a[aria-current="page"]'));
    expect(currentLinks).toHaveLength(1);
    expect(currentLinks[0]).toBe(moreLink);
  });

  it("at /dashboard: Home aria-current=page, More not current", () => {
    mockPath = "/dashboard";
    const { container } = render(<MobileBottomBar pathname={mockPath} />);
    const homeLink = container.querySelector('a[href="/dashboard"]');
    const moreLink = container.querySelector('a[href="/more"]');

    const currentLinks = Array.from(container.querySelectorAll('a[aria-current="page"]'));
    expect(currentLinks).toHaveLength(1);
    expect(currentLinks[0]).toBe(homeLink);
    expect(moreLink?.getAttribute("aria-current")).toBeNull();
  });

  it("at /accounts/3: Accounts aria-current=page, More not current", () => {
    mockPath = "/accounts/3";
    const { container } = render(<MobileBottomBar pathname={mockPath} />);
    const accountsLink = container.querySelector('a[href="/accounts"]');
    const moreLink = container.querySelector('a[href="/more"]');

    const currentLinks = Array.from(container.querySelectorAll('a[aria-current="page"]'));
    expect(currentLinks).toHaveLength(1);
    expect(currentLinks[0]).toBe(accountsLink);
    expect(moreLink?.getAttribute("aria-current")).toBeNull();
  });

  it("at /transactions/new (full-screen entry): bar is hidden by design", () => {
    mockPath = "/transactions/new";
    const { container } = render(<MobileBottomBar pathname={mockPath} />);
    expect(container.querySelector('nav[aria-label="Mobile navigation"]')).toBeNull();
    expect(container.querySelector('a[href="/more"]')).toBeNull();
    expect(container.querySelectorAll('a[aria-current="page"]')).toHaveLength(0);
  });

  it("at /transactions (non-full-screen): Transactions aria-current=page, More not current", () => {
    mockPath = "/transactions";
    const { container } = render(<MobileBottomBar pathname={mockPath} />);
    const transactionsLink = container.querySelector('a[href="/transactions"]');
    const moreLink = container.querySelector('a[href="/more"]');

    const currentLinks = Array.from(container.querySelectorAll('a[aria-current="page"]'));
    expect(currentLinks).toHaveLength(1);
    expect(currentLinks[0]).toBe(transactionsLink);
    expect(moreLink?.getAttribute("aria-current")).toBeNull();
  });
});
