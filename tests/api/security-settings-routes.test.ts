/**
 * Security settings routes:
 * - GET /api/auth/session returns mfaEnabled (source of truth for the 2FA card)
 * - POST /api/auth/mfa/setup enable → 409 when MFA already enabled; field names
 * - GET /api/auth/device-current returns the pf_device id (never the secret)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

process.env.PF_JWT_SECRET = "test-jwt-secret-for-vitest-32chars!!";

vi.mock("@/db", () => ({
  getDialect: () => "postgres",
  schema: { settings: { value: "value", key: "key", userId: "user_id" } },
  db: {
    select: () => ({ from: () => ({ where: () => ({ limit: async () => [] }) }) }),
  },
}));
vi.mock("drizzle-orm", () => ({ and: vi.fn(), eq: vi.fn() }));
// Ownership/secret verification is covered against real Postgres in
// tests/auth/multi-device-b2.test.ts; here only the cookie -> id plumbing.
vi.mock("@/lib/auth/trusted-device", () => ({
  findUserDeviceId: async (v: string | undefined, _userId: string) => {
    const p = v?.split(".");
    return p && p.length === 2 ? p[0] : undefined;
  },
}));
vi.mock("@/lib/auth/google-oidc", () => ({ isGoogleConfigured: () => false }));

const getUserById = vi.fn();
const enableUserMfa = vi.fn();
vi.mock("@/lib/auth/queries", () => ({
  getUserById: (...a: unknown[]) => getUserById(...a),
  enableUserMfa: (...a: unknown[]) => enableUserMfa(...a),
  disableUserMfa: vi.fn(),
}));

const requireAuth = vi.fn();
vi.mock("@/lib/auth", () => ({
  requireAuth: (...a: unknown[]) => requireAuth(...a),
  generateMfaSecret: () => ({ secret: "S", uri: "otpauth://x" }),
  verifyMfaCode: () => true,
  verifyPassword: async () => true,
}));
vi.mock("@/lib/auth/require-auth", () => ({
  requireAuth: (...a: unknown[]) => requireAuth(...a),
}));
vi.mock("@/lib/crypto/dek-cache", () => ({ getDEK: () => Buffer.alloc(32) }));
vi.mock("@/lib/crypto/envelope", () => ({ decryptField: () => "S" }));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: () => ({ allowed: true, remaining: 5, resetAt: 0 }),
}));

import { GET as getSession } from "@/app/api/auth/session/route";
import { POST as mfaSetup } from "@/app/api/auth/mfa/setup/route";
import { GET as deviceCurrent } from "@/app/api/auth/device-current/route";

const ctx = {
  authenticated: true,
  context: { userId: "u1", method: "account", sessionId: "s1", mfaVerified: true, dek: Buffer.alloc(32) },
};

beforeEach(() => {
  vi.clearAllMocks();
  requireAuth.mockResolvedValue(ctx);
});

describe("GET /api/auth/session mfaEnabled", () => {
  it("returns mfaEnabled:true when the user has MFA on", async () => {
    getUserById.mockResolvedValue({ mfaEnabled: 1, role: "user" });
    const res = await getSession(new NextRequest("http://localhost/api/auth/session"));
    expect((await res.json()).mfaEnabled).toBe(true);
  });
  it("returns mfaEnabled:false when off", async () => {
    getUserById.mockResolvedValue({ mfaEnabled: 0, role: "user" });
    const res = await getSession(new NextRequest("http://localhost/api/auth/session"));
    expect((await res.json()).mfaEnabled).toBe(false);
  });
});

describe("POST /api/auth/mfa/setup enable", () => {
  const post = (body: unknown) =>
    mfaSetup(
      new NextRequest("http://localhost/api/auth/mfa/setup", {
        method: "POST",
        body: JSON.stringify(body),
      })
    );
  const enableBody = { action: "enable", secret: "S", code: "123456", currentPassword: "pw" };

  it("409 and no write when MFA is already enabled", async () => {
    getUserById.mockResolvedValue({ mfaEnabled: 1, mfaSecret: "x", passwordHash: "h" });
    const res = await post(enableBody);
    expect(res.status).toBe(409);
    expect(enableUserMfa).not.toHaveBeenCalled();
  });
  it("enables when not yet enabled", async () => {
    getUserById.mockResolvedValue({ mfaEnabled: 0, passwordHash: "h" });
    const res = await post(enableBody);
    expect(res.status).toBe(200);
    expect(enableUserMfa).toHaveBeenCalledTimes(1);
  });
  it("rejects a body without currentPassword (400)", async () => {
    getUserById.mockResolvedValue({ mfaEnabled: 0, passwordHash: "h" });
    const { currentPassword: _p, ...noPw } = enableBody;
    const res = await post(noPw);
    expect(res.status).toBe(400);
  });
});

describe("GET /api/auth/device-current", () => {
  const get = (cookie?: string) =>
    deviceCurrent(
      new NextRequest("http://localhost/api/auth/device-current", {
        headers: cookie ? { cookie } : {},
      })
    );
  it("returns the id half only", async () => {
    const res = await get("pf_device=dev-1.supersecret");
    const body = await res.json();
    expect(body).toEqual({ id: "dev-1" });
    expect(JSON.stringify(body)).not.toContain("supersecret");
  });
  it("returns null without a cookie", async () => {
    expect((await (await get()).json()).id).toBeNull();
  });
  it("passes through the 401 when unauthenticated", async () => {
    const { NextResponse } = await import("next/server");
    requireAuth.mockResolvedValue({
      authenticated: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    });
    expect((await get("pf_device=a.b")).status).toBe(401);
  });
});
