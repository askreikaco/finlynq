/**
 * Tests for Google linking during MFA verification (Tasks H1 and H2).
 *
 * Task H2: Valid code + valid pf_google_link matching user+jti → upsertIdentity and issueDevice called, pf_device set, pf_google_link cleared
 *
 * Covers:
 * a) Valid MFA with a matching pf_google_link: upsertIdentity and issueDevice are called and pf_device is set
 * b) Link cookie with a different pendingJti: neither is called
 * c) Link cookie with a different userId: neither is called
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

process.env.PF_JWT_SECRET = "test-jwt-secret-for-vitest-32chars!!";
process.env.DEPLOY_GENERATION = "0";

vi.mock("@/lib/auth/require-auth", () => ({
  requireAuth: vi.fn(),
}));

vi.mock("@/lib/auth/queries", () => ({
  getIdentity: vi.fn(),
  getUserById: vi.fn(),
  upsertIdentity: vi.fn(),
  recordSuccessfulLogin: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  verifySessionTokenDetailed: vi.fn(),
  verifyMfaCode: vi.fn(),
  createSessionToken: vi.fn(),
  revokeJti: vi.fn(),
  AUTH_COOKIE: "pf_session",
}));

vi.mock("@/lib/auth/trusted-device", () => ({
  redeemDevice: vi.fn(),
  issueDevice: vi.fn(),
  deviceCookieOptions: vi.fn(() => ({
    httpOnly: true,
    secure: false,
    sameSite: "lax" as const,
    path: "/api/auth",
    maxAge: 30 * 24 * 60 * 60,
  })),
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() => ({ allowed: true })),
}));

vi.mock("@/lib/crypto/envelope", () => ({
  decryptField: vi.fn(),
}));

vi.mock("@/lib/crypto/dek-cache", () => ({
  getDEK: vi.fn(),
  putDEK: vi.fn(),
  deleteDEK: vi.fn(),
}));

vi.mock("@/lib/auth/jwt", () => ({
  verifyShortLived: vi.fn(),
  signShortLived: vi.fn(),
  _clearRevokedJtiCache: vi.fn(),
  SESSION_TTL_MS: 24 * 60 * 60 * 1000, // 24 hours
}));

vi.mock("@/lib/validate", () => ({
  logApiError: vi.fn(),
  safeErrorMessage: vi.fn((error: any, fallback: string) => fallback),
  validateBody: vi.fn((body: any, _schema: any) => ({
    data: {
      code: body.code || "123456",
      trustDevice: body.trustDevice ?? true,
    },
  })),
}));

vi.mock("@/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => [],
        }),
      }),
    }),
  },
}));

vi.mock("@/db/schema-pg", () => ({
  users: {},
  revokedJtis: {},
  transactions: { id: {}, userId: {}, date: {} },
  holdings: {},
  dividends: {},
  splits: {},
}));

vi.mock("drizzle-orm", () => ({
  eq: () => ({}),
}));

vi.mock("@/lib/transfer", () => ({}));
vi.mock("@/lib/portfolio/lots/write-hooks", () => ({}));
vi.mock("@/lib/securities/backfill", () => ({
  enqueueBackfillSecurities: vi.fn(),
}));
vi.mock("@/lib/email-import/upgrade-staging-encryption", () => ({
  enqueueUpgradeStagingEncryption: vi.fn(),
}));
vi.mock("@/lib/email-import/process-pending-inbox", () => ({
  enqueueProcessPendingInbox: vi.fn(),
}));
vi.mock("@/lib/crypto/upgrade-user-fields", () => ({
  enqueueUpgradeUserFieldEncryption: vi.fn(),
}));

import { POST } from "@/app/api/auth/mfa/verify/route";
import * as auth from "@/lib/auth";
import * as authQueries from "@/lib/auth/queries";
import * as device from "@/lib/auth/trusted-device";
import * as jwt from "@/lib/auth/jwt";
import * as dek_cache from "@/lib/crypto/dek-cache";
import * as envelope from "@/lib/crypto/envelope";

const mockVerifySessionTokenDetailed = vi.mocked(auth.verifySessionTokenDetailed);
const mockVerifyMfaCode = vi.mocked(auth.verifyMfaCode);
const mockCreateSessionToken = vi.mocked(auth.createSessionToken);
const mockRevokeJti = vi.mocked(auth.revokeJti);
const mockGetUserById = vi.mocked(authQueries.getUserById);
const mockUpsertIdentity = vi.mocked(authQueries.upsertIdentity);
const mockRecordSuccessfulLogin = vi.mocked(authQueries.recordSuccessfulLogin);
const mockIssueDevice = vi.mocked(device.issueDevice);
const mockVerifyShortLived = vi.mocked(jwt.verifyShortLived);
const mockGetDEK = vi.mocked(dek_cache.getDEK);
const mockPutDEK = vi.mocked(dek_cache.putDEK);
const mockDeleteDEK = vi.mocked(dek_cache.deleteDEK);
const mockDecryptField = vi.mocked(envelope.decryptField);

function makeMfaRequest(opts: {
  mfaToken?: string;
  code?: string;
  googleLinkCookie?: string | null;
  deviceCookie?: string | null;
  /** B3: plain MFA now issues a pf_device unless trustDevice:false; b/c opt out to isolate the google-link path. */
  trustDevice?: boolean;
}): NextRequest {
  const url = new URL("http://localhost:3000/api/auth/mfa/verify");

  const cookies: string[] = [];
  if (opts.mfaToken) cookies.push(`pf_unlock=${opts.mfaToken}`);
  if (opts.googleLinkCookie) cookies.push(`pf_google_link=${opts.googleLinkCookie}`);
  if (opts.deviceCookie) cookies.push(`pf_device=${opts.deviceCookie}`);
  const cookieHeader = cookies.length > 0 ? cookies.join("; ") : undefined;

  const init: RequestInit = {
    method: "POST",
    headers: cookieHeader ? { cookie: cookieHeader } : {},
  };
  if (opts.code) {
    init.body = JSON.stringify({ code: opts.code, ...(opts.trustDevice === undefined ? {} : { trustDevice: opts.trustDevice }) });
    init.headers = { ...init.headers as Record<string, string>, "Content-Type": "application/json" };
  }

  return new NextRequest(url, init as never);
}

describe("/api/auth/mfa/verify — Google linking", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("a) Valid MFA with matching pf_google_link: upsertIdentity and issueDevice called, pf_device set", async () => {
    const userId = "user_123";
    const pendingJti = "pending_jti_123";
    const googleSub = "google_sub_123";
    const mfaSecret = "JBSWY3DPEBLW64TMMQ======";
    const mockDek = Buffer.alloc(32, 0xaa);

    // Mock pending token verification
    mockVerifySessionTokenDetailed.mockResolvedValue({
      payload: {
        sub: userId,
        jti: pendingJti,
        pending: true,
        exp: Math.floor(Date.now() / 1000) + 300,
      },
    } as any);

    // Mock user lookup
    mockGetUserById.mockResolvedValue({
      id: userId,
      mfaEnabled: true,
      mfaSecret: mfaSecret,
    } as any);

    // Mock DEK cache
    mockGetDEK.mockReturnValue(mockDek);

    // Mock MFA code verification (always return true for valid code)
    mockVerifyMfaCode.mockReturnValue(true);

    // Mock field decryption to return the MFA secret
    mockDecryptField.mockReturnValue(mfaSecret);

    // Mock Google link payload verification
    mockVerifyShortLived.mockImplementation((token: string, purpose: string) => {
      if (purpose === "google-link") {
        return Promise.resolve({
          userId,
          sub: googleSub,
          email: "user@example.com",
          emailVerified: true,
          pendingJti,
        } as any);
      }
      return Promise.resolve(null);
    });

    // Mock session creation
    mockCreateSessionToken.mockResolvedValue({
      token: "session_token",
      jti: "session_jti_123",
    } as any);

    // Mock device issuance
    mockIssueDevice.mockResolvedValue({
      id: "device_123",
      cookieValue: "device_123.secret",
      maxAgeSeconds: 30 * 24 * 60 * 60,
    } as any);

    // Mock record successful login and other post-MFA functions
    mockRecordSuccessfulLogin.mockResolvedValue(undefined);
    mockPutDEK.mockResolvedValue(undefined);
    mockDeleteDEK.mockResolvedValue(undefined);
    mockRevokeJti.mockResolvedValue(undefined);

    const googleLinkToken = "valid_google_link_token";
    const req = makeMfaRequest({
      mfaToken: "pending_token",
      code: "123456",
      googleLinkCookie: googleLinkToken,
      deviceCookie: "dev_abc.oldsecret",
    });

    const res = await POST(req);

    // Verify upsertIdentity was called
    expect(mockUpsertIdentity).toHaveBeenCalledWith({
      userId,
      provider: "google",
      subject: googleSub,
      email: "user@example.com",
      emailVerified: 1,
    });

    // Verify issueDevice was called
    // Existing device row must be replaced (replaceDeviceId parsed from pf_device cookie)
    expect(mockIssueDevice).toHaveBeenCalledWith(userId, mockDek, undefined, "dev_abc");

    // Verify pf_device cookie is set
    const d = res.cookies.get("pf_device");
    expect(d?.value).toBe("device_123.secret");
    expect(d?.path).toBe("/api/auth");
    expect(d?.httpOnly).toBe(true);
  });

  it("b) Link cookie with different pendingJti: neither upsertIdentity nor issueDevice called", async () => {
    const userId = "user_123";
    const pendingJti = "pending_jti_123";
    const wrongJti = "wrong_jti_456";
    const mfaSecret = "JBSWY3DPEBLW64TMMQ======";
    const mockDek = Buffer.alloc(32, 0xaa);

    // Mock pending token verification
    mockVerifySessionTokenDetailed.mockResolvedValue({
      payload: {
        sub: userId,
        jti: pendingJti,
        pending: true,
        exp: Math.floor(Date.now() / 1000) + 300,
      },
    } as any);

    // Mock user lookup
    mockGetUserById.mockResolvedValue({
      id: userId,
      mfaEnabled: true,
      mfaSecret: mfaSecret,
    } as any);

    // Mock DEK cache
    mockGetDEK.mockReturnValue(mockDek);

    // Mock MFA code verification
    mockVerifyMfaCode.mockReturnValue(true);
    mockDecryptField.mockReturnValue(mfaSecret);

    // Mock Google link payload verification with WRONG pendingJti
    mockVerifyShortLived.mockImplementation((token: string, purpose: string) => {
      if (purpose === "google-link") {
        return Promise.resolve({
          userId,
          sub: "google_sub_123",
          email: "user@example.com",
          emailVerified: true,
          pendingJti: wrongJti, // Wrong jti!
        } as any);
      }
      return Promise.resolve(null);
    });

    // Setup other mocks
    mockRecordSuccessfulLogin.mockResolvedValue(undefined);
    mockCreateSessionToken.mockResolvedValue({
      token: "session_token",
      jti: "session_jti_123",
    } as any);
    mockPutDEK.mockResolvedValue(undefined);
    mockDeleteDEK.mockResolvedValue(undefined);
    mockRevokeJti.mockResolvedValue(undefined);

    const googleLinkToken = "mismatched_jti_token";
    const req = makeMfaRequest({
      mfaToken: "pending_token",
      code: "123456",
      googleLinkCookie: googleLinkToken,
      trustDevice: false,
    });

    await POST(req);

    // Verify neither upsertIdentity nor issueDevice were called
    expect(mockUpsertIdentity).not.toHaveBeenCalled();
    expect(mockIssueDevice).not.toHaveBeenCalled();
  });

  it("c) Link cookie with different userId: neither upsertIdentity nor issueDevice called", async () => {
    const userId = "user_123";
    const wrongUserId = "user_999";
    const pendingJti = "pending_jti_123";
    const mfaSecret = "JBSWY3DPEBLW64TMMQ======";
    const mockDek = Buffer.alloc(32, 0xaa);

    // Mock pending token verification
    mockVerifySessionTokenDetailed.mockResolvedValue({
      payload: {
        sub: userId,
        jti: pendingJti,
        pending: true,
        exp: Math.floor(Date.now() / 1000) + 300,
      },
    } as any);

    // Mock user lookup
    mockGetUserById.mockResolvedValue({
      id: userId,
      mfaEnabled: true,
      mfaSecret: mfaSecret,
    } as any);

    // Mock DEK cache
    mockGetDEK.mockReturnValue(mockDek);

    // Mock MFA code verification
    mockVerifyMfaCode.mockReturnValue(true);
    mockDecryptField.mockReturnValue(mfaSecret);

    // Mock Google link payload verification with WRONG userId
    mockVerifyShortLived.mockImplementation((token: string, purpose: string) => {
      if (purpose === "google-link") {
        return Promise.resolve({
          userId: wrongUserId, // Wrong userId!
          sub: "google_sub_123",
          email: "user@example.com",
          emailVerified: true,
          pendingJti,
        } as any);
      }
      return Promise.resolve(null);
    });

    // Setup other mocks
    mockRecordSuccessfulLogin.mockResolvedValue(undefined);
    mockCreateSessionToken.mockResolvedValue({
      token: "session_token",
      jti: "session_jti_123",
    } as any);
    mockPutDEK.mockResolvedValue(undefined);
    mockDeleteDEK.mockResolvedValue(undefined);
    mockRevokeJti.mockResolvedValue(undefined);

    const googleLinkToken = "mismatched_user_token";
    const req = makeMfaRequest({
      mfaToken: "pending_token",
      code: "123456",
      googleLinkCookie: googleLinkToken,
      trustDevice: false,
    });

    await POST(req);

    // Verify neither upsertIdentity nor issueDevice were called
    expect(mockUpsertIdentity).not.toHaveBeenCalled();
    expect(mockIssueDevice).not.toHaveBeenCalled();
  });
});
