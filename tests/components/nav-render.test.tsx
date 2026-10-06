/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, screen, waitFor, fireEvent, cleanup } from "@testing-library/react";

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

import { Nav } from "@/components/nav";

type Opts = { admin?: boolean; announcements?: unknown; announcementsOk?: boolean; feedback?: unknown; feedbackOk?: boolean };
function mockFetch({ admin = false, announcements = [], announcementsOk = true, feedback = [], feedbackOk = true }: Opts = {}) {
  const fn = vi.fn(async (url: string) => {
    const json = (body: unknown, ok = true) => ({ ok, json: async () => body }) as Response;
    if (url.startsWith("/api/auth/session")) return json({ isAdmin: admin });
    if (url.startsWith("/api/announcements")) return json(announcements, announcementsOk);
    if (url.startsWith("/api/feedback")) return json(feedback, feedbackOk);
    if (url.startsWith("/api/settings/dev-mode")) return json({ devMode: false });
    return json([]);
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}
const adminToggle = () => screen.queryByRole("button", { name: /^admin$/i });

beforeEach(() => {
  mockPath = "/dashboard";
  localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Nav admin group", () => {
  it("is hidden for non-admins", async () => {
    const f = mockFetch({ admin: false });
    render(<Nav />);
    await waitFor(() => expect(f).toHaveBeenCalledWith("/api/auth/session"));
    await new Promise((r) => setTimeout(r, 10));
    expect(adminToggle()).toBeNull();
    expect(screen.queryByText("Admin Inbox")).toBeNull();
  });

  it("admin: collapsed by default, aria-expanded toggles, persists", async () => {
    mockFetch({ admin: true });
    render(<Nav />);
    const btn = await waitFor(() => {
      const b = adminToggle();
      expect(b).not.toBeNull();
      return b!;
    });
    expect(btn.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByText("Admin Inbox")).toBeNull();
    fireEvent.click(btn);
    expect(btn.getAttribute("aria-expanded")).toBe("true");
    expect(document.getElementById(btn.getAttribute("aria-controls")!)).not.toBeNull();
    expect(screen.getByText("Admin Inbox")).toBeTruthy();
    expect(localStorage.getItem("nav.adminOpen")).toBe("true");
  });

  it("restores open state from localStorage", async () => {
    localStorage.setItem("nav.adminOpen", "true");
    mockFetch({ admin: true });
    render(<Nav />);
    expect(await screen.findByText("Admin Inbox")).toBeTruthy();
  });

  it("auto-expands on /admin/*", async () => {
    mockPath = "/admin/inbox";
    mockFetch({ admin: true });
    render(<Nav />);
    expect(await screen.findByText("Admin Inbox")).toBeTruthy();
    expect(adminToggle()!.getAttribute("aria-expanded")).toBe("true");
  });

  it("admin user on /admin/system shows Environment link active, no old admin links", async () => {
    mockPath = "/admin/system";
    mockFetch({ admin: true });
    render(<Nav />);

    const envLink = await screen.findByRole("link", { name: /Environment/i });
    expect(envLink.getAttribute("href")).toBe("/admin/env");
    expect(envLink.getAttribute("aria-current")).toBe("page");

    // Old links should not exist
    expect(screen.queryByText("Diagnostics")).toBeNull();
    expect(screen.queryByText("Rate Cache")).toBeNull();
    expect(screen.queryByText("API Log")).toBeNull();
    expect(screen.queryByText("Server Health")).toBeNull();
  });

  it("admin on /admin/system with group open, clicking toggle collapses it", async () => {
    mockPath = "/admin/system";
    localStorage.setItem("nav.adminOpen", "true");
    mockFetch({ admin: true });
    render(<Nav />);

    const btn = await screen.findByRole("button", { name: /^admin$/i });
    expect(btn.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText("Email Oversight")).toBeTruthy();

    fireEvent.click(btn);

    expect(btn.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByText("Email Oversight")).toBeNull();
    expect(localStorage.getItem("nav.adminOpen")).toBe("false");
  });

  it("admin user on /admin/system with collapsed sidebar shows admin shield active", async () => {
    mockPath = "/admin/system";
    mockFetch({ admin: true });
    render(<Nav />);

    // Find and click the collapse button to collapse the sidebar
    const collapseBtn = await waitFor(() =>
      screen.getByRole("button", { name: /collapse sidebar|expand sidebar/i })
    );
    fireEvent.click(collapseBtn);

    // Find the aria-label="Admin" link in the collapsed sidebar
    const adminLink = await screen.findByRole("link", { name: "Admin" });

    // Check that it has the active styling
    const className = adminLink.className;
    expect(className).toContain("bg-white/[0.08]");
    expect(className).toContain("text-sidebar-accent-foreground");
  });
});

describe("Nav What's New", () => {
  it("hidden when there are no announcements", async () => {
    const f = mockFetch({ announcements: [] });
    render(<Nav />);
    await waitFor(() => expect(screen.queryByText("What's new")).toBeNull());
    expect(f).toHaveBeenCalledWith("/api/announcements");
  });

  it("shown when announcements exist, even if all read", async () => {
    mockFetch({ announcements: [{ id: 1, read: true }] });
    render(<Nav />);
    await new Promise((r) => setTimeout(r, 10));
    expect(screen.getByText("What's new")).toBeTruthy();
  });

  it("shown when the announcements request fails (non-OK)", async () => {
    mockFetch({ announcements: [], announcementsOk: false });
    render(<Nav />);
    await new Promise((r) => setTimeout(r, 10));
    expect(screen.getByText("What's new")).toBeTruthy();
  });

  it("shows unread badge on whats-new row in expanded sidebar", async () => {
    mockFetch({ announcements: [{ id: 1, read: false }, { id: 2, read: false }] });
    render(<Nav />);
    await waitFor(() => {
      const whatsnewLink = screen.getByRole("link", { name: /What's new/ });
      expect(whatsnewLink.textContent).toContain("2");
    });
  });

  it("shows unread badge on whats-new row in collapsed sidebar", async () => {
    mockFetch({ announcements: [{ id: 1, read: false }] });
    render(<Nav />);

    // Collapse the sidebar
    const collapseBtn = await waitFor(() =>
      screen.getByRole("button", { name: /collapse sidebar|expand sidebar/i })
    );
    fireEvent.click(collapseBtn);

    // Check for the dot badge on the collapsed What's new link
    await waitFor(() => {
      const whatsnewLink = screen.getByRole("link", { name: /What's new/ });
      const badge = whatsnewLink.querySelector("span[class*='h-2'][class*='w-2'][class*='rounded-full'][class*='bg-primary']");
      expect(badge).not.toBeNull();
    });
  });

  it("shows unread badge on feedback row in expanded sidebar", async () => {
    mockFetch({ feedback: [{ unread: true }, { unread: true }] });
    render(<Nav />);
    await waitFor(() => {
      const feedbackLink = screen.getByRole("link", { name: /^Feedback/ });
      expect(feedbackLink.textContent).toContain("2");
    });
  });

  it("shows unread badge on feedback row in collapsed sidebar", async () => {
    mockFetch({ feedback: [{ unread: true }] });
    render(<Nav />);

    // Collapse the sidebar
    const collapseBtn = await waitFor(() =>
      screen.getByRole("button", { name: /collapse sidebar|expand sidebar/i })
    );
    fireEvent.click(collapseBtn);

    // Check for the dot badge on the collapsed feedback link
    const feedbackLink = await screen.findByRole("link", { name: /^Feedback/ });
    const badge = feedbackLink.querySelector("span[class*='h-2'][class*='w-2'][class*='rounded-full'][class*='bg-primary']");
    expect(badge).not.toBeNull();
  });
});

describe("Nav icon rendering", () => {
  beforeEach(() => {
    mockPath = "/dashboard";
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("sidebar entries render with icons", async () => {
    mockFetch({ announcements: [{ id: 1, read: false }], admin: true });
    render(<Nav />);

    // Wait for nav to load
    await waitFor(() => expect(screen.queryByText("What's new")).not.toBeNull());

    // Check that What's new link has an icon (SVG)
    const whatsnewLink = screen.getByRole("link", { name: /What's new/ });
    const iconSvg = whatsnewLink.querySelector("svg");
    expect(iconSvg).not.toBeNull();
  });

  it("feedback entry in sidebar renders with icon", async () => {
    mockFetch({ feedback: [{ unread: true }] });
    render(<Nav />);

    await waitFor(() => expect(screen.queryByText("Feedback")).not.toBeNull());

    const feedbackLink = screen.getByRole("link", { name: /^Feedback/ });
    const iconSvg = feedbackLink.querySelector("svg");
    expect(iconSvg).not.toBeNull();
  });

  it("more menu entry (What's new) renders with icon", async () => {
    mockFetch({ announcements: [{ id: 1, read: false }] });
    render(<Nav />);

    await waitFor(() => expect(screen.queryByText("What's new")).not.toBeNull());

    // Verify icon is rendered for the more menu entry
    const whatsnewLink = screen.getByRole("link", { name: /What's new/ });
    const iconSvg = whatsnewLink.querySelector("svg");
    // Icon should exist since What's new is in both sidebar and more surfaces
    expect(iconSvg).not.toBeNull();
  });
});

describe("Nav Instance Admin filter (WP9a)", () => {
  beforeEach(() => {
    mockPath = "/admin/instance";
    localStorage.clear();
  });

  it("hides Instance config when instanceAdminEnabled={false}", async () => {
    mockFetch({ admin: true });
    // Open admin group
    localStorage.setItem("nav.adminOpen", "true");
    render(<Nav instanceAdminEnabled={false} />);

    await new Promise((r) => setTimeout(r, 10));
    expect(screen.queryByText("Instance config")).toBeNull();
  });

  it("shows Instance config when instanceAdminEnabled={true}", async () => {
    mockFetch({ admin: true });
    // Open admin group
    localStorage.setItem("nav.adminOpen", "true");
    render(<Nav instanceAdminEnabled={true} />);

    const configLink = await waitFor(() => screen.getByRole("link", { name: /Instance config/i }));
    expect(configLink).toBeTruthy();
    expect(configLink.getAttribute("href")).toBe("/admin/instance");
  });

  it("hides Instance config by default (instanceAdminEnabled omitted)", async () => {
    mockFetch({ admin: true });
    // Open admin group
    localStorage.setItem("nav.adminOpen", "true");
    render(<Nav />);

    await new Promise((r) => setTimeout(r, 10));
    expect(screen.queryByText("Instance config")).toBeNull();
  });

  it("Instance config has instance flag set in nav registry", async () => {
    // Verify the flag is correctly set at the static config level
    const { adminLinks } = await import("@/components/nav");
    const instanceItem = adminLinks.find((i) => i.label === "Instance config");
    expect(instanceItem).toBeTruthy();
    expect(instanceItem?.flag).toBe("instance");
  });
});
