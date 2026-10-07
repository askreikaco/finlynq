/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render as rtlRender, screen, cleanup, within, waitFor, fireEvent } from "@testing-library/react";
import { SWRConfig } from "swr";

const render = (ui: React.ReactElement) =>
  rtlRender(<SWRConfig value={{ provider: () => new Map() }}>{ui}</SWRConfig>);

const replace = vi.fn();
vi.mock("next/navigation", () => ({
  usePathname: () => "/more",
  useRouter: () => ({ replace, push: vi.fn() }),
}));
let mockTheme = "system";
const setTheme = vi.fn();
vi.mock("next-themes", () => ({ useTheme: () => ({ theme: mockTheme, setTheme }) }));
vi.mock("next/link", () => ({
  default: ({ children, href, ...r }: React.PropsWithChildren<{ href: string }>) =>
    React.createElement("a", { href, ...r }, children),
}));
const hardReload = vi.fn();
const clearPerUserStorage = vi.fn();
vi.mock("@/lib/client/hard-reload", () => ({
  hardReload: (...a: unknown[]) => hardReload(...a),
  clearPerUserStorage: (...a: unknown[]) => clearPerUserStorage(...a),
}));

import { MoreMenu, buildMoreGroups } from "@/components/more-menu";
import { MANAGE_ACCOUNTS_HREF } from "@/lib/client/account-page";
import { allFlatItems, mobileBarItems } from "@/components/nav";

let session: Record<string, unknown>;
let dev: boolean;
let announcements: unknown[];
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  sessionStorage.clear();
  replace.mockClear();
  setTheme.mockClear();
  mockTheme = "system";
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
      return j([
        { userId: "u1", email: "a@b.c", displayName: "A", active: true, status: "active" },
        { userId: "u2", email: "x@y.z", displayName: "X", active: false, status: "switchable" },
      ]);
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
      ["Spending by category", "/categories"],
      ["Family Wealth", "/family"],
      ["Reconcile", "/import?tab=reconcile"],
      ["Categories", "/settings/categorization"],
      ["Import", "/import"],
    ]);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/announcements"));
    expect(rows("tools").map((r) => r[0])).toEqual(["What's new", "Settings"]);
    expect(within(group("tools")).getByTestId("more-signout").textContent).toBe("Sign out");
    expect(rows("explore").map((r) => r[1])).toEqual(["/subscriptions", "/loans"]);
  });

  it("hides What's new when there are no announcements", async () => {
    announcements = [];
    render(<MoreMenu />);
    await waitFor(() => expect(screen.queryByText("What's new")).toBeNull());
    expect(rows("tools").map((r) => r[0])).toEqual(["Settings"]);
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

  it("shows admin rows in correct order", async () => {
    session = { isAdmin: true };
    render(<MoreMenu />);
    await waitFor(() => expect(screen.getByTestId("more-group-admin")).toBeTruthy());
    const expectedHrefs = [
      "/admin",
      "/admin/inbox",
      "/admin/email-inbox",
      "/admin/env",
      "/admin/announcements",
      "/admin/feedback",
    ];
    expect(rows("admin").map((r) => r[1])).toEqual(expectedHrefs);
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

  it("shows badge with unread announcement count on whats-new row", async () => {
    announcements = [{ id: 1, read: false }, { id: 2, read: false }];
    render(<MoreMenu />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/announcements"));
    const whatsnewRow = screen.getAllByTestId("more-row").find((r) => r.textContent?.includes("What's new"));
    expect(whatsnewRow?.textContent).toContain("2");
  });

  it("shows no badge when all announcements are read", async () => {
    announcements = [{ id: 1, read: true }, { id: 2, read: true }];
    render(<MoreMenu />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/announcements"));
    const whatsnewRow = screen.getAllByTestId("more-row").find((r) => r.textContent?.includes("What's new"));
    expect(whatsnewRow?.textContent).not.toContain("2");
    expect(whatsnewRow?.querySelector("[class*='bg-primary']")).toBeNull();
  });
});

describe("More Account section", () => {
  it("is the first section, titled Account, listing accounts then Add then Manage inside one card", async () => {
    render(<MoreMenu />);
    const sec = screen.getByTestId("more-account");
    expect(within(sec).getByRole("heading", { level: 2 }).textContent).toBe("Account");
    await waitFor(() => expect(within(sec).getAllByTestId("account-row")).toHaveLength(2));
    expect(within(sec).getAllByTestId("account-row")[0].textContent).toMatch(/a@b\.c/);
    expect(within(sec).getByRole("button", { name: /add another account/i })).toBeTruthy();
    expect(within(sec).getByRole("link", { name: /manage accounts/i }).getAttribute("href")).toBe(MANAGE_ACCOUNTS_HREF);
    const root = screen.getByTestId("more-menu");
    const first = root.querySelector("section")!;
    expect(first).toBe(sec);
    // no old popover items
    expect(screen.queryByText(/sign out of all accounts/i)).toBeNull();
  });

  it("hidden accounts are left out of the list", async () => {
    localStorage.setItem("pf-hidden-accounts", JSON.stringify(["u2"]));
    render(<MoreMenu />);
    await waitFor(() => expect(within(screen.getByTestId("more-account")).getAllByTestId("account-row")).toHaveLength(1));
    localStorage.clear();
  });
});

describe("More Appearance row", () => {
  it("sits in the Tools group (not Account), shows the current choice and drives setTheme", () => {
    mockTheme = "dark";
    render(<MoreMenu />);
    const row = screen.getByTestId("more-appearance");
    expect(group("tools").contains(row)).toBe(true);
    expect(screen.getByTestId("more-account").contains(row)).toBe(false);
    const radios = within(row).getAllByRole("radio");
    expect(radios.map((r) => r.textContent)).toEqual(["System", "Light", "Dark"]);
    expect(radios.map((r) => r.getAttribute("aria-checked"))).toEqual(["false", "false", "true"]);
    fireEvent.click(within(row).getByRole("radio", { name: "Light" }));
    expect(setTheme).toHaveBeenCalledWith("light");
    fireEvent.click(within(row).getByRole("radio", { name: "System" }));
    expect(setTheme).toHaveBeenCalledWith("system");
  });
});

describe("More keeps everything the old sheet offered reachable", () => {
  it("every non-bar nav item (all flags on) has a row, except owner-removed /feedback", () => {
    const all = buildMoreGroups({ isAdmin: true, devMode: true, familyEnabled: true, hasAnnouncements: true, instanceAdminEnabled: true, categoriesMerged: false });
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

describe("More instance admin filter (WP9a)", () => {
  it("hides Instance config when instanceAdminEnabled={false}", () => {
    const groups = buildMoreGroups({ isAdmin: true, devMode: false, familyEnabled: true, hasAnnouncements: true, instanceAdminEnabled: false, categoriesMerged: false });
    const allHrefs = new Set(groups.flatMap((g) => g.rows.map((r) => r.href)));
    expect(allHrefs.has("/admin/instance")).toBe(false);
  });

  it("shows Instance config when instanceAdminEnabled={true}", () => {
    const groups = buildMoreGroups({ isAdmin: true, devMode: false, familyEnabled: true, hasAnnouncements: true, instanceAdminEnabled: true, categoriesMerged: false });
    const allHrefs = new Set(groups.flatMap((g) => g.rows.map((r) => r.href)));
    expect(allHrefs.has("/admin/instance")).toBe(true);
  });

  it("renders Instance config row in MoreMenu when instanceAdminEnabled={true} with admin session", async () => {
    session = { isAdmin: true };
    const { unmount } = render(<MoreMenu instanceAdminEnabled={true} />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/announcements"));
    const configLink = screen.queryByRole("link", { name: /Instance config/i });
    expect(configLink).toBeTruthy();
    expect(configLink?.getAttribute("href")).toBe("/admin/instance");
    unmount();
  });

  it("does not render Instance config row in MoreMenu when instanceAdminEnabled={false} with admin session", async () => {
    session = { isAdmin: true };
    const { unmount } = render(<MoreMenu instanceAdminEnabled={false} />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/announcements"));
    const configLink = screen.queryByRole("link", { name: /Instance config/i });
    expect(configLink).toBeNull();
    unmount();
  });
});
