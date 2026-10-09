/**
 * @vitest-environment jsdom
 * Logged-out invite link: token is stashed in sessionStorage (never in another URL), stripped from
 * the address bar, then consumed exactly once after sign-in.
 */
import "@testing-library/jest-dom";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, push: vi.fn() }), usePathname: () => "/family/accept" }));

import { UnlockGate } from "@/components/unlock-gate";
import FamilyAcceptPage from "@/app/(app)/family/accept/page";
import { safeNext } from "@/lib/auth/google-ui";
import { INVITE_STASH_KEY } from "@/lib/family/invite-stash";
import { FAMILY_STRINGS } from "@/lib/family/strings";

const TOKEN = "cd".repeat(32);
let posts: { url: string; body: Record<string, unknown> }[];
let acceptStatus = 200;
let authenticated = false;

beforeEach(() => {
  posts = [];
  acceptStatus = 200;
  authenticated = false;
  replace.mockClear();
  sessionStorage.clear();
  window.history.replaceState(null, "", "/");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "/api/auth/session") return new Response(JSON.stringify({ authenticated }), { status: 200 });
      if (url.startsWith("/api/family/manage/")) {
        posts.push({ url, body: JSON.parse(String(init?.body)) });
        return new Response(JSON.stringify(acceptStatus === 200 ? { ok: true } : { error: "gone" }), {
          status: acceptStatus,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response("{}", { status: 404 });
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const stash = () => sessionStorage.getItem(INVITE_STASH_KEY);
const put = (ts: number, token = TOKEN) => sessionStorage.setItem(INVITE_STASH_KEY, JSON.stringify({ token, ts }));

describe("logged-out visit", () => {
  it("stashes token, strips it from the URL, redirects to /cloud?redirect=/family/accept with no token anywhere", async () => {
    window.history.replaceState(null, "", `/family/accept?token=${TOKEN}`);
    render(<UnlockGate><div>app</div></UnlockGate>);
    await waitFor(() => expect(replace).toHaveBeenCalled());
    expect(replace).toHaveBeenCalledTimes(1);
    const target = replace.mock.calls[0][0] as string;
    expect(target).toBe("/cloud?redirect=%2Ffamily%2Faccept");
    expect(target).not.toContain(TOKEN);
    expect(target).not.toMatch(/token/);
    expect(safeNext(new URLSearchParams(target.split("?")[1]).get("redirect"))).toBe("/family/accept");
    expect(window.location.href).not.toContain(TOKEN);
    expect(window.location.search).toBe("");
    expect(JSON.parse(stash()!)).toMatchObject({ token: TOKEN });
    expect(typeof JSON.parse(stash()!).ts).toBe("number");
  });

  it("without a token redirects to plain /cloud and stashes nothing", async () => {
    window.history.replaceState(null, "", "/family/accept");
    render(<UnlockGate><div>app</div></UnlockGate>);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/cloud"));
    expect(stash()).toBeNull();
  });
});

describe("after login on /family/accept", () => {
  it("consumes the stash once and posts {token} to accept; a second visit does not re-accept", async () => {
    put(Date.now());
    const user = userEvent.setup();
    const { unmount } = render(<FamilyAcceptPage />);
    expect(stash()).toBeNull(); // deleted immediately on read
    await user.click(await screen.findByRole("button", { name: FAMILY_STRINGS.accept_button }));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]).toEqual({ url: "/api/family/manage/accept", body: { token: TOKEN } });
    await screen.findByText(FAMILY_STRINGS.accept_success);
    unmount();

    render(<FamilyAcceptPage />);
    expect(await screen.findByText(FAMILY_STRINGS.accept_link_missing)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: FAMILY_STRINGS.accept_button })).toBeNull();
    expect(posts).toHaveLength(1);
  });

  it("ignores an expired (>30 min) stash, shows the open-the-email-link message and clears it", async () => {
    put(Date.now() - 31 * 60 * 1000);
    render(<FamilyAcceptPage />);
    expect(await screen.findByText(FAMILY_STRINGS.accept_link_missing)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: FAMILY_STRINGS.accept_button })).toBeNull();
    expect(stash()).toBeNull();
    expect(posts).toHaveLength(0);
  });

  it("accepts a stash just under 30 min old", async () => {
    put(Date.now() - 29 * 60 * 1000);
    render(<FamilyAcceptPage />);
    expect(await screen.findByRole("button", { name: FAMILY_STRINGS.accept_button })).toBeInTheDocument();
  });

  it("missing stash shows the message", async () => {
    render(<FamilyAcceptPage />);
    expect(await screen.findByText(FAMILY_STRINGS.accept_link_missing)).toBeInTheDocument();
  });

  it("stash stays cleared after a 410 failure", async () => {
    put(Date.now());
    acceptStatus = 410;
    const user = userEvent.setup();
    render(<FamilyAcceptPage />);
    await user.click(await screen.findByRole("button", { name: FAMILY_STRINGS.accept_button }));
    await screen.findByText(FAMILY_STRINGS.accept_expired);
    expect(posts[0].body).toEqual({ token: TOKEN });
    expect(stash()).toBeNull();
  });

  it("a token in the URL (logged-in click) is stripped and wins over/clears any stale stash", async () => {
    put(Date.now(), "stale");
    window.history.replaceState(null, "", `/family/accept?token=${TOKEN}`);
    const user = userEvent.setup();
    render(<FamilyAcceptPage />);
    await user.click(await screen.findByRole("button", { name: FAMILY_STRINGS.accept_button }));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0].body).toEqual({ token: TOKEN });
    expect(window.location.search).toBe("");
    expect(stash()).toBeNull();
  });
});
