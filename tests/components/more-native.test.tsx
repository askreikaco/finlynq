/**
 * @vitest-environment jsdom
 */
import "@testing-library/jest-dom";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render as rtlRender, screen, cleanup, within, waitFor, fireEvent } from "@testing-library/react";
import { SWRConfig } from "swr";
import { ACCOUNT_PAGE_HREF } from "@/lib/client/account-page";

const render = (ui: React.ReactElement) =>
  rtlRender(<SWRConfig value={{ provider: () => new Map() }}>{ui}</SWRConfig>);

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/more",
  useRouter: () => ({ replace: vi.fn(), push }),
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

import { MoreMenu } from "@/components/more-menu";

let session: Record<string, unknown>;
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  push.mockClear();
  setTheme.mockClear();
  hardReload.mockClear();
  clearPerUserStorage.mockClear();
  mockTheme = "system";
  session = { isAdmin: false };
  fetchMock = vi.fn(async (url: string, init?: { method?: string }) => {
    const j = (body: unknown, ok = true) => ({ ok, status: ok ? 200 : 500, json: async () => body });
    if (url === "/api/auth/session") return j(session);
    if (url === "/api/settings/dev-mode") return j({ devMode: false });
    if (url === "/api/announcements") return j([{ id: 1, read: false }]);
    if (url === "/api/auth/accounts")
      return j([
        { userId: "u1", email: "me@example.com", displayName: "Me", active: true, status: "active" },
        { userId: "u2", email: "other@example.com", displayName: "Other", active: false, status: "switchable" },
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

describe("More account card", () => {
  it("is the first section: a section header, then one inset group with the current account on top", async () => {
    render(<MoreMenu />);
    const sec = screen.getByTestId("more-account");
    expect(within(sec).getByRole("heading", { level: 2, name: "Account" })).toBeInTheDocument();
    const card = within(sec).getByTestId("more-account-card");
    expect(card).toHaveAttribute("data-slot", "inset-group");
    await waitFor(() => expect(within(card).getAllByTestId("account-row")).toHaveLength(2));
    const [current, other] = within(card).getAllByTestId("account-row");
    expect(current).toHaveAttribute("aria-current", "true");
    expect(current.textContent).toContain("me@example.com");
    expect(current.textContent).toContain("Current");
    expect(current.querySelector("svg")).not.toBeNull();
    expect(other).not.toHaveAttribute("aria-current");
    expect(other.textContent).toContain("Other");
  });

  it("tapping the current account goes to /account", async () => {
    render(<MoreMenu />);
    await waitFor(() => expect(screen.getAllByTestId("account-row")).toHaveLength(2));
    fireEvent.click(screen.getAllByTestId("account-row")[0]);
    expect(push).toHaveBeenCalledWith(ACCOUNT_PAGE_HREF);
  });

  it("the Add account row is the accent (primary) colour and sits inside the card before Manage accounts", async () => {
    render(<MoreMenu />);
    const card = screen.getByTestId("more-account-card");
    await waitFor(() => expect(within(card).getAllByTestId("account-row")).toHaveLength(2));
    const add = within(card).getByRole("button", { name: /add another account/i });
    expect(add).toHaveAttribute("data-variant", "accent");
    expect(add.querySelector(".text-primary")).not.toBeNull();
    const manage = within(card).getByRole("link", { name: /manage accounts/i });
    const all = Array.from(card.querySelectorAll("[data-slot='account-card'], [data-slot='inset-row']"));
    expect(all.indexOf(add)).toBeLessThan(all.indexOf(manage));
    expect(all.indexOf(add)).toBeGreaterThan(all.indexOf(card.querySelector("[data-slot='account-card']")!));
  });
});

describe("More section headers and groups", () => {
  it("headers appear in the existing group order (Explore, Tools, Admin) with Appearance after them, in grouped lists", async () => {
    session = { isAdmin: true };
    render(<MoreMenu />);
    await waitFor(() => expect(screen.getByTestId("more-group-admin")).toBeTruthy());
    const headers = screen
      .getByTestId("more-menu")
      .querySelectorAll("section > h2");
    expect(Array.from(headers).map((h) => h.textContent)).toEqual([
      "Account",
      "Explore",
      "Tools",
      "Admin",
      "Appearance",
    ]);
    for (const id of ["main", "explore", "tools", "admin", "appearance"]) {
      const g = screen.getByTestId(`more-group-${id}`);
      expect(g.querySelector("[data-slot='inset-group']")).not.toBeNull();
    }
  });

  it("every More row is an inset row inside an inset group, keeping its href", async () => {
    render(<MoreMenu />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/announcements"));
    const rows = screen.getAllByTestId("more-row");
    expect(rows.length).toBeGreaterThan(5);
    for (const r of rows) {
      expect(r).toHaveAttribute("data-slot", "inset-row");
      expect(r.closest("[data-slot='inset-group']")).not.toBeNull();
      expect(r.getAttribute("href")).toMatch(/^\//);
    }
  });

  it("unread badge shows on the What's new row as a trailing pill", async () => {
    render(<MoreMenu />);
    await waitFor(() => {
      const r = screen.getAllByTestId("more-row").find((x) => x.textContent?.includes("What's new"));
      expect(r?.textContent).toContain("1");
    });
  });
});

describe("More Appearance thumbnails", () => {
  it("is a radiogroup; the selected choice is the tab stop; arrows move and select the same theme", () => {
    mockTheme = "light";
    render(<MoreMenu />);
    const group = screen.getByRole("radiogroup", { name: "Appearance" });
    const radios = within(group).getAllByRole("radio");
    expect(radios.map((r) => r.textContent)).toEqual(["Light", "Dark", "System"]);
    expect(radios[0]).toHaveAttribute("aria-checked", "true");
    expect(radios[0]).toHaveAttribute("tabindex", "0");
    expect(radios[1]).toHaveAttribute("tabindex", "-1");
    fireEvent.keyDown(radios[0], { key: "ArrowRight" });
    expect(setTheme).toHaveBeenLastCalledWith("dark");
    fireEvent.click(radios[2]);
    expect(setTheme).toHaveBeenLastCalledWith("system");
  });

  it("the selection follows the stored theme", () => {
    mockTheme = "dark";
    render(<MoreMenu />);
    const dark = screen.getByRole("radio", { name: "Dark" });
    expect(dark).toHaveAttribute("aria-checked", "true");
  });
});

describe("More Log out row", () => {
  it("is the last thing on the page, destructive, with no chevron", () => {
    render(<MoreMenu />);
    const out = screen.getByTestId("more-signout");
    expect(out.textContent).toBe("Log out");
    expect(out).toHaveAttribute("data-variant", "destructive");
    expect(out.querySelector(".text-destructive")).not.toBeNull();
    expect(out.querySelector("svg.size-4")).toBeNull();
    const root = screen.getByTestId("more-menu");
    const lastGroup = root.lastElementChild as HTMLElement;
    expect(lastGroup.contains(out)).toBe(true);
  });

  it("posts logout, clears storage and hard-reloads", async () => {
    render(<MoreMenu />);
    fireEvent.click(screen.getByTestId("more-signout"));
    await waitFor(() => expect(hardReload).toHaveBeenCalledWith("/"));
    expect(fetchMock).toHaveBeenCalledWith("/api/auth/logout", { method: "POST" });
    expect(clearPerUserStorage).toHaveBeenCalledWith("u1");
  });
});
