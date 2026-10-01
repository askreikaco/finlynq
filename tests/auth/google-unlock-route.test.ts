/**
 * Tests for POST /api/auth/google/unlock
 *
 * Covers:
 * a) missing cookies → 400
 * b) body without password → 400
 * c) wrong password → 401, upsertIdentity NOT called, pf_unlock cleared
 * d) right password, finishPasswordLogin → session with dek → 200, upsertIdentity called, issueDevice called, pf_session and pf_device set
 * e) finishPasswordLogin → mfa {token, jti, dek} → body {mfaRequired:true}, pf_google_link set with pendingJti, issueDevice NOT called
 * f) googleData.userId ≠ pending token sub → 400
 * g) per-user limit: checkRateLimit return allowed:false for keys starting "google:unlock:user:" → 429, assert windowMs 3_600_000
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

process.env.PF_JWT_SECRET = "test-jwt-secret-for-vitest-32chars!!";
process.env.DEPLOY_GENERATION = "0";

vi.mock("@/lib/auth/jwt", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth/jwt")>("@/lib/auth/jwt");
  return { ...actual, revokeJti: vi.fn(async () => undefined) };
});

vi.mock("@/lib/auth", () => ({
  verifyPassword: vi.fn(),
}));

vi.mock("@/lib/auth/finish-login", () => ({
  finishPasswordLogin: vi.fn(),
}));

vi.mock("@/lib/auth/queries", () => ({
  upsertIdentity: vi.fn(),
}));

vi.mock("@/lib/auth/trusted-device", () => ({
  issueDevice: vi.fn(),
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(),
}));

vi.mock("@/lib/client-ip", () => ({
  clientIp: () => "127.0.0.1",
}));

vi.mock("@/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => [
            {
              id: "user_id_123",
              passwordHash: "hashed_password",
              mfaEnabled: 0,
              kekSalt: null,
              dekWrapped: null,
              dekWrappedIv: null,
              dekWrappedTag: null,
              pepperVersion: null,
            },
          ],
        }),
      }),
    }),
  },
}));

vi.mock("@/db/schema-pg", () => ({
  users: {},
}));

vi.mock("drizzle-orm", () => ({
  eq: () => ({}),
}));

import { POST } from "@/app/api/auth/google/unlock/route";
import { createSessionToken, signShortLived, verifyShortLived, revokeJti, _clearRevokedJtiCache } from "@/lib/auth/jwt";
import * as auth from "@/lib/auth";
import * as finishLogin from "@/lib/auth/finish-login";
import * as queries from "@/lib/auth/queries";
import * as trustedDevice from "@/lib/auth/trusted-device";
import * as rateLimit from "@/lib/rate-limit";

const mockVerifyPassword = vi.mocked(auth.verifyPassword);
const mockFinishPasswordLogin = vi.mocked(finishLogin.finishPasswordLogin);
const mockUpsertIdentity = vi.mocked(queries.upsertIdentity);
const mockIssueDevice = vi.mocked(trustedDevice.issueDevice);
const mockRevokeJti = vi.mocked(revokeJti);
const mockCheckRateLimit = vi.mocked(rateLimit.checkRateLimit);

function makeUnlockRequest(opts: {
  unlockToken?: string | null;
  googleDataToken?: string | null;
  body?: Record<string, unknown>;
}): NextRequest {
  const url = new URL("http://localhost:3000/api/auth/google/unlock");

  const cookies: string[] = [];
  if (opts.unlockToken) cookies.push(`pf_unlock=${opts.unlockToken}`);
  if (opts.googleDataToken) cookies.push(`pf_google_unlock_data=${opts.googleDataToken}`);
  const cookieHeader = cookies.length > 0 ? cookies.join("; ") : undefined;

  const init: RequestInit = {
    method: "POST",
    headers: cookieHeader ? { cookie: cookieHeader } : {},
  };
  if (opts.body !== undefined) {
    init.body = JSON.stringify(opts.body);
    init.headers = { ...init.headers as Record<string, string>, "Content-Type": "application/json" };
  }

  return new NextRequest(url, init as never);
}

describe("/api/auth/google/unlock", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearRevokedJtiCache();
    mockCheckRateLimit.mockReturnValue({ allowed: true } as any);
    mockVerifyPassword.mockResolvedValue(false);
    mockUpsertIdentity.mockResolvedValue(undefined as any);
    mockIssueDevice.mockResolvedValue(null);
  });

  it("a) missing cookies → 400", async () => {
    const req = makeUnlockRequest({
      unlockToken: null,
      googleDataToken: null,
      body: { password: "test123" },
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("Missing unlock tokens");
  });

  it("b) body without password → 400", async () => {
    const { token: unlockToken } = await createSessionToken("user_id_123", false, {
      pending: true,
      expirationTime: "5m",
    });
    const googleDataToken = await signShortLived(
      { userId: "user_id_123", sub: "google_sub", email: "user@test.com", emailVerified: true },
      300,
      "google-unlock-data"
    );

    const req = makeUnlockRequest({
      unlockToken,
      googleDataToken,
      body: {},
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("Password required");
  });

  it("c) wrong password → 401 with retry:true, upsertIdentity NOT called, cookies NOT cleared", async () => {
    const { token: unlockToken, jti: unlockJti } = await createSessionToken("user_id_123", false, {
      pending: true,
      expirationTime: "5m",
    });
    const googleDataToken = await signShortLived(
      { userId: "user_id_123", sub: "google_sub", email: "user@test.com", emailVerified: true },
      300,
      "google-unlock-data"
    );

    mockVerifyPassword.mockResolvedValue(false);

    const req = makeUnlockRequest({
      unlockToken,
      googleDataToken,
      body: { password: "wrong_password" },
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe("Wrong password");
    expect(data.retry).toBe(true);

    // Verify upsertIdentity was NOT called
    expect(mockUpsertIdentity).not.toHaveBeenCalled();

    // Verify jti was NOT revoked (allow retries)
    expect(mockRevokeJti).not.toHaveBeenCalled();

    // Verify pf_unlock cookie was NOT cleared (allow retries)
    const setCookie = res.headers.get("set-cookie") || "";
    expect(setCookie).not.toContain("pf_unlock");
  });

  it("d) right password, finishPasswordLogin → session → 200, upsertIdentity called, issueDevice called", async () => {
    const { token: unlockToken } = await createSessionToken("user_id_123", false, {
      pending: true,
      expirationTime: "5m",
    });
    const googleDataToken = await signShortLived(
      { userId: "user_id_123", sub: "google_sub", email: "user@test.com", emailVerified: true },
      300,
      "google-unlock-data"
    );

    mockVerifyPassword.mockResolvedValue(true);
    mockFinishPasswordLogin.mockResolvedValue({
      kind: "session",
      token: "session_token_jwt",
      jti: "session_jti_123",
      dek: Buffer.alloc(32, 0xaa),
    });

    mockIssueDevice.mockResolvedValue({
      id: "device_id",
      cookieValue: "device_id.secret",
      maxAgeSeconds: 30 * 24 * 60 * 60,
    } as any);

    const req = makeUnlockRequest({
      unlockToken,
      googleDataToken,
      body: { password: "correct_password" },
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    // Verify upsertIdentity was called
    expect(mockUpsertIdentity).toHaveBeenCalledWith({
      userId: "user_id_123",
      provider: "google",
      subject: "google_sub",
      email: "user@test.com",
      emailVerified: 1,
    });

    // Verify issueDevice was called
    expect(mockIssueDevice).toHaveBeenCalled();

    // Verify pf_session and pf_device cookies are set
    const setCookie = res.headers.get("set-cookie") || "";
    expect(setCookie).toContain("pf_session");
    expect(setCookie).toContain("pf_device");
  });

  it("e) finishPasswordLogin → mfa → body {mfaRequired:true}, pf_google_link set with pendingJti, issueDevice NOT called", async () => {
    const { token: unlockToken, jti: unlockJti } = await createSessionToken("user_id_123", false, {
      pending: true,
      expirationTime: "5m",
    });
    const googleDataToken = await signShortLived(
      { userId: "user_id_123", sub: "google_sub", email: "user@test.com", emailVerified: true },
      300,
      "google-unlock-data"
    );

    mockVerifyPassword.mockResolvedValue(true);
    mockFinishPasswordLogin.mockResolvedValue({
      kind: "mfa",
      token: "mfa_pending_token",
      jti: "mfa_jti_123",
      dek: Buffer.alloc(32, 0xaa),
    });

    const req = makeUnlockRequest({
      unlockToken,
      googleDataToken,
      body: { password: "correct_password" },
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.mfaRequired).toBe(true);
    expect(data.mfaPendingToken).toBe("mfa_pending_token");

    // Verify issueDevice was NOT called
    expect(mockIssueDevice).not.toHaveBeenCalled();

    // Verify pf_google_link cookie is set and bound to the MFA pending jti (not the unlock jti)
    const raw = res.cookies.get("pf_google_link")?.value;
    expect(raw).toBeTruthy();
    const decoded = await verifyShortLived(raw!, "google-link");
    expect(decoded).not.toBeNull();
    expect(decoded!.pendingJti).toBe("mfa_jti_123");
    expect(decoded!.pendingJti).not.toBe(unlockJti);
  });

  it("c2) right password but finishPasswordLogin → unlock_failed → 401, jti revoked, unlock cookies cleared", async () => {
    const { token: unlockToken, jti: unlockJti } = await createSessionToken("user_id_123", false, {
      pending: true,
      expirationTime: "5m",
    });
    const googleDataToken = await signShortLived(
      { userId: "user_id_123", sub: "google_sub", email: "user@test.com", emailVerified: true },
      300,
      "google-unlock-data"
    );
    mockVerifyPassword.mockResolvedValue(true);
    mockFinishPasswordLogin.mockResolvedValue({ kind: "unlock_failed" });

    const res = await POST(
      makeUnlockRequest({ unlockToken, googleDataToken, body: { password: "correct_password" } })
    );
    expect(res.status).toBe(401);
    expect(mockRevokeJti).toHaveBeenCalledWith(unlockJti, expect.any(Date));
    expect(mockUpsertIdentity).not.toHaveBeenCalled();
    expect(mockIssueDevice).not.toHaveBeenCalled();
    for (const name of ["pf_unlock", "pf_google_unlock_data"]) {
      const c = res.cookies.get(name);
      expect(c?.value).toBe("");
    }
  });

  it("f) googleData.userId ≠ pending token sub → 400", async () => {
    const { token: unlockToken } = await createSessionToken("user_id_123", false, {
      pending: true,
      expirationTime: "5m",
    });
    // Create google data token with mismatched userId
    const googleDataToken = await signShortLived(
      { userId: "different_user_id", sub: "google_sub", email: "user@test.com", emailVerified: true },
      300,
      "google-unlock-data"
    );

    const req = makeUnlockRequest({
      unlockToken,
      googleDataToken,
      body: { password: "test123" },
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("Invalid Google data");
  });

  it("g) per-user limit: checkRateLimit allowed:false → 429, assert windowMs 3_600_000", async () => {
    const { token: unlockToken } = await createSessionToken("user_id_123", false, {
      pending: true,
      expirationTime: "5m",
    });
    const googleDataToken = await signShortLived(
      { userId: "user_id_123", sub: "google_sub", email: "user@test.com", emailVerified: true },
      300,
      "google-unlock-data"
    );

    // Set up the rate limit check to return allowed:false on per-user keys
    mockCheckRateLimit.mockImplementation((key: string) => {
      if (key.startsWith("google:unlock:user:")) {
        return { allowed: false } as any;
      }
      return { allowed: true } as any;
    });

    mockVerifyPassword.mockResolvedValue(true);

    const req = makeUnlockRequest({
      unlockToken,
      googleDataToken,
      body: { password: "correct_password" },
    });

    const res = await POST(req);
    expect(res.status).toBe(429);

    // Verify checkRateLimit was called with the correct windowMs
    const calls = mockCheckRateLimit.mock.calls;
    const userLimitCall = calls.find((c) => c[0].includes("google:unlock:user:"));
    expect(userLimitCall).toBeDefined();
    if (userLimitCall) {
      expect(userLimitCall[2]).toBe(3_600_000); // windowMs should be in milliseconds
    }
  });

  it("h) per-user daily limit: checkRateLimit allowed:false → 429, assert windowMs 86_400_000", async () => {
    const { token: unlockToken } = await createSessionToken("user_id_123", false, {
      pending: true,
      expirationTime: "5m",
    });
    const googleDataToken = await signShortLived(
      { userId: "user_id_123", sub: "google_sub", email: "user@test.com", emailVerified: true },
      300,
      "google-unlock-data"
    );

    // Set up the rate limit check to return allowed:false on per-user daily keys
    mockCheckRateLimit.mockImplementation((key: string) => {
      if (key.startsWith("google:unlock:user:d:")) {
        return { allowed: false } as any;
      }
      return { allowed: true } as any;
    });

    mockVerifyPassword.mockResolvedValue(true);

    const req = makeUnlockRequest({
      unlockToken,
      googleDataToken,
      body: { password: "correct_password" },
    });

    const res = await POST(req);
    expect(res.status).toBe(429);

    // Verify checkRateLimit was called with the correct windowMs for daily limit
    const calls = mockCheckRateLimit.mock.calls;
    const dailyLimitCall = calls.find((c) => c[0].includes("google:unlock:user:d:"));
    expect(dailyLimitCall).toBeDefined();
    if (dailyLimitCall) {
      expect(dailyLimitCall[2]).toBe(86_400_000); // windowMs should be 24h in milliseconds
    }
  });

  it("h) 6th attempt → 429, jti revoked, cookies cleared", async () => {
    const { token: unlockToken, jti: unlockJti } = await createSessionToken("user_id_123", false, {
      pending: true,
      expirationTime: "5m",
    });
    const googleDataToken = await signShortLived(
      { userId: "user_id_123", sub: "google_sub", email: "user@test.com", emailVerified: true },
      300,
      "google-unlock-data"
    );

    // Per-pending-token retry limit exceeded
    mockCheckRateLimit.mockImplementation((key: string) => {
      if (key.includes("google:unlock:pending:")) {
        return { allowed: false } as any; // Exceeded per-pending limit
      }
      return { allowed: true } as any;
    });

    const req = makeUnlockRequest({
      unlockToken,
      googleDataToken,
      body: { password: "wrong_password" },
    });

    const res = await POST(req);
    expect(res.status).toBe(429);
    const data = await res.json();
    expect(data.error).toBe("Too many requests");

    // Verify verifyPassword and finishPasswordLogin were NOT called (rate limit hit before password check)
    expect(mockVerifyPassword).not.toHaveBeenCalled();
    expect(mockFinishPasswordLogin).not.toHaveBeenCalled();

    // Verify jti was revoked
    expect(mockRevokeJti).toHaveBeenCalledWith(unlockJti, expect.any(Date));

    // Verify cookies were cleared
    for (const name of ["pf_unlock", "pf_google_unlock_data"]) {
      const c = res.cookies.get(name);
      expect(c?.value).toBe("");
    }
  });

  it("i) per-pending-token limit uses 15-minute window", async () => {
    const { token: unlockToken } = await createSessionToken("user_id_123", false, {
      pending: true,
      expirationTime: "5m",
    });
    const googleDataToken = await signShortLived(
      { userId: "user_id_123", sub: "google_sub", email: "user@test.com", emailVerified: true },
      300,
      "google-unlock-data"
    );

    mockCheckRateLimit.mockReturnValue({ allowed: true } as any);
    mockVerifyPassword.mockResolvedValue(false);

    const req = makeUnlockRequest({
      unlockToken,
      googleDataToken,
      body: { password: "wrong_password" },
    });

    const res = await POST(req);
    expect(res.status).toBe(401);

    // Verify checkRateLimit was called with 15-minute window for pending jti
    const calls = mockCheckRateLimit.mock.calls;
    const pendingLimitCall = calls.find((c) => c[0].includes("google:unlock:pending:"));
    expect(pendingLimitCall).toBeDefined();
    if (pendingLimitCall) {
      expect(pendingLimitCall[1]).toBe(5); // 5 attempts
      expect(pendingLimitCall[2]).toBe(900_000); // 15 minutes in milliseconds
    }
  });

  it("j) revokeJti fails → 503, finishPasswordLogin not called", async () => {
    const { token: unlockToken, jti: unlockJti } = await createSessionToken("user_id_123", false, {
      pending: true,
      expirationTime: "5m",
    });
    const googleDataToken = await signShortLived(
      { userId: "user_id_123", sub: "google_sub", email: "user@test.com", emailVerified: true },
      300,
      "google-unlock-data"
    );

    mockVerifyPassword.mockResolvedValue(true);
    mockRevokeJti.mockRejectedValueOnce(new Error("Database error"));

    const req = makeUnlockRequest({
      unlockToken,
      googleDataToken,
      body: { password: "correct_password" },
    });

    const res = await POST(req);
    expect(res.status).toBe(503);
    const data = await res.json();
    expect(data.error).toBe("Try again");

    // Verify finishPasswordLogin was NOT called
    expect(mockFinishPasswordLogin).not.toHaveBeenCalled();

    // Verify upsertIdentity was NOT called
    expect(mockUpsertIdentity).not.toHaveBeenCalled();
  });

  it("j2) revoke happens before finishPasswordLogin", async () => {
    const { token: unlockToken, jti: unlockJti } = await createSessionToken("user_id_123", false, {
      pending: true,
      expirationTime: "5m",
    });
    const googleDataToken = await signShortLived(
      { userId: "user_id_123", sub: "google_sub", email: "user@test.com", emailVerified: true },
      300,
      "google-unlock-data"
    );

    mockVerifyPassword.mockResolvedValue(true);
    mockFinishPasswordLogin.mockResolvedValue({
      kind: "session",
      token: "session_token_jwt",
      jti: "session_jti_123",
      dek: Buffer.alloc(32, 0xaa),
    });

    let finishCalled = false;
    mockRevokeJti.mockImplementation(async () => {
      // Verify that finishPasswordLogin hasn't been called yet by the first revoke
      if (!finishCalled) {
        expect(mockFinishPasswordLogin).not.toHaveBeenCalled();
      }
    });
    mockFinishPasswordLogin.mockImplementation(async () => {
      finishCalled = true;
      return {
        kind: "session",
        token: "session_token_jwt",
        jti: "session_jti_123",
        dek: Buffer.alloc(32, 0xaa),
      };
    });

    const req = makeUnlockRequest({
      unlockToken,
      googleDataToken,
      body: { password: "correct_password" },
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    // Verify revoke was called and finishPasswordLogin was called
    expect(mockRevokeJti).toHaveBeenCalled();
    expect(mockFinishPasswordLogin).toHaveBeenCalled();
  });
});
