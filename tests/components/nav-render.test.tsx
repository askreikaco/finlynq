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

type Opts = { admin?: boolean; announcements?: unknown; announcementsOk?: boolean };
function mockFetch({ admin = false, announcements = [], announcementsOk = true }: Opts = {}) {
  const fn = vi.fn(async (url: string) => {
    const json = (body: unknown, ok = true) => ({ ok, json: async () => body }) as Response;
    if (url.startsWith("/api/auth/session")) return json({ isAdmin: admin });
    if (url.startsWith("/api/announcements")) return json(announcements, announcementsOk);
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
    await waitFor(() => expect(screen.queryByText("What's New")).toBeNull());
    expect(f).toHaveBeenCalledWith("/api/announcements");
  });

  it("shown when announcements exist, even if all read", async () => {
    mockFetch({ announcements: [{ id: 1, read: true }] });
    render(<Nav />);
    await new Promise((r) => setTimeout(r, 10));
    expect(screen.getByText("What's New")).toBeTruthy();
  });

  it("shown when the announcements request fails (non-OK)", async () => {
    mockFetch({ announcements: [], announcementsOk: false });
    render(<Nav />);
    await new Promise((r) => setTimeout(r, 10));
    expect(screen.getByText("What's New")).toBeTruthy();
  });
});
