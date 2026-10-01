/**
 * @vitest-environment jsdom
 * Multi-account B3 UI: AccountSwitcher (sidebar account menu).
 * Covers listing, switch, needs_login, add (+cap), sign out (this/all),
 * locked accounts, error states, double-submit guard, XSS, a11y.
 */
import "@testing-library/jest-dom";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const push = vi.fn();
const hardReload = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/client/hard-reload", async (orig) => {
  const real = await orig<typeof import("@/lib/client/hard-reload")>();
  return { ...real, hardReload: (...a: unknown[]) => hardReload(...a) };
});

import { AccountSwitcher, type Account } from "@/components/account-switcher";

type Reply = { status?: number; body?: unknown; throws?: boolean; delay?: Promise<void> };
let replies: Record<string, Reply>;
let calls: { method: string; url: string; body?: unknown }[];

const acct = (n: number, over: Partial<Account> = {}): Account => ({
  userId: `u${n}`,
  email: `user${n}@example.com`,
  displayName: `User${n}`,
  active: n === 1,
  status: n === 1 ? "active" : "switchable",
  ...over,
});

function setAccounts(list: Account[]) {
  replies["GET /api/auth/accounts"] = { body: list };
}

beforeEach(() => {
  cleanup();
  push.mockClear();
  hardReload.mockClear();
  calls = [];
  replies = {};
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      calls.push({ method, url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      const r = replies[`${method} ${url}`] ?? { status: 404, body: {} };
      if (r.delay) await r.delay;
      if (r.throws) throw new TypeError("Failed to fetch");
      const status = r.status ?? 200;
      return { ok: status < 400, status, json: async () => r.body } as Response;
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const callsTo = (method: string, url: string) =>
  calls.filter((c) => c.method === method && c.url === url);

async function openMenu(list: Account[]) {
  setAccounts(list);
  const user = userEvent.setup();
  render(<AccountSwitcher />);
  const trigger = await screen.findByRole("button", { name: /account menu/i });
  await user.click(trigger);
  await screen.findByRole("menu");
  return { user, trigger };
}
const item = (name: RegExp) => screen.getByRole("menuitem", { name });

describe("AccountSwitcher listing", () => {
  it("lists accounts from GET /api/auth/accounts (active in trigger, others in menu)", async () => {
    await openMenu([acct(1, { isAdmin: true }), acct(2), acct(3, { status: "locked" })]);
    expect(callsTo("GET", "/api/auth/accounts")).toHaveLength(1);
    expect(screen.getAllByText("user1@example.com").length).toBeGreaterThan(0);
    expect(item(/user2@example\.com/)).toBeInTheDocument();
    expect(item(/user3@example\.com/)).toBeInTheDocument();
    expect(screen.getByText("Admin")).toBeInTheDocument();
  });

  it("renders nothing when the accounts request fails", async () => {
    replies["GET /api/auth/accounts"] = { throws: true };
    const { container } = render(<AccountSwitcher />);
    await waitFor(() => expect(callsTo("GET", "/api/auth/accounts")).toHaveLength(1));
    expect(container).toBeEmptyDOMElement();
  });

  it("renders names and emails as text only (no HTML injection)", async () => {
    const evil = '<img src=x onerror="window.__xss=1">';
    await openMenu([acct(1), acct(2, { displayName: evil, email: `"><script>window.__xss=1</script>@x.io` })]);
    expect(document.querySelector("img[src='x']")).toBeNull();
    expect(document.querySelector("script")).toBeNull();
    expect(screen.getByText(evil)).toBeInTheDocument();
    expect((window as unknown as { __xss?: number }).__xss).toBeUndefined();
  });
});

describe("AccountSwitcher switch", () => {
  it("posts the clicked userId and hardReloads to /dashboard (never router.push)", async () => {
    replies["POST /api/auth/switch"] = { body: { status: "switched" } };
    const { user } = await openMenu([acct(1), acct(2), acct(3)]);
    await user.click(item(/user3@example\.com/));
    await waitFor(() => expect(hardReload).toHaveBeenCalledWith("/dashboard"));
    expect(callsTo("POST", "/api/auth/switch")).toEqual([
      { method: "POST", url: "/api/auth/switch", body: { userId: "u3" } },
    ]);
    expect(hardReload).toHaveBeenCalledTimes(1);
    expect(push).not.toHaveBeenCalled();
  });

  it("409 needs_login: add-intent, then hardReload /cloud?add=1&email= (URL-encoded)", async () => {
    replies["POST /api/auth/switch"] = {
      status: 409,
      body: { status: "needs_login", email: "bob+tag@example.com&x=1", hasPassword: true, googleLinked: false },
    };
    replies["POST /api/auth/add-intent"] = { body: { status: "ready" } };
    const { user } = await openMenu([acct(1), acct(2)]);
    await user.click(item(/user2@example\.com/));
    await waitFor(() => expect(hardReload).toHaveBeenCalled());
    expect(hardReload).toHaveBeenCalledWith(
      `/cloud?add=1&email=${encodeURIComponent("bob+tag@example.com&x=1")}`,
    );
    expect(hardReload.mock.calls[0][0]).not.toContain("&x=1");
    expect(callsTo("POST", "/api/auth/add-intent")).toHaveLength(1);
    expect(push).not.toHaveBeenCalled();
  });

  it("locked account: shows 'Sign in again' and routes to the add flow without a switch call", async () => {
    replies["POST /api/auth/add-intent"] = { body: { status: "ready" } };
    const { user } = await openMenu([acct(1), acct(2, { status: "locked" })]);
    expect(screen.getByText("Sign in again")).toBeInTheDocument();
    await user.click(item(/Sign in again/));
    await waitFor(() => expect(hardReload).toHaveBeenCalledWith("/cloud?add=1&email=user2%40example.com"));
    expect(callsTo("POST", "/api/auth/switch")).toHaveLength(0);
    expect(callsTo("POST", "/api/auth/add-intent")).toHaveLength(1);
  });

  it("switch network failure shows an alert and does not reload", async () => {
    replies["POST /api/auth/switch"] = { throws: true };
    const { user } = await openMenu([acct(1), acct(2)]);
    await user.click(item(/user2@example\.com/));
    expect(await screen.findByRole("alert")).toHaveTextContent(/something went wrong/i);
    expect(hardReload).not.toHaveBeenCalled();
  });

  it("switch 404 (account gone) shows a message and does not reload", async () => {
    replies["POST /api/auth/switch"] = { status: 404, body: { error: "nope" } };
    const { user } = await openMenu([acct(1), acct(2)]);
    await user.click(item(/user2@example\.com/));
    expect(await screen.findByRole("alert")).toHaveTextContent(/no longer available/i);
    expect(hardReload).not.toHaveBeenCalled();
  });

  it("double-submit: a second switch click while one is in flight is ignored", async () => {
    let release!: () => void;
    replies["POST /api/auth/switch"] = {
      body: { status: "switched" },
      delay: new Promise<void>((r) => (release = r)),
    };
    const { user, trigger } = await openMenu([acct(1), acct(2), acct(3)]);
    await user.click(item(/user2@example\.com/));
    await waitFor(() => expect(callsTo("POST", "/api/auth/switch")).toHaveLength(1));
    // menu closed; reopen and try another action while busy
    await user.click(trigger);
    const other = screen.queryByRole("menuitem", { name: /user3@example\.com/ });
    if (other) await user.click(other);
    release();
    await waitFor(() => expect(hardReload).toHaveBeenCalledTimes(1));
    expect(callsTo("POST", "/api/auth/switch")).toHaveLength(1);
  });
});

describe("AccountSwitcher add account", () => {
  it("posts add-intent then hardReloads to /cloud?add=1", async () => {
    replies["POST /api/auth/add-intent"] = { body: { status: "ready" } };
    const { user } = await openMenu([acct(1), acct(2)]);
    await user.click(item(/add another account/i));
    await waitFor(() => expect(hardReload).toHaveBeenCalledWith("/cloud?add=1"));
    expect(callsTo("POST", "/api/auth/add-intent")).toHaveLength(1);
    expect(push).not.toHaveBeenCalled();
  });

  it("is disabled at 5 accounts and makes no request", async () => {
    const { user } = await openMenu([1, 2, 3, 4, 5].map((n) => acct(n)));
    const add = item(/add another account/i);
    expect(add).toHaveAttribute("aria-disabled", "true");
    expect(add).toHaveTextContent(/max 5/);
    await user.click(add);
    expect(callsTo("POST", "/api/auth/add-intent")).toHaveLength(0);
    expect(hardReload).not.toHaveBeenCalled();
  });

  it("account_cap 409 from the server shows the cap message, no reload", async () => {
    replies["POST /api/auth/add-intent"] = { status: 409, body: { error: "account_cap" } };
    const { user } = await openMenu([acct(1), acct(2)]);
    await user.click(item(/add another account/i));
    expect(await screen.findByRole("alert")).toHaveTextContent(/maximum of 5 accounts/i);
    expect(hardReload).not.toHaveBeenCalled();
  });

  it("add-intent network failure shows an alert, no reload", async () => {
    replies["POST /api/auth/add-intent"] = { throws: true };
    const { user } = await openMenu([acct(1)]);
    await user.click(item(/add another account/i));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(hardReload).not.toHaveBeenCalled();
  });

  it("alert can be dismissed", async () => {
    replies["POST /api/auth/add-intent"] = { status: 500, body: {} };
    const { user } = await openMenu([acct(1)]);
    await user.click(item(/add another account/i));
    await screen.findByRole("alert");
    await user.click(screen.getByRole("button", { name: /dismiss/i }));
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("AccountSwitcher sign out", () => {
  it("sign out of this account: POST logout, then hardReload to /dashboard when another account is active", async () => {
    replies["POST /api/auth/logout"] = { body: { success: true, activeUserId: "u2" } };
    const { user } = await openMenu([acct(1), acct(2)]);
    await user.click(item(/sign out of this account/i));
    await waitFor(() => expect(hardReload).toHaveBeenCalledWith("/dashboard"));
    expect(callsTo("POST", "/api/auth/logout")).toHaveLength(1);
    expect(callsTo("POST", "/api/auth/logout?all=1")).toHaveLength(0);
    expect(push).not.toHaveBeenCalled();
  });

  it("sign out of the last account: hardReload to /", async () => {
    replies["POST /api/auth/logout"] = { body: { success: true, activeUserId: null } };
    const { user } = await openMenu([acct(1)]);
    await user.click(item(/sign out of this account/i));
    await waitFor(() => expect(hardReload).toHaveBeenCalledWith("/"));
  });

  it("sign out of all accounts: POST logout?all=1 then hardReload /", async () => {
    replies["POST /api/auth/logout?all=1"] = { body: { success: true, activeUserId: null } };
    const { user } = await openMenu([acct(1), acct(2)]);
    await user.click(item(/sign out of all accounts/i));
    await waitFor(() => expect(hardReload).toHaveBeenCalledWith("/"));
    expect(callsTo("POST", "/api/auth/logout?all=1")).toHaveLength(1);
    expect(callsTo("POST", "/api/auth/logout")).toHaveLength(0);
  });

  it("clears per-user storage of the signed-out account", async () => {
    localStorage.setItem("pf-spotlight-dismissed:u1", "1");
    replies["POST /api/auth/logout"] = { body: { success: true, activeUserId: null } };
    const { user } = await openMenu([acct(1)]);
    await user.click(item(/sign out of this account/i));
    await waitFor(() => expect(hardReload).toHaveBeenCalled());
    expect(localStorage.getItem("pf-spotlight-dismissed:u1")).toBeNull();
  });

  it("logout failure (500) shows an alert and does not reload", async () => {
    replies["POST /api/auth/logout"] = { status: 500, body: {} };
    const { user } = await openMenu([acct(1), acct(2)]);
    await user.click(item(/sign out of this account/i));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(hardReload).not.toHaveBeenCalled();
  });

  it("logout network failure shows an alert and does not reload", async () => {
    replies["POST /api/auth/logout"] = { throws: true };
    const { user } = await openMenu([acct(1)]);
    await user.click(item(/sign out of this account/i));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(hardReload).not.toHaveBeenCalled();
  });
});

describe("AccountSwitcher a11y", () => {
  it("trigger exposes aria-haspopup and aria-expanded that tracks open state", async () => {
    setAccounts([acct(1), acct(2)]);
    const user = userEvent.setup();
    render(<AccountSwitcher />);
    const trigger = await screen.findByRole("button", { name: /account menu/i });
    expect(trigger).toHaveAttribute("aria-haspopup", "menu");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    await user.click(trigger);
    await screen.findByRole("menu");
    expect(trigger).toHaveAttribute("aria-expanded", "true");
  });

  it("Escape closes the menu and returns focus to the trigger", async () => {
    const { user, trigger } = await openMenu([acct(1), acct(2)]);
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it("opens from the keyboard and every item is reachable with arrow keys", async () => {
    setAccounts([acct(1), acct(2)]);
    const user = userEvent.setup();
    render(<AccountSwitcher />);
    const trigger = await screen.findByRole("button", { name: /account menu/i });
    trigger.focus();
    await user.keyboard("{Enter}");
    await screen.findByRole("menu");
    const items = screen.getAllByRole("menuitem");
    expect(items.length).toBe(4); // 1 other account, add, sign out, sign out all
    const seen = new Set<Element>();
    if (document.activeElement) seen.add(document.activeElement); // keyboard open focuses first item
    for (let i = 0; i < items.length + 1; i++) {
      await user.keyboard("{ArrowDown}");
      if (document.activeElement) seen.add(document.activeElement);
    }
    for (const it of items) expect(seen.has(it)).toBe(true);
  });

  it("Enter on a focused item activates it", async () => {
    replies["POST /api/auth/switch"] = { body: { status: "switched" } };
    setAccounts([acct(1), acct(2)]);
    const user = userEvent.setup();
    render(<AccountSwitcher />);
    const trigger = await screen.findByRole("button", { name: /account menu/i });
    trigger.focus();
    await user.keyboard("{Enter}");
    await screen.findByRole("menu");
    item(/user2@example\.com/).focus();
    await user.keyboard("{Enter}");
    await waitFor(() => expect(hardReload).toHaveBeenCalledWith("/dashboard"));
  });
});
