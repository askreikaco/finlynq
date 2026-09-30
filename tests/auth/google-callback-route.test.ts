/**
 * Tests for GET /api/auth/google/callback
 *
 * Covers:
 * a) no pf_oauth_state cookie → 307/302 Location contains "error=google_no_state"
 * b) state param ≠ cookie state → "error=google_state_mismatch"
 * c) exchange fails → "error=google_exchange_failed" AND response sets pf_oauth_state deletion
 * d) identity exists + pf_device redeem ok + issueSessionForDek → session: Set-Cookie includes pf_session and pf_device; pf_oauth_state deleted
 * e) identity exists + device ok + issueSessionForDek → mfa: redirect contains "step=mfa", Set-Cookie includes pf_unlock AND pf_device
 * f) identity exists, no device → "step=unlock", Set-Cookie includes pf_unlock and pf_google_unlock_data
 * g) no identity + verified email matches user → "step=unlock"; upsertIdentity NOT called
 * h) no identity, no email match → "tab=register", Set-Cookie includes pf_google_signup
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

process.env.PF_JWT_SECRET = "test-jwt-secret-for-vitest-32chars!!";
process.env.DEPLOY_GENERATION = "0";
process.env.APP_URL = "http://localhost:3000";

vi.mock("@/lib/auth/google-oidc", () => ({
  isGoogleConfigured: vi.fn(() => true),
  exchangeCode: vi.fn(),
  verifyIdToken: vi.fn(),
}));

vi.mock("@/lib/auth/queries", () => ({
  getIdentity: vi.fn(),
  getUserByEmail: vi.fn(),
  upsertIdentity: vi.fn(),
}));

vi.mock("@/lib/auth/trusted-device", () => ({
  redeemDevice: vi.fn(),
  deviceCookieOptions: vi.fn(() => ({
    httpOnly: true,
    secure: false,
    sameSite: "lax" as const,
    path: "/api/auth",
    maxAge: 30 * 24 * 60 * 60,
  })),
}));

vi.mock("@/lib/auth/finish-login", () => ({
  issueSessionForDek: vi.fn(),
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() => ({ allowed: true })),
}));

vi.mock("@/lib/client-ip", () => ({
  clientIp: () => "127.0.0.1",
}));

vi.mock("@/lib/auth/google-link", async () => {
  const actual = await vi.importActual("@/lib/auth/google-link");
  return {
    ...actual,
    decideGoogleLink: vi.fn(),
  };
});

vi.mock("@/lib/auth/jwt", async () => {
  const actual = await vi.importActual("@/lib/auth/jwt");
  return {
    ...actual,
    verifyShortLived: vi.fn(),
    verifySessionTokenDetailed: vi.fn(),
    _clearRevokedJtiCache: vi.fn(),
  };
});

vi.mock("@/db", () => ({
  db: {
    select: vi.fn(() => ({
      from: () => ({
        where: () => ({
          limit: async () => [],
        }),
      }),
    })),
  },
}));

vi.mock("@/db/schema-pg", () => ({
  users: {},
}));

vi.mock("drizzle-orm", () => ({
  eq: () => ({}),
}));

import { GET } from "@/app/api/auth/google/callback/route";
import { signShortLived, _clearRevokedJtiCache } from "@/lib/auth/jwt";
import * as googleOidc from "@/lib/auth/google-oidc";
import * as queries from "@/lib/auth/queries";
import * as trustedDevice from "@/lib/auth/trusted-device";
import * as finishLogin from "@/lib/auth/finish-login";
import * as db from "@/db";
import * as jwt from "@/lib/auth/jwt";
import * as googleLink from "@/lib/auth/google-link";

const mockExchangeCode = vi.mocked(googleOidc.exchangeCode);
const mockVerifyIdToken = vi.mocked(googleOidc.verifyIdToken);
const mockGetIdentity = vi.mocked(queries.getIdentity);
const mockGetUserByEmail = vi.mocked(queries.getUserByEmail);
const mockUpsertIdentity = vi.mocked(queries.upsertIdentity);
const mockRedeemDevice = vi.mocked(trustedDevice.redeemDevice);
const mockIssueSessionForDek = vi.mocked(finishLogin.issueSessionForDek);
const mockVerifyShortLived = vi.mocked(jwt.verifyShortLived);
const mockVerifySessionTokenDetailed = vi.mocked(jwt.verifySessionTokenDetailed);
const mockDecideGoogleLink = vi.mocked(googleLink.decideGoogleLink);

// Get the mocked db.select function
const getDbSelectMock = () => vi.mocked(db.db).select;

function makeCallbackRequest(opts: {
  code?: string;
  state?: string;
  error?: string;
  stateCookie?: string | null;
  deviceCookie?: string | null;
  sessionCookie?: string | null;
}): NextRequest {
  const url = new URL("http://localhost:3000/api/auth/google/callback");
  if (opts.code) url.searchParams.set("code", opts.code);
  if (opts.state) url.searchParams.set("state", opts.state);
  if (opts.error) url.searchParams.set("error", opts.error);

  const cookies: string[] = [];
  if (opts.stateCookie) cookies.push(`pf_oauth_state=${opts.stateCookie}`);
  if (opts.deviceCookie) cookies.push(`pf_device=${opts.deviceCookie}`);
  if (opts.sessionCookie) cookies.push(`pf_session=${opts.sessionCookie}`);
  const cookieHeader = cookies.length > 0 ? cookies.join("; ") : undefined;

  return new NextRequest(url, {
    method: "GET",
    headers: cookieHeader ? { cookie: cookieHeader } : {},
  });
}

describe("/api/auth/google/callback", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    _clearRevokedJtiCache();

    // Get the actual implementations from the real module
    const actualJwt = await vi.importActual("@/lib/auth/jwt") as any;
    const actualGoogleLink = await vi.importActual("@/lib/auth/google-link") as any;

    // Default implementations use the real functions
    mockVerifyShortLived.mockImplementation(actualJwt.verifyShortLived);
    mockDecideGoogleLink.mockImplementation(actualGoogleLink.decideGoogleLink);
  });

  it("a) no pf_oauth_state cookie → error=google_no_state", async () => {
    const req = makeCallbackRequest({
      code: "auth_code_123",
      state: "state_value",
      stateCookie: null,
    });

    const res = await GET(req);
    const location = res.headers.get("location") || "";

    expect(res.status).toBe(307);
    expect(location).toContain("error=google_no_state");
  });

  it("b) state param ≠ cookie state → error=google_state_mismatch", async () => {
    // Create a valid state token
    const statePayload = {
      state: "state_from_cookie",
      nonce: "nonce123",
      codeVerifier: "verifier123",
      intent: "signin",
    };
    const stateToken = await signShortLived(statePayload, 300, "oauth-state");

    const req = makeCallbackRequest({
      code: "auth_code_123",
      state: "different_state",
      stateCookie: stateToken,
    });

    const res = await GET(req);
    const location = res.headers.get("location") || "";

    expect(res.status).toBe(307);
    expect(location).toContain("error=google_state_mismatch");
    // Verify state cookie is deleted (either Max-Age=0 or Expires in past)
    const setCookie = res.headers.get("set-cookie") || "";
    expect(setCookie).toContain("pf_oauth_state");
  });

  it("c) exchange fails → error=google_exchange_failed AND state cookie deleted", async () => {
    const statePayload = {
      state: "state_value",
      nonce: "nonce123",
      codeVerifier: "verifier123",
      intent: "signin",
    };
    const stateToken = await signShortLived(statePayload, 300, "oauth-state");

    mockExchangeCode.mockRejectedValue(new Error("Exchange failed"));

    const req = makeCallbackRequest({
      code: "bad_code",
      state: "state_value",
      stateCookie: stateToken,
    });

    const res = await GET(req);
    const location = res.headers.get("location") || "";

    expect(res.status).toBe(307);
    expect(location).toContain("error=google_exchange_failed");
    // Verify state cookie is deleted
    const setCookie = res.headers.get("set-cookie") || "";
    expect(setCookie).toContain("pf_oauth_state");
  });

  it("d) identity exists + device redeem ok + session → pf_session and pf_device cookies set", async () => {
    const statePayload = {
      state: "state_value",
      nonce: "nonce123",
      codeVerifier: "verifier123",
      intent: "signin",
    };
    const stateToken = await signShortLived(statePayload, 300, "oauth-state");

    mockExchangeCode.mockResolvedValue({ id_token: "id_token_jwt", access_token: "access_token", token_type: "Bearer" } as any);
    mockVerifyIdToken.mockResolvedValue({
      sub: "google_sub_123",
      email: "user@example.com",
      email_verified: true,
      name: "User Name",
    } as any);

    const mockUser = {
      id: "user_id_123",
      mfaEnabled: 0,
    };

    // Mock db select for user fetch
    getDbSelectMock()!.mockReturnValue({
      from: () => ({
        where: () => ({
          limit: async () => [mockUser],
        }),
      }),
    } as any);

    mockGetIdentity.mockResolvedValue({ userId: "user_id_123", provider: "google", providerSubject: "google_sub_123" } as any);

    mockRedeemDevice.mockResolvedValue({
      dek: Buffer.alloc(32, 0xaa),
      rotatedCookieValue: "device_id.rotated_secret",
      maxAgeSeconds: 30 * 24 * 60 * 60,
    });

    mockIssueSessionForDek.mockResolvedValue({
      kind: "session",
      token: "session_token_jwt",
      jti: "session_jti_123",
      dek: Buffer.alloc(32, 0xaa),
    } as any);

    const req = makeCallbackRequest({
      code: "auth_code_123",
      state: "state_value",
      stateCookie: stateToken,
      deviceCookie: "device_id.secret",
    });

    const res = await GET(req);

    expect(res.status).toBe(307);
    const setCookie = res.headers.get("set-cookie") || "";
    expect(setCookie).toContain("pf_session");
    expect(setCookie).toContain("pf_device");
    expect(setCookie).toContain("pf_oauth_state");
  });

  it("e) identity exists + device ok + issueSessionForDek → mfa: step=mfa, pf_unlock and pf_device set", async () => {
    const statePayload = {
      state: "state_value",
      nonce: "nonce123",
      codeVerifier: "verifier123",
      intent: "signin",
    };
    const stateToken = await signShortLived(statePayload, 300, "oauth-state");

    mockExchangeCode.mockResolvedValue({ id_token: "id_token_jwt", access_token: "access_token", token_type: "Bearer" } as any);
    mockVerifyIdToken.mockResolvedValue({
      sub: "google_sub_123",
      email: "user@example.com",
      email_verified: true,
      name: "User Name",
    } as any);

    const mockUser = {
      id: "user_id_123",
      mfaEnabled: 1,
    };

    getDbSelectMock()!.mockReturnValue({
      from: () => ({
        where: () => ({
          limit: async () => [mockUser],
        }),
      }),
    } as any);

    mockGetIdentity.mockResolvedValue({ userId: "user_id_123", provider: "google", providerSubject: "google_sub_123" } as any);

    mockRedeemDevice.mockResolvedValue({
      dek: Buffer.alloc(32, 0xaa),
      rotatedCookieValue: "device_id.rotated_secret",
      maxAgeSeconds: 30 * 24 * 60 * 60,
    });

    mockIssueSessionForDek.mockResolvedValue({
      kind: "mfa",
      token: "mfa_pending_token",
      jti: "mfa_jti_123",
      dek: Buffer.alloc(32, 0xaa),
    } as any);

    const req = makeCallbackRequest({
      code: "auth_code_123",
      state: "state_value",
      stateCookie: stateToken,
      deviceCookie: "device_id.secret",
    });

    const res = await GET(req);
    const location = res.headers.get("location") || "";

    expect(res.status).toBe(307);
    expect(location).toContain("step=mfa");
    const setCookie = res.headers.get("set-cookie") || "";
    expect(setCookie).toContain("pf_unlock");
    expect(setCookie).toContain("pf_device");
  });

  it("f) identity exists, no device → step=unlock, pf_unlock and pf_google_unlock_data set", async () => {
    const statePayload = {
      state: "state_value",
      nonce: "nonce123",
      codeVerifier: "verifier123",
      intent: "signin",
    };
    const stateToken = await signShortLived(statePayload, 300, "oauth-state");

    mockExchangeCode.mockResolvedValue({ id_token: "id_token_jwt", access_token: "access_token", token_type: "Bearer" } as any);
    mockVerifyIdToken.mockResolvedValue({
      sub: "google_sub_123",
      email: "user@example.com",
      email_verified: true,
      name: "User Name",
    } as any);

    const mockUser = {
      id: "user_id_123",
      mfaEnabled: 0,
    };

    getDbSelectMock()!.mockReturnValue({
      from: () => ({
        where: () => ({
          limit: async () => [mockUser],
        }),
      }),
    } as any);

    mockGetIdentity.mockResolvedValue({ userId: "user_id_123", provider: "google", providerSubject: "google_sub_123" } as any);
    mockRedeemDevice.mockResolvedValue(null);

    const req = makeCallbackRequest({
      code: "auth_code_123",
      state: "state_value",
      stateCookie: stateToken,
      deviceCookie: null,
    });

    const res = await GET(req);
    const location = res.headers.get("location") || "";

    expect(res.status).toBe(307);
    expect(location).toContain("step=unlock");
    const setCookie = res.headers.get("set-cookie") || "";
    expect(setCookie).toContain("pf_unlock");
    expect(setCookie).toContain("pf_google_unlock_data");
  });

  it("g) no identity + verified email matches user → step=unlock, upsertIdentity NOT called", async () => {
    const statePayload = {
      state: "state_value",
      nonce: "nonce123",
      codeVerifier: "verifier123",
      intent: "signin",
    };
    const stateToken = await signShortLived(statePayload, 300, "oauth-state");

    mockExchangeCode.mockResolvedValue({ id_token: "id_token_jwt", access_token: "access_token", token_type: "Bearer" } as any);
    mockVerifyIdToken.mockResolvedValue({
      sub: "google_sub_456",
      email: "existing@example.com",
      email_verified: true,
      name: "User Name",
    } as any);

    mockGetIdentity.mockResolvedValue(null as any);
    mockGetUserByEmail.mockResolvedValue({
      id: "user_id_456",
      email: "existing@example.com",
    } as any);

    const req = makeCallbackRequest({
      code: "auth_code_123",
      state: "state_value",
      stateCookie: stateToken,
    });

    const res = await GET(req);
    const location = res.headers.get("location") || "";

    expect(res.status).toBe(307);
    expect(location).toContain("step=unlock");
    // upsertIdentity should NOT have been called yet
    expect(mockUpsertIdentity).not.toHaveBeenCalled();
  });

  it("h) no identity, no email match → tab=register, pf_google_signup set", async () => {
    const statePayload = {
      state: "state_value",
      nonce: "nonce123",
      codeVerifier: "verifier123",
      intent: "signin",
    };
    const stateToken = await signShortLived(statePayload, 300, "oauth-state");

    mockExchangeCode.mockResolvedValue({ id_token: "id_token_jwt", access_token: "access_token", token_type: "Bearer" } as any);
    mockVerifyIdToken.mockResolvedValue({
      sub: "google_sub_new",
      email: "newuser@example.com",
      email_verified: true,
      name: "New User",
    } as any);

    mockGetIdentity.mockResolvedValue(null as any);
    mockGetUserByEmail.mockResolvedValue(null as any);

    const req = makeCallbackRequest({
      code: "auth_code_123",
      state: "state_value",
      stateCookie: stateToken,
    });

    const res = await GET(req);
    const location = res.headers.get("location") || "";

    expect(res.status).toBe(307);
    expect(location).toContain("tab=register");
    expect(location).toContain("google=1");
    const setCookie = res.headers.get("set-cookie") || "";
    expect(setCookie).toContain("pf_google_signup");
  });

  it("i) Forged/expired state cookie → error=google_invalid_state", async () => {
    mockExchangeCode.mockResolvedValue({ id_token: "id_token_jwt", access_token: "access_token", token_type: "Bearer" } as any);

    // Try to verify a state token that will fail verification (expired/forged)
    mockVerifyShortLived.mockImplementation((token: string, purpose: string) => {
      if (purpose === "oauth-state") {
        return Promise.resolve(null as any);
      }
      return Promise.resolve(null as any);
    });

    const req = makeCallbackRequest({
      code: "auth_code_123",
      state: "state_value",
      stateCookie: "invalid_state_token",
    });

    const res = await GET(req);
    const location = res.headers.get("location") || "";

    expect(res.status).toBe(307);
    expect(location).toContain("error=google_invalid_state");
  });

  it("j) Google returns error param → error=google_denied or google_server_error", async () => {
    const req = new NextRequest(
      new URL("http://localhost:3000/api/auth/google/callback?error=access_denied"),
      { method: "GET" }
    );

    const res = await GET(req);
    const location = res.headers.get("location") || "";

    expect(res.status).toBe(307);
    expect(location).toContain("error=google_denied");
  });

  it("k) redeemDevice succeeds but issueSessionForDek throws → still returns mfa step", async () => {
    const statePayload = {
      state: "state_value",
      nonce: "nonce123",
      codeVerifier: "verifier123",
      intent: "signin",
    };
    const stateToken = await signShortLived(statePayload, 300, "oauth-state");

    mockVerifyShortLived.mockImplementation((token: string, purpose: string) => {
      if (purpose === "oauth-state") {
        return Promise.resolve(statePayload as any);
      }
      return Promise.resolve(null as any);
    });

    mockExchangeCode.mockResolvedValue({ id_token: "id_token_jwt", access_token: "access_token", token_type: "Bearer" } as any);
    mockVerifyIdToken.mockResolvedValue({
      sub: "google_sub_123",
      email: "user@example.com",
      email_verified: true,
      name: "User Name",
    } as any);

    const mockUser = {
      id: "user_id_123",
      mfaEnabled: 1,
    };

    getDbSelectMock()!.mockReturnValue({
      from: () => ({
        where: () => ({
          limit: async () => [mockUser],
        }),
      }),
    } as any);

    mockGetIdentity.mockResolvedValue({ userId: "user_id_123", provider: "google", providerSubject: "google_sub_123" } as any);

    mockRedeemDevice.mockResolvedValue({
      dek: Buffer.alloc(32, 0xaa),
      rotatedCookieValue: "device_id.rotated_secret",
      maxAgeSeconds: 30 * 24 * 60 * 60,
    });

    // issueSessionForDek throws an error
    mockIssueSessionForDek.mockRejectedValue(new Error("DEK unwrap failed"));

    const req = makeCallbackRequest({
      code: "auth_code_123",
      state: "state_value",
      stateCookie: stateToken,
      deviceCookie: "device_id.secret",
    });

    const res = await GET(req);
    const location = res.headers.get("location") || "";

    expect(res.status).toBe(307);
    // Should redirect to error instead of mfa since issueSessionForDek threw
    expect(location).toContain("error=");
  });

  it("l) intent=link with session mismatch → error=google_link_session", async () => {
    const statePayload = {
      state: "state_value",
      nonce: "nonce123",
      codeVerifier: "verifier123",
      intent: "link",
      uid: "user_id_123",
    };
    const stateToken = await signShortLived(statePayload, 300, "oauth-state");

    mockVerifyShortLived.mockImplementation((token: string, purpose: string) => {
      if (purpose === "oauth-state") {
        return Promise.resolve(statePayload as any);
      }
      return Promise.resolve(null as any);
    });

    mockExchangeCode.mockResolvedValue({ id_token: "id_token_jwt", access_token: "access_token", token_type: "Bearer" } as any);
    mockVerifyIdToken.mockResolvedValue({
      sub: "google_sub_123",
      email: "user@example.com",
      email_verified: true,
      name: "User Name",
    } as any);

    // Mock verifySessionTokenDetailed to return a different user
    mockVerifySessionTokenDetailed.mockResolvedValue({
      payload: { sub: "different_user_id" },
    } as any);

    const req = makeCallbackRequest({
      code: "auth_code_123",
      state: "state_value",
      stateCookie: stateToken,
    });

    const res = await GET(req);
    const location = res.headers.get("location") || "";

    expect(res.status).toBe(307);
    expect(location).toContain("error=google_link_session");
  });

  it("m) intent=link with successful link → redirects to settings with google=linked", async () => {
    const statePayload = {
      state: "state_value",
      nonce: "nonce123",
      codeVerifier: "verifier123",
      intent: "link",
      uid: "user_id_123",
    };
    const stateToken = await signShortLived(statePayload, 300, "oauth-state");

    mockVerifyShortLived.mockImplementation((token: string, purpose: string) => {
      if (purpose === "oauth-state") {
        return Promise.resolve(statePayload as any);
      }
      return Promise.resolve(null as any);
    });

    mockExchangeCode.mockResolvedValue({ id_token: "id_token_jwt", access_token: "access_token", token_type: "Bearer" } as any);
    mockVerifyIdToken.mockResolvedValue({
      sub: "google_sub_123",
      email: "user@example.com",
      email_verified: true,
      name: "User Name",
    } as any);

    // Mock verifySessionTokenDetailed to return the correct user
    mockVerifySessionTokenDetailed.mockResolvedValue({
      payload: { sub: "user_id_123" },
    } as any);

    mockGetIdentity.mockResolvedValue(null as any);
    mockUpsertIdentity.mockResolvedValue({} as any);

    const req = makeCallbackRequest({
      code: "auth_code_123",
      state: "state_value",
      stateCookie: stateToken,
      sessionCookie: "session_token",
    });

    const res = await GET(req);
    const location = res.headers.get("location") || "";

    expect(res.status).toBe(307);
    expect(location).toContain("/settings/account");
    expect(location).toContain("google=linked");
    expect(mockUpsertIdentity).toHaveBeenCalledWith({
      userId: "user_id_123",
      provider: "google",
      subject: "google_sub_123",
      email: "user@example.com",
      emailVerified: 1,
    });
  });
});
