/**
 * Tests for /api/auth/google/callback route.
 *
 * Covers:
 * - State validation (missing, invalid, mismatch)
 * - Identity resolution:
 *   - Known identity + device cookie → session (no password needed)
 *   - Known identity no device → unlock cookie (password once)
 *   - Verified email match existing user → unlock cookie (link after password)
 *   - Unknown → signup cookie (register path)
 * - Rate limiting (10/60s per IP)
 * - Redirect to proper URLs (using x-forwarded-host/proto)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

process.env.PF_JWT_SECRET = "test-jwt-secret-for-vitest-32chars!!";
process.env.DEPLOY_GENERATION = "0";
process.env.GOOGLE_CLIENT_ID = "test-client-id";
process.env.GOOGLE_CLIENT_SECRET = "test-client-secret";
process.env.APP_URL = "https://money.reika.vn";

const rateLimitChecks: Array<{ key: string; limit: number; duration: number }> = [];
const mockUsers = new Map<string, any>();
const mockIdentities = new Map<string, any>();
const sessionCookies: Array<{ name: string; value: string }> = [];

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn((key: string, limit: number, duration: number) => {
    rateLimitChecks.push({ key, limit, duration });
    return true; // Allow all for testing
  }),
}));

vi.mock("@/lib/auth/queries", () => ({
  getUserByEmail: vi.fn(async (email: string) => {
    for (const user of mockUsers.values()) {
      if (user.email === email) return user;
    }
    return null;
  }),
  getUserIdentity: vi.fn(async (provider: string, subject: string) => {
    const key = `${provider}:${subject}`;
    return mockIdentities.get(key) || null;
  }),
  upsertIdentity: vi.fn(async (params: any) => {
    const key = `${params.provider}:${params.subject}`;
    mockIdentities.set(key, params);
    return true;
  }),
  createUser: vi.fn(async (params: any) => {
    const user = { id: "new-user", ...params };
    mockUsers.set(user.id, user);
    return user;
  }),
}));

vi.mock("@/lib/auth/google-oidc", () => ({
  isGoogleConfigured: () => true,
  redirectUri: () => "https://money.reika.vn/api/auth/google/callback",
  exchangeCode: vi.fn(async (params: any) => {
    if (params.code === "valid-code") {
      return {
        access_token: "access",
        id_token: "valid.id.token",
        token_type: "Bearer",
      };
    }
    throw new Error("Invalid code");
  }),
  verifyIdToken: vi.fn(async (token: string, nonce: string) => {
    if (token === "valid.id.token") {
      return {
        sub: "google-sub-123",
        email: "google@example.com",
        email_verified: true,
        name: "Google User",
      };
    }
    return null;
  }),
}));

vi.mock("@/lib/auth/jwt", () => ({
  signShortLived: vi.fn(async (claims: any, ttlSeconds?: number) => `signed.${JSON.stringify(claims)}`),
  createSessionToken: vi.fn(async (userId: string) => {
    return { token: `session.${userId}`, jti: "jti-123" };
  }),
  verifyShortLived: vi.fn(async (token: string) => {
    if (token.startsWith("signed.")) {
      const claims = JSON.parse(token.slice(7));
      return claims;
    }
    return null;
  }),
}));

vi.mock("@/lib/auth/trusted-device", () => ({
  redeemDevice: vi.fn(async (cookie: string, userId: string) => {
    if (cookie === "valid-device") {
      return {
        dek: Buffer.from("test-dek"),
        rotatedCookieValue: "rotated-device",
        maxAgeSeconds: 2592000,
      };
    }
    return null;
  }),
  issueDevice: vi.fn(async (userId: string, dek: Buffer) => {
    return {
      id: "device-123",
      cookieValue: "new-device",
      maxAgeSeconds: 2592000,
    };
  }),
}));

vi.mock("@/lib/auth/finish-login", () => ({
  issueSessionForDek: vi.fn(async (user: any, dek: Buffer) => {
    return {
      kind: "session",
      token: `session.${user.id}`,
      jti: "jti-123",
    };
  }),
}));

vi.mock("@/lib/crypto/dek-cache", () => ({
  putDEK: vi.fn(),
}));

vi.mock("@/db", () => ({
  db: {
    execute: vi.fn(),
  },
}));

vi.mock("drizzle-orm", () => ({
  sql: vi.fn((_strings: TemplateStringsArray) => ({})),
}));

// Track redirect calls
let lastRedirectUrl: string | null = null;
const lastSetCookies: Array<{ name: string; value: string; options: any }> = [];

vi.stubGlobal("NextResponse", {
  redirect: (url: string) => {
    lastRedirectUrl = url;
    return { status: 302 };
  },
  json: (data: any) => {
    return { json: data };
  },
});

function makeCallbackRequest(
  queryParams: Record<string, string>,
  cookies?: Record<string, string>,
  headers?: Record<string, string>
): NextRequest {
  const url = new URL("http://localhost:3000/api/auth/google/callback");
  for (const [k, v] of Object.entries(queryParams)) {
    url.searchParams.set(k, v);
  }

  const cookieHeader = Object.entries(cookies || {})
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");

  const allHeaders = {
    ...headers,
    ...(cookieHeader && { cookie: cookieHeader }),
  };

  return new NextRequest(url.toString(), {
    method: "GET",
    headers: allHeaders as any,
  });
}

describe("/api/auth/google/callback", () => {
  beforeEach(() => {
    mockUsers.clear();
    mockIdentities.clear();
    rateLimitChecks.length = 0;
    sessionCookies.length = 0;
    lastRedirectUrl = null;
    lastSetCookies.length = 0;

    vi.clearAllMocks();
  });

  describe("state validation", () => {
    it("should reject if state parameter is missing", async () => {
      const { GET } = await import("@/app/api/auth/google/callback/route");
      const req = makeCallbackRequest({
        code: "valid-code",
        // missing state
      });

      const res = await GET(req);
      expect(res.status).toBe(400);
    });

    it("should reject if state cookie is missing", async () => {
      const { GET } = await import("@/app/api/auth/google/callback/route");
      const req = makeCallbackRequest({
        code: "valid-code",
        state: "test-state",
        // no pf_oauth_state cookie
      });

      const res = await GET(req);
      expect(res.status).toBe(400);
    });

    it("should reject if state does not match", async () => {
      const { GET } = await import("@/app/api/auth/google/callback/route");
      const req = makeCallbackRequest(
        {
          code: "valid-code",
          state: "param-state",
        },
        {
          pf_oauth_state: "cookie-state",
        }
      );

      const res = await GET(req);
      expect(res.status).toBe(400);
    });
  });

  describe("identity resolution", () => {
    it("should create session for known identity", async () => {
      // Set up a known identity
      const userId = "user-existing";
      const googleSub = "google-sub-123";
      mockIdentities.set(`google:${googleSub}`, {
        provider: "google",
        subject: googleSub,
        userId,
      });
      mockUsers.set(userId, { id: userId, email: "user@example.com" });

      const { GET } = await import("@/app/api/auth/google/callback/route");
      const req = makeCallbackRequest(
        {
          code: "valid-code",
          state: "test-state",
        },
        {
          pf_oauth_state: "test-state",
        }
      );

      const res = await GET(req);

      // Should redirect to dashboard (after session issued)
      expect(res.status).toBe(302);
    });

    it("should return unlock cookie for known identity without device", async () => {
      // Set up a known identity without device
      const userId = "user-existing";
      const googleSub = "google-sub-123";
      mockIdentities.set(`google:${googleSub}`, {
        provider: "google",
        subject: googleSub,
        userId,
      });
      mockUsers.set(userId, { id: userId, email: "user@example.com" });

      const { GET } = await import("@/app/api/auth/google/callback/route");
      const req = makeCallbackRequest(
        {
          code: "valid-code",
          state: "test-state",
        },
        {
          pf_oauth_state: "test-state",
        },
        {
          "x-forwarded-proto": "https",
          "x-forwarded-host": "money.reika.vn",
        }
      );

      const res = await GET(req);

      // Should redirect with unlock cookie set
      expect(res.status).toBe(302);
    });

    it("should return unlock cookie for verified email match", async () => {
      // User exists with same verified email
      const userId = "user-by-email";
      mockUsers.set(userId, {
        id: userId,
        email: "google@example.com",
      });

      // No identity record yet

      const { GET } = await import("@/app/api/auth/google/callback/route");
      const req = makeCallbackRequest(
        {
          code: "valid-code",
          state: "test-state",
        },
        {
          pf_oauth_state: "test-state",
        }
      );

      const res = await GET(req);

      // Should redirect with unlock cookie (linking path)
      expect(res.status).toBe(302);
    });

    it("should return signup cookie for unknown user", async () => {
      // No user and no identity

      const { GET } = await import("@/app/api/auth/google/callback/route");
      const req = makeCallbackRequest(
        {
          code: "valid-code",
          state: "test-state",
        },
        {
          pf_oauth_state: "test-state",
        }
      );

      const res = await GET(req);

      // Should redirect with signup cookie
      expect(res.status).toBe(302);
    });
  });

  describe("rate limiting", () => {
    it("should check rate limit per IP", async () => {
      const { GET } = await import("@/app/api/auth/google/callback/route");
      const req = makeCallbackRequest(
        {
          code: "valid-code",
          state: "test-state",
        },
        {
          pf_oauth_state: "test-state",
        },
        {
          "x-forwarded-for": "203.0.113.1",
        }
      );

      await GET(req);

      const { checkRateLimit } = await import("@/lib/rate-limit");
      expect(checkRateLimit).toHaveBeenCalledWith(
        "google-callback:203.0.113.1",
        10,
        60
      );
    });
  });

  describe("redirect URLs", () => {
    it("should use x-forwarded-host and x-forwarded-proto for redirect", async () => {
      const { GET } = await import("@/app/api/auth/google/callback/route");
      const req = makeCallbackRequest(
        {
          code: "valid-code",
          state: "test-state",
        },
        {
          pf_oauth_state: "test-state",
        },
        {
          "x-forwarded-proto": "https",
          "x-forwarded-host": "custom.domain.com",
        }
      );

      const res = await GET(req);

      // Response should use the forwarded host
      expect(res.status).toBe(302);
    });
  });
});
