/**
 * @vitest-environment jsdom
 * Multi-account UI: AccountSwitcher, "dropdown" (desktop) and "list" (More).
 * Covers listing (current first, hidden filtered), tap current -> account
 * page, switch then navigate, needs_login, add (+cap), manage link, locked
 * accounts, error states, double-submit guard, XSS, a11y.
 */
import "@testing-library/jest-dom";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render as rtlRender, screen, waitFor, cleanup, act } from "@testing-library/react";
import { SWRConfig } from "swr";
import userEvent from "@testing-library/user-event";

const render = (ui: React.ReactElement) =>
  rtlRender(<SWRConfig value={{ provider: () => new Map() }}>{ui}</SWRConfig>);

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
import { ACCOUNT_PAGE_HREF, MANAGE_ACCOUNTS_HREF } from "@/lib/client/account-page";
import { HIDDEN_ACCOUNTS_KEY } from "@/lib/client/hidden-accounts";

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
  localStorage.clear();
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

describe("AccountSwitcher dropdown listing", () => {
  it("lists visible accounts, current first, then Add, then Manage", async () => {
    await openMenu([acct(2), acct(1, { isAdmin: true }), acct(3, { status: "locked" })]);
    expect(callsTo("GET", "/api/auth/accounts")).toHaveLength(1);
    const names = screen.getAllByRole("menuitem").map((i) => i.textContent);
    expect(names[0]).toMatch(/user1@example\.com/);
    expect(names[0]).toMatch(/Current/);
    expect(names[1]).toMatch(/user2@example\.com/);
    expect(names[2]).toMatch(/user3@example\.com/);
    expect(names[3]).toMatch(/Add another account/);
    expect(names[4]).toMatch(/Manage accounts/);
    expect(names).toHaveLength(5);
    expect(screen.getByText("Admin")).toBeInTheDocument();
  });

  it("omits hidden accounts but never hides the active one", async () => {
    localStorage.setItem(HIDDEN_ACCOUNTS_KEY, JSON.stringify(["u2", "u1"]));
    await openMenu([acct(1), acct(2), acct(3)]);
    const text = screen.getAllByRole("menuitem").map((i) => i.textContent).join("|");
    expect(text).toMatch(/user1@example\.com/);
    expect(text).not.toMatch(/user2@example\.com/);
    expect(text).toMatch(/user3@example\.com/);
    localStorage.clear();
  });

  it("renders nothing when the accounts request fails", async () => {
    replies["GET /api/auth/accounts"] = { throws: true };
    const { container } = render(<AccountSwitcher />);
    await waitFor(() => expect(callsTo("GET", "/api/auth/accounts")).toHaveLength(1));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when the accounts request returns 500", async () => {
    replies["GET /api/auth/accounts"] = { status: 500, body: {} };
    const { container } = render(<AccountSwitcher />);
    await waitFor(() => expect(callsTo("GET", "/api/auth/accounts")).toHaveLength(1));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
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

  it("Manage accounts pushes the manage route", async () => {
    const { user } = await openMenu([acct(1), acct(2)]);
    await user.click(item(/manage accounts/i));
    expect(push).toHaveBeenCalledWith(MANAGE_ACCOUNTS_HREF);
  });
});

describe("AccountSwitcher tap behaviour", () => {
  it("tapping the current account pushes the account page (no switch call)", async () => {
    const { user } = await openMenu([acct(1), acct(2)]);
    await user.click(item(/user1@example\.com/));
    expect(push).toHaveBeenCalledWith(ACCOUNT_PAGE_HREF);
    expect(callsTo("POST", "/api/auth/switch")).toHaveLength(0);
    expect(hardReload).not.toHaveBeenCalled();
  });

  it("tapping another account posts its userId and hardReloads to the account page (never router.push)", async () => {
    replies["POST /api/auth/switch"] = { body: { status: "switched" } };
    const { user } = await openMenu([acct(1), acct(2), acct(3)]);
    await user.click(item(/user3@example\.com/));
    await waitFor(() => expect(hardReload).toHaveBeenCalledWith(ACCOUNT_PAGE_HREF));
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
    const { user } = await openMenu([acct(1), acct(2), acct(3)]);
    await user.click(item(/user2@example\.com/));
    await waitFor(() => expect(callsTo("POST", "/api/auth/switch")).toHaveLength(1));
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

  it("add-intent network failure shows an alert, no reload; alert can be dismissed", async () => {
    replies["POST /api/auth/add-intent"] = { throws: true };
    const { user } = await openMenu([acct(1)]);
    await user.click(item(/add another account/i));
    await screen.findByRole("alert");
    expect(hardReload).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: /dismiss/i }));
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("AccountSwitcher list variant (More page)", () => {
  const renderList = async (list: Account[]) => {
    setAccounts(list);
    const user = userEvent.setup();
    const view = render(
      <div>
        <div data-testid="card"><AccountSwitcher variant="list" /></div>
        <div data-testid="after">menu below</div>
      </div>,
    );
    await screen.findAllByTestId("account-row");
    return { user, ...view };
  };

  it("renders rows inline (no menu/portal): current first, then Add, then Manage link; DOM order before content below", async () => {
    await renderList([acct(2), acct(1), acct(3)]);
    expect(screen.queryByRole("menu")).toBeNull();
    const rows = screen.getAllByTestId("account-row").map((r) => r.textContent);
    expect(rows[0]).toMatch(/user1@example\.com/);
    expect(rows[0]).toMatch(/Current/);
    expect(rows[1]).toMatch(/user2/);
    expect(rows[2]).toMatch(/user3/);
    expect(screen.getByRole("button", { name: /add another account/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /manage accounts/i })).toHaveAttribute("href", MANAGE_ACCOUNTS_HREF);
    const card = screen.getByTestId("card");
    const after = screen.getByTestId("after");
    expect(card.compareDocumentPosition(after) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(card.contains(screen.getByRole("link", { name: /manage accounts/i }))).toBe(true);
    expect(document.body.querySelectorAll("[data-base-ui-portal], [role=dialog]").length).toBe(0);
  });

  it("hidden accounts are not listed", async () => {
    localStorage.setItem(HIDDEN_ACCOUNTS_KEY, JSON.stringify(["u2"]));
    await renderList([acct(1), acct(2), acct(3)]);
    const rows = screen.getAllByTestId("account-row").map((r) => r.textContent);
    expect(rows).toHaveLength(2);
    expect(rows.join("|")).not.toMatch(/user2@/);
    localStorage.clear();
  });

  it("tapping the current account pushes the account page", async () => {
    const { user } = await renderList([acct(1), acct(2)]);
    await user.click(screen.getAllByTestId("account-row")[0]);
    expect(push).toHaveBeenCalledWith(ACCOUNT_PAGE_HREF);
    expect(callsTo("POST", "/api/auth/switch")).toHaveLength(0);
  });

  it("tapping another account switches with that userId, then hardReloads to the account page", async () => {
    replies["POST /api/auth/switch"] = { body: { status: "switched" } };
    const { user } = await renderList([acct(1), acct(2)]);
    await user.click(screen.getAllByTestId("account-row")[1]);
    await waitFor(() => expect(hardReload).toHaveBeenCalledWith(ACCOUNT_PAGE_HREF));
    expect(callsTo("POST", "/api/auth/switch")[0].body).toEqual({ userId: "u2" });
    expect(push).not.toHaveBeenCalled();
  });

  it("Add another account uses the add-intent flow", async () => {
    replies["POST /api/auth/add-intent"] = { body: { status: "ready" } };
    const { user } = await renderList([acct(1)]);
    await user.click(screen.getByRole("button", { name: /add another account/i }));
    await waitFor(() => expect(hardReload).toHaveBeenCalledWith("/cloud?add=1"));
  });
});

describe("AccountSwitcher a11y (dropdown)", () => {
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

  it("every item is reachable with arrow keys and Enter activates", async () => {
    replies["POST /api/auth/switch"] = { body: { status: "switched" } };
    setAccounts([acct(1), acct(2)]);
    const user = userEvent.setup();
    render(<AccountSwitcher />);
    const trigger = await screen.findByRole("button", { name: /account menu/i });
    trigger.focus();
    await user.keyboard("{Enter}");
    await screen.findByRole("menu");
    const items = screen.getAllByRole("menuitem");
    expect(items.length).toBe(4); // current, 1 other, add, manage
    const seen = new Set<Element>();
    if (document.activeElement) seen.add(document.activeElement);
    for (let i = 0; i < items.length + 1; i++) {
      await user.keyboard("{ArrowDown}");
      if (document.activeElement) seen.add(document.activeElement);
    }
    for (const it of items) expect(seen.has(it)).toBe(true);
    item(/user2@example\.com/).focus();
    await user.keyboard("{Enter}");
    await waitFor(() => expect(hardReload).toHaveBeenCalledWith(ACCOUNT_PAGE_HREF));
  });
});
