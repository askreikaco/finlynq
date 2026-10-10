/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import { getNavEntry } from "@/lib/nav-config";
import { readFileSync } from "node:fs";
import { join } from "node:path";

let mockPath = "/dashboard";
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
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

import { AppTabs, adminLinks } from "@/components/nav";

type Opts = { announcements?: unknown; announcementsOk?: boolean; feedback?: unknown; feedbackOk?: boolean };
function mockFetch({ announcements = [], announcementsOk = true, feedback = [], feedbackOk = true }: Opts = {}) {
  const fn = vi.fn(async (url: string) => {
    const json = (body: unknown, ok = true) => ({ ok, json: async () => body }) as Response;
    if (url.startsWith("/api/announcements")) return json(announcements, announcementsOk);
    if (url.startsWith("/api/feedback")) return json(feedback, feedbackOk);
    return json([]);
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

const bar = () => screen.getByRole("navigation", { name: "Mobile navigation" });
const rail = () => screen.getByRole("navigation", { name: "Main navigation" });
const dots = (root: HTMLElement) => root.querySelectorAll('[data-testid="more-unread-dot"]');

beforeEach(() => {
  mockPath = "/dashboard";
  localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("AppTabs data loading", () => {
  it("loads only the announcement and feedback lists (no session or dev-mode calls)", async () => {
    const f = mockFetch();
    render(<AppTabs />);
    await waitFor(() => expect(f).toHaveBeenCalledWith("/api/announcements"));
    expect(f).toHaveBeenCalledWith("/api/feedback");
    const urls = f.mock.calls.map((c) => c[0]);
    expect(urls.sort()).toEqual(["/api/announcements", "/api/feedback"]);
  });

  it("the unread fetches live in the shared store, which refetches on pathname change; AppTabs only reads it", () => {
    const src = readFileSync(join(__dirname, "../../src/components/nav.tsx"), "utf8");
    const store = readFileSync(join(__dirname, "../../src/components/nav-unread.ts"), "utf8");
    expect(src).toContain("useNavUnread");
    expect(src).not.toContain("/api/announcements");
    expect(store.match(/\}, \[pathname\]\);/g)?.length).toBe(1);
  });
});

describe("More unread dot (one dot, both layouts)", () => {
  it("shows one dot in the bar and one in the rail when announcements are unread", async () => {
    mockFetch({ announcements: [{ id: 1, read: false }, { id: 2, read: false }] });
    render(<AppTabs />);
    await waitFor(() => expect(dots(bar())).toHaveLength(1));
    expect(dots(rail())).toHaveLength(1);
  });

  it("the dot sits on the More tab only, in both layouts", async () => {
    mockFetch({ announcements: [{ id: 1, read: false }] });
    render(<AppTabs />);
    await waitFor(() => expect(dots(bar())).toHaveLength(1));
    for (const nav of [bar(), rail()]) {
      const dot = nav.querySelector('[data-testid="more-unread-dot"]')!;
      expect(dot.closest("a")!.getAttribute("href")).toBe("/more");
      expect(dot.getAttribute("aria-hidden")).toBe("true");
    }
  });

  it("shows the dot for unread feedback replies alone", async () => {
    mockFetch({ feedback: [{ unread: true }] });
    render(<AppTabs />);
    await waitFor(() => expect(dots(rail())).toHaveLength(1));
    expect(dots(bar())).toHaveLength(1);
  });

  it("announcements and feedback together still give one dot (a dot, not a count)", async () => {
    mockFetch({ announcements: [{ id: 1, read: false }], feedback: [{ unread: true }, { unread: true }] });
    render(<AppTabs />);
    await waitFor(() => expect(dots(bar())).toHaveLength(1));
    expect(dots(rail())).toHaveLength(1);
    expect(bar().textContent).not.toMatch(/\b3\b/);
  });

  it("no dot when every announcement and feedback thread is read", async () => {
    const f = mockFetch({ announcements: [{ id: 1, read: true }], feedback: [{ unread: false }] });
    render(<AppTabs />);
    await waitFor(() => expect(f).toHaveBeenCalledWith("/api/feedback"));
    await new Promise((r) => setTimeout(r, 10));
    expect(dots(bar())).toHaveLength(0);
    expect(dots(rail())).toHaveLength(0);
  });

  it("no dot when both requests fail (non-OK)", async () => {
    const f = mockFetch({ announcements: [{ id: 1, read: false }], announcementsOk: false, feedback: [{ unread: true }], feedbackOk: false });
    render(<AppTabs />);
    await waitFor(() => expect(f).toHaveBeenCalledWith("/api/feedback"));
    await new Promise((r) => setTimeout(r, 10));
    expect(dots(bar())).toHaveLength(0);
    expect(dots(rail())).toHaveLength(0);
  });
});

describe("Tab icons and labels", () => {
  it("every tab in both layouts renders an icon (svg) and a label", () => {
    render(<AppTabs />);
    for (const nav of [bar(), rail()]) {
      const links = nav.querySelectorAll("a");
      expect(links).toHaveLength(5);
      links.forEach((l) => {
        expect(l.querySelector("svg")).not.toBeNull();
        expect(l.textContent!.trim().length).toBeGreaterThan(0);
      });
    }
  });
});

describe("Admin reachability (admin no longer has a sidebar group)", () => {
  it("admin entries are registered for the More surface, and none is a tab", () => {
    const adminPaths = ["/admin", "/admin/inbox", "/admin/email-inbox", "/admin/env", "/admin/announcements", "/admin/feedback", "/admin/instance"];
    for (const p of adminPaths) {
      expect(getNavEntry(p)?.surfaces, p).toContain("more");
    }
    render(<AppTabs />);
    for (const nav of [bar(), rail()]) {
      expect([...nav.querySelectorAll("a")].map((a) => a.getAttribute("href"))).not.toContain("/admin");
    }
  });

  it("Instance config has instance flag set in nav registry (More gates it)", () => {
    const instanceItem = adminLinks.find((i) => i.label === "Instance config");
    expect(instanceItem).toBeTruthy();
    expect(instanceItem?.flag).toBe("instance");
  });
});
