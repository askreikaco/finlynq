/**
 * Recovery B3 — attack-surface guards (no DB).
 *  - /api/auth/mfa/recovery/verify is protected by the CSRF gate exactly like
 *    /api/auth/mfa/verify (neither is in CSRF_BYPASS_PATHS).
 *  - Pending tokens are accepted by AccountStrategy ONLY at /api/auth/mfa/verify.
 */
import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";
import fs from "fs";
import path from "path";

process.env.PF_JWT_SECRET = "test-jwt-secret-for-vitest-32chars!!";
process.env.DEPLOY_GENERATION = "0";

vi.mock("@/lib/auth/session-cutoff", async (orig) => ({
  ...(await orig<typeof import("@/lib/auth/session-cutoff")>()),
  getSessionCutoffCached: async () => null,
}));
vi.mock("@/lib/crypto/dek-cache", () => ({ getDEK: vi.fn(() => null) }));
vi.mock("@/db", () => ({
  db: { select: () => ({ from: () => ({ where: () => ({ limit: async () => [] }) }) }) },
}));
vi.mock("@/db/schema-pg", () => ({ revokedJtis: { jti: "jti", expiresAt: "expires_at" } }));

import { middleware } from "@/middleware";
import { createSessionToken } from "@/lib/auth/jwt";
import { AccountStrategy } from "@/lib/auth/strategies/account";

const PATHS = ["/api/auth/mfa/recovery/verify", "/api/auth/mfa/verify"];

function post(pathname: string, headers: Record<string, string>) {
  return new NextRequest(`http://localhost:3000${pathname}`, {
    method: "POST",
    headers: { cookie: "pf_session=stale.session.cookie", ...headers },
  });
}

describe("CSRF gate parity: mfa/recovery/verify == mfa/verify", () => {
  it("CSRF_BYPASS_PATHS does not contain either route (source check)", () => {
    const src = fs.readFileSync(path.join(process.cwd(), "src/middleware.ts"), "utf8");
    const block = src.slice(src.indexOf("const CSRF_BYPASS_PATHS"), src.indexOf("]);", src.indexOf("const CSRF_BYPASS_PATHS")));
    expect(block).not.toContain("/api/auth/mfa/");
  });

  for (const p of PATHS) {
    it(`${p}: cross-origin POST riding a session cookie -> 403 csrf-rejected`, async () => {
      const res = middleware(post(p, { origin: "https://evil.example" }));
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ error: "csrf-rejected" });
    });
    it(`${p}: same-origin POST passes the gate`, () => {
      const res = middleware(post(p, { origin: "http://localhost:3000" }));
      expect(res.status).not.toBe(403);
    });
  }
});

describe("pending tokens: AccountStrategy accepts them ONLY at /api/auth/mfa/verify", () => {
  const strategy = new AccountStrategy();
  const req = (p: string, tok: string) =>
    new NextRequest(`http://localhost:3000${p}`, { headers: { cookie: `pf_session=${tok}` } });

  it("rejected everywhere else, including the recovery routes", async () => {
    const { token } = await createSessionToken("u-pend", false, { pending: true, expirationTime: "5m" });
    for (const p of [
      "/api/settings/recovery-codes",
      "/api/auth/mfa/recovery/verify",
      "/api/auth/mfa/recovery",
      "/api/dashboard",
      "/api/settings/change-password",
      "/api/oauth/authorize",
    ]) {
      const r = await strategy.authenticate(req(p, token));
      expect(r.authenticated, p).toBe(false);
      if (!r.authenticated) expect((await r.response.json()).code, p).toBe("mfa-pending");
    }
    const ok = await strategy.authenticate(req("/api/auth/mfa/verify", token));
    expect(ok.authenticated).toBe(true);
  });

  it("source: only the single MFA_VERIFY_PATH literal is allow-listed", () => {
    const src = fs.readFileSync(path.join(process.cwd(), "src/lib/auth/strategies/account.ts"), "utf8");
    expect(src).toContain('const MFA_VERIFY_PATH = "/api/auth/mfa/verify";');
    expect(src).not.toContain("MFA_VERIFY_PATHS");
  });
});
