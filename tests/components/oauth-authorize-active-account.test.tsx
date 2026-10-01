/**
 * @vitest-environment jsdom
 * Multi-account B2: /oauth/authorize shows WHICH account will receive the grant
 * ("Continue as X · Switch account"), rendered on the server from the session cookie.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";
import { render, screen, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams("client_id=claude.ai&redirect_uri=https%3A%2F%2Fclaude.ai%2Fcb&response_type=code&code_challenge=abc"),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));

let cookieVal: string | undefined;
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (n: string) => (n === "pf_session" && cookieVal ? { value: cookieVal } : undefined) }),
}));
const resolveSessionToken = vi.fn();
vi.mock("@/lib/auth/session-bundle", () => ({
  ACTIVE_COOKIE: "pf_session",
  resolveSessionToken: (...a: unknown[]) => resolveSessionToken(...a),
}));
const getUserById = vi.fn();
vi.mock("@/lib/auth/queries", () => ({ getUserById: (...a: unknown[]) => getUserById(...a) }));

import { ActiveAccountBanner, authorizeReturnUrl } from "@/app/oauth/authorize/active-account";
import { AuthorizeClient } from "@/app/oauth/authorize/authorize-client";

const sp = { client_id: "claude.ai", redirect_uri: "https://claude.ai/cb", response_type: "code", code_challenge: "abc", state: "s&1" };
const html = async (p = sp) => renderToStaticMarkup((await ActiveAccountBanner({ searchParams: p })) as React.ReactElement);

beforeEach(() => {
  cookieVal = "tok";
  resolveSessionToken.mockReset().mockResolvedValue({ userId: "u1", jti: "j", dekPresent: true, status: "ok" });
  getUserById.mockReset().mockResolvedValue({ id: "u1", email: "alice@example.com", username: "alice" });
});

describe("oauth/authorize active-account banner (server)", () => {
  it("shows the ACTIVE account's email and a switch link back to this authorize request", async () => {
    const out = await html();
    expect(out).toContain("Continue as");
    expect(out).toContain("alice@example.com");
    expect(resolveSessionToken).toHaveBeenCalledWith("tok");
    expect(getUserById).toHaveBeenCalledWith("u1");
    const href = /href="([^"]+)"/.exec(out)![1].replace(/&amp;/g, "&");
    expect(href.startsWith("/cloud?add=1&redirect=")).toBe(true);
    const back = decodeURIComponent(href.split("redirect=")[1]);
    expect(back).toBe(authorizeReturnUrl(sp));
    expect(back).toContain("client_id=claude.ai");
    expect(back).toContain("state=s%261");
    expect(out).toContain("Switch account");
  });

  it("falls back to username when the account has no email", async () => {
    getUserById.mockResolvedValue({ id: "u1", email: null, username: "alice" });
    expect(await html()).toContain(">alice<");
  });

  it("escapes the label (no HTML injection via email/username)", async () => {
    getUserById.mockResolvedValue({ id: "u1", email: '<img src=x onerror=alert(1)>@x.test' });
    const out = await html();
    expect(out).not.toContain("<img");
    expect(out).toContain("&lt;img");
  });

  it("renders nothing without a session cookie, with a pending/expired/revoked token, or an unknown user", async () => {
    cookieVal = undefined;
    expect(await html()).toBe("");
    cookieVal = "tok";
    for (const status of ["pending", "expired", "revoked"]) {
      resolveSessionToken.mockResolvedValue({ userId: status === "pending" ? "u1" : null, jti: null, dekPresent: false, status });
      expect(await html()).toBe("");
    }
    resolveSessionToken.mockResolvedValue({ userId: "u1", jti: "j", dekPresent: true, status: "ok" });
    getUserById.mockResolvedValue(null);
    expect(await html()).toBe("");
  });

  it("a locked (DEK evicted) but valid session still names the account", async () => {
    resolveSessionToken.mockResolvedValue({ userId: "u1", jti: "j", dekPresent: false, status: "locked" });
    expect(await html()).toContain("alice@example.com");
  });
});

describe("consent UI embeds the server-rendered account line", () => {
  it("AuthorizeClient renders accountSlot above the permissions, alongside Allow/Deny", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => ({
      ok: true,
      status: 200,
      json: async () => (url.startsWith("/api/auth/session") ? { authenticated: true, userId: "u1" } : { client_name: "Claude", redirect_uris: ["https://claude.ai/cb"] }),
    })));
    render(<AuthorizeClient accountSlot={<p data-testid="slot">Continue as alice@example.com</p>} />);
    expect(await screen.findByTestId("slot")).toHaveTextContent("alice@example.com");
    expect(screen.getByRole("button", { name: /allow access/i })).toBeInTheDocument();
    cleanup();
    vi.unstubAllGlobals();
  });
});
