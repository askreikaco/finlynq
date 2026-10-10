/**
 * @vitest-environment jsdom
 * /manage-accounts: per-device show/hide (localStorage), remove (confirm +
 * existing per-account sign-out), sign out of all (confirm), add.
 */
import "@testing-library/jest-dom";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, screen, waitFor, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const hardReload = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/manage-accounts",
}));
vi.mock("@/lib/client/hard-reload", async (orig) => {
  const real = await orig<typeof import("@/lib/client/hard-reload")>();
  return { ...real, hardReload: (...a: unknown[]) => hardReload(...a) };
});

import { ManageAccounts } from "@/components/manage-accounts";
import { HIDDEN_ACCOUNTS_KEY } from "@/lib/client/hidden-accounts";

type A = { userId: string; email: string; displayName: string; active: boolean; status: string };
const list: A[] = [1, 2, 3].map((n) => ({
  userId: `u${n}`, email: `user${n}@example.com`, displayName: `User${n}`,
  active: n === 1, status: n === 1 ? "active" : "switchable",
}));
let calls: { method: string; url: string; body?: unknown }[];
let replies: Record<string, { status?: number; body?: unknown }>;

beforeEach(() => {
  cleanup();
  localStorage.clear();
  sessionStorage.clear();
  hardReload.mockClear();
  calls = [];
  replies = { "GET /api/auth/accounts": { body: list } };
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    calls.push({ method, url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    const r = replies[`${method} ${url}`] ?? { status: 404, body: {} };
    const status = r.status ?? 200;
    return { ok: status < 400, status, json: async () => r.body } as Response;
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const to = (m: string, u: string) => calls.filter((c) => c.method === m && c.url === u);
const cards = async () => screen.findAllByTestId("manage-account-card");
const sw = (email: string) => screen.getByRole("switch", { name: new RegExp(email.replace(".", "\\."), "i") });

describe("ManageAccounts", () => {
  it("lists one card per account with avatar/name/email", async () => {
    render(<ManageAccounts />);
    const c = await cards();
    expect(c).toHaveLength(3);
    expect(within(c[1]).getByText("User2")).toBeInTheDocument();
    expect(within(c[1]).getByText("user2@example.com")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Manage accounts" })).toBeInTheDocument();
  });

  it("the active account's switch is on and disabled", async () => {
    render(<ManageAccounts />);
    await cards();
    const s = sw("user1@example.com");
    expect(s).toHaveAttribute("aria-checked", "true");
    expect(s).toHaveAttribute("aria-disabled", "true");
  });

  it("toggling a switch hides the account and persists to localStorage", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<ManageAccounts />);
    await cards();
    expect(sw("user2@example.com")).toHaveAttribute("aria-checked", "true");
    await user.click(sw("user2@example.com"));
    expect(JSON.parse(localStorage.getItem(HIDDEN_ACCOUNTS_KEY)!)).toEqual(["u2"]);
    unmount();
    render(<ManageAccounts />);
    await cards();
    expect(sw("user2@example.com")).toHaveAttribute("aria-checked", "false");
    await user.click(sw("user2@example.com"));
    expect(JSON.parse(localStorage.getItem(HIDDEN_ACCOUNTS_KEY)!)).toEqual([]);
  });

  it("Remove needs a confirm, then switches to the account and signs it out (existing APIs)", async () => {
    replies["POST /api/auth/switch"] = { body: { status: "switched" } };
    replies["POST /api/auth/logout"] = { body: { success: true, activeUserId: "u1" } };
    const user = userEvent.setup();
    render(<ManageAccounts />);
    await cards();
    await user.click(screen.getByRole("button", { name: /remove user3@example\.com from this device/i }));
    expect(to("POST", "/api/auth/logout")).toHaveLength(0);
    await user.click(await screen.findByRole("button", { name: /^remove$/i }));
    await waitFor(() => expect(hardReload).toHaveBeenCalledWith("/dashboard"));
    expect(to("POST", "/api/auth/switch")[0].body).toEqual({ userId: "u3" });
    expect(to("POST", "/api/auth/logout")).toHaveLength(1);
    expect(to("POST", "/api/auth/logout?all=1")).toHaveLength(0);
  });

  it("Remove of the active account posts logout directly (no switch)", async () => {
    replies["POST /api/auth/logout"] = { body: { success: true, activeUserId: null } };
    const user = userEvent.setup();
    render(<ManageAccounts />);
    await cards();
    await user.click(screen.getByRole("button", { name: /remove user1@example\.com from this device/i }));
    await user.click(await screen.findByRole("button", { name: /^remove$/i }));
    await waitFor(() => expect(hardReload).toHaveBeenCalledWith("/"));
    expect(to("POST", "/api/auth/switch")).toHaveLength(0);
  });

  it("Cancel in the remove confirm makes no request", async () => {
    const user = userEvent.setup();
    render(<ManageAccounts />);
    await cards();
    await user.click(screen.getByRole("button", { name: /remove user2@example\.com from this device/i }));
    await user.click(await screen.findByRole("button", { name: /cancel/i }));
    expect(calls.filter((c) => c.method === "POST")).toHaveLength(0);
  });

  it("Sign out of all accounts needs a confirm, then POSTs logout?all=1 and reloads /", async () => {
    replies["POST /api/auth/logout?all=1"] = { body: { success: true, activeUserId: null } };
    const user = userEvent.setup();
    render(<ManageAccounts />);
    await cards();
    await user.click(screen.getByRole("button", { name: /^sign out of all accounts$/i }));
    expect(to("POST", "/api/auth/logout?all=1")).toHaveLength(0);
    await user.click(await screen.findByRole("button", { name: /^sign out of all$/i }));
    await waitFor(() => expect(hardReload).toHaveBeenCalledWith("/"));
    expect(to("POST", "/api/auth/logout?all=1")).toHaveLength(1);
    // Signing out must not bounce straight back in via the auto passkey prompt.
    expect(sessionStorage.getItem("pf-passkey-auto-skip")).toBe("1");
  });

  it("Add another account uses the add-intent flow", async () => {
    replies["POST /api/auth/add-intent"] = { body: { status: "ready" } };
    const user = userEvent.setup();
    render(<ManageAccounts />);
    await cards();
    await user.click(screen.getByRole("button", { name: /add another account/i }));
    await waitFor(() => expect(hardReload).toHaveBeenCalledWith("/cloud?add=1"));
  });
});
