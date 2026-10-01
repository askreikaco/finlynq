/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, screen, cleanup, within, waitFor, fireEvent } from "@testing-library/react";

const replace = vi.fn();
vi.mock("next/navigation", () => ({
  usePathname: () => "/more",
  useRouter: () => ({ replace, push: vi.fn() }),
}));
const hardReload = vi.fn();
const clearPerUserStorage = vi.fn();
vi.mock("@/lib/client/hard-reload", () => ({
  hardReload: (...a: unknown[]) => hardReload(...a),
  clearPerUserStorage: (...a: unknown[]) => clearPerUserStorage(...a),
}));

import { MoreMenu, buildMoreGroups } from "@/components/more-menu";
import { allFlatItems, mobileBarItems } from "@/components/nav";

let session: Record<string, unknown>;
let dev: boolean;
let announcements: unknown[];
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  sessionStorage.clear();
  replace.mockClear();
  hardReload.mockClear();
  clearPerUserStorage.mockClear();
  session = { isAdmin: false };
  dev = false;
  announcements = [{ id: 1, read: false }];
  fetchMock = vi.fn(async (url: string, init?: { method?: string }) => {
    const j = (body: unknown, ok = true) => ({ ok, status: ok ? 200 : 500, json: async () => body });
    if (url === "/api/auth/session") return j(session);
    if (url === "/api/settings/dev-mode") return j({ devMode: dev });
    if (url === "/api/announcements") return j(announcements);
    if (url === "/api/auth/accounts")
      return j([{ userId: "u1", email: "a@b.c", displayName: "A", active: true, status: "active" }]);
    if (url === "/api/auth/logout" && init?.method === "POST") return j({ activeUserId: null });
    return j({});
  });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const group = (id: string) => screen.getByTestId(`more-group-${id}`);
const rows = (id: string) =>
  within(group(id))
    .getAllByTestId("more-row")
    .map((r) => [r.textContent, r.getAttribute("href")]);

describe("More screen", () => {
  it("has a large More title and the grouped rows in order", async () => {
    announcements = [{ id: 1, read: true }];
    render(<MoreMenu />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("More");
    expect(rows("main")).toEqual([
      ["Budgets", "/budgets"],
      ["Goals", "/goals"],
      ["Reports", "/reports"],
      ["Reconcile", "/import?tab=reconcile"],
      ["Categories", "/settings/categorization"],
      ["Import", "/import"],
    ]);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/announcements"));
    expect(rows("tools").map((r) => r[0])).toEqual(["What's new", "Family Wealth", "Settings"]);
    expect(within(group("tools")).getByTestId("more-signout").textContent).toBe("Sign out");
    expect(rows("explore").map((r) => r[1])).toEqual(["/subscriptions", "/calendar", "/loans"]);
  });

  it("hides What's new when there are no announcements", async () => {
    announcements = [];
    render(<MoreMenu />);
    await waitFor(() => expect(screen.queryByText("What's new")).toBeNull());
    expect(rows("tools").map((r) => r[0])).toEqual(["Family Wealth", "Settings"]);
  });

  it("shows the Admin group only for admins", async () => {
    const { unmount } = render(<MoreMenu />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/announcements"));
    expect(screen.queryByTestId("more-group-admin")).toBeNull();
    unmount();
    session = { isAdmin: true };
    render(<MoreMenu />);
    await waitFor(() => expect(screen.getByTestId("more-group-admin")).toBeTruthy());
    expect(rows("admin").map((r) => r[1])).toContain("/admin");
  });

  it("Sign out posts logout, clears the user's storage and hard-reloads", async () => {
    render(<MoreMenu />);
    fireEvent.click(screen.getByTestId("more-signout"));
    await waitFor(() => expect(hardReload).toHaveBeenCalledWith("/"));
    expect(fetchMock).toHaveBeenCalledWith("/api/auth/logout", { method: "POST" });
    expect(clearPerUserStorage).toHaveBeenCalledWith("u1");
    expect(sessionStorage.getItem("pf-passkey-auto-skip")).toBe("1");
  });

  it("does not offer Send feedback", () => {
    render(<MoreMenu />);
    expect(screen.queryByText(/feedback/i)).toBeNull();
  });
});

describe("More keeps everything the old sheet offered reachable", () => {
  it("every non-bar nav item (all flags on) has a row, except owner-removed /feedback", () => {
    const all = buildMoreGroups({ isAdmin: true, devMode: true, familyEnabled: true, hasAnnouncements: true });
    const hrefs = new Set(all.flatMap((g) => g.rows.map((r) => r.href)));
    const bar = new Set(mobileBarItems.map((i) => i.href));
    const missing = allFlatItems
      .map((i) => i.href)
      .filter((h) => !bar.has(h) && h !== "/feedback" && !hrefs.has(h));
    expect(missing).toEqual([]);
  });

  it("redirects to /dashboard on desktop widths", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    render(<MoreMenu />);
    expect(replace).toHaveBeenCalledWith("/dashboard");
  });
});
