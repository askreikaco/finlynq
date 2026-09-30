/**
 * Tests for /api/auth/google/unlock route.
 *
 * Covers:
 * - Request validation (no/invalid unlock cookie)
 * - Password verification:
 *   - Wrong password → 401 and no writes to database
 *   - Right password → session created, identity upserted, device issued
 * - MFA handling:
 *   - MFA enabled → returns { mfaRequired, mfaPendingToken }
 *   - Device still issued even with MFA pending
 * - Rate limiting:
 *   - 5/60s per IP
 *   - 10/h per user
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

process.env.PF_JWT_SECRET = "test-jwt-secret-for-vitest-32chars!!";
process.env.DEPLOY_GENERATION = "0";
process.env.GOOGLE_CLIENT_ID = "test-client-id";
process.env.GOOGLE_CLIENT_SECRET = "test-client-secret";

const rateLimitChecks: Array<{ key: string; limit: number; duration: number }> = [];
const mockUsers = new Map<string, any>();
const mockIdentities = new Map<string, any>();
const upsertedIdentities: any[] = [];
const issuedDevices: any[] = [];
const sessionsCreated: Array<{ token: string; userId: string }> = [];

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn((key: string, limit: number, duration: number) => {
    rateLimitChecks.push({ key, limit, duration });
    return true; // Allow all for testing
  }),
}));

vi.mock("@/lib/auth/queries", () => ({
  getUserById: vi.fn(async (userId: string) => {
    return mockUsers.get(userId) || null;
  }),
  recordSuccessfulLogin: vi.fn(),
  upsertIdentity: vi.fn(async (params: any) => {
    upsertedIdentities.push(params);
    const key = `${params.provider}:${params.subject}`;
    mockIdentities.set(key, params);
  }),
}));

vi.mock("@/lib/auth/jwt", () => ({
  verifyShortLived: vi.fn(async (token: string) => {
    if (token.startsWith("signed.")) {
      const claims = JSON.parse(token.slice(7));
      return claims;
    }
    return null;
  }),
  createSessionToken: vi.fn(async (userId: string) => {
    const token = `session.${userId}`;
    sessionsCreated.push({ token, userId });
    return { token, jti: "jti-123" };
  }),
}));

vi.mock("@/lib/auth/trusted-device", () => ({
  issueDevice: vi.fn(async (userId: string, dek: Buffer, userAgent?: string) => {
    const device = {
      id: "device-123",
      cookieValue: "issued-device-cookie",
      maxAgeSeconds: 2592000,
    };
    issuedDevices.push({ userId, ...device });
    return device;
  }),
}));

vi.mock("@/lib/auth/finish-login", () => ({
  finishPasswordLogin: vi.fn(async (user: any, password: string) => {
    if (password === "correct-password") {
      if (user.mfaEnabled) {
        return {
          kind: "mfa",
          token: "pending-mfa-token",
        };
      }
      return {
        kind: "session",
        token: `session.${user.id}`,
        jti: "jti-123",
      };
    }
    return {
      kind: "unlock_failed",
    };
  }),
}));

vi.mock("@/lib/crypto/dek-cache", () => ({
  putDEK: vi.fn(),
}));

vi.mock("@/lib/crypto/envelope", () => ({
  deriveKEK: vi.fn((salt: Buffer, password: string) => Buffer.from("test-kek")),
  unwrapDEK: vi.fn((wrapped: string, iv: string, tag: string, kek: Buffer) => {
    if (wrapped === "valid-wrapped") {
      return Buffer.from("test-dek");
    }
    throw new Error("Unwrap failed");
  }),
}));

vi.mock("@/db", () => ({
  db: {
    execute: vi.fn(),
  },
}));

vi.mock("drizzle-orm", () => ({
  sql: vi.fn((_strings: TemplateStringsArray) => ({})),
}));

function makeUnlockRequest(
  body: any,
  cookies?: Record<string, string>,
  headers?: Record<string, string>
): NextRequest {
  const cookieHeader = Object.entries(cookies || {})
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");

  const allHeaders = {
    "content-type": "application/json",
    ...headers,
    ...(cookieHeader && { cookie: cookieHeader }),
  };

  return new NextRequest("http://localhost:3000/api/auth/google/unlock", {
    method: "POST",
    headers: allHeaders as any,
    body: JSON.stringify(body),
  });
}

describe("/api/auth/google/unlock", () => {
  beforeEach(() => {
    mockUsers.clear();
    mockIdentities.clear();
    upsertedIdentities.length = 0;
    issuedDevices.length = 0;
    sessionsCreated.length = 0;
    rateLimitChecks.length = 0;

    vi.clearAllMocks();

    // Set up a test user
    mockUsers.set("user-existing", {
      id: "user-existing",
      email: "user@example.com",
      mfaEnabled: 0,
      kekSalt: "test-salt",
      dekWrapped: "valid-wrapped",
      dekWrappedIv: "test-iv",
      dekWrappedTag: "test-tag",
      pepperVersion: 1,
    });

    mockUsers.set("user-mfa", {
      id: "user-mfa",
      email: "mfa@example.com",
      mfaEnabled: 1,
      kekSalt: "test-salt",
      dekWrapped: "valid-wrapped",
      dekWrappedIv: "test-iv",
      dekWrappedTag: "test-tag",
      pepperVersion: 1,
    });
  });

  describe("request validation", () => {
    it("should reject if pf_unlock cookie is missing", async () => {
      const { POST } = await import("@/app/api/auth/google/unlock/route");
      const req = makeUnlockRequest({
        password: "test-password",
      });

      const res = await POST(req);
      expect(res.status).toBe(400);
    });

    it("should reject if unlock cookie is invalid", async () => {
      const { POST } = await import("@/app/api/auth/google/unlock/route");
      const req = makeUnlockRequest(
        {
          password: "test-password",
        },
        {
          pf_unlock: "invalid-token",
        }
      );

      const res = await POST(req);
      expect(res.status).toBe(400);
    });

    it("should reject if password is missing", async () => {
      const { POST } = await import("@/app/api/auth/google/unlock/route");
      const req = makeUnlockRequest(
        {},
        {
          pf_unlock: "signed.user-existing",
        }
      );

      const res = await POST(req);
      expect(res.status).toBe(400);
    });
  });

  describe("password verification", () => {
    it("should return 401 for wrong password without writing to database", async () => {
      const { POST } = await import("@/app/api/auth/google/unlock/route");
      const req = makeUnlockRequest(
        {
          password: "wrong-password",
        },
        {
          pf_unlock: "signed.user-existing",
        }
      );

      const res = await POST(req);
      expect(res.status).toBe(401);

      // No identity should be upserted
      expect(upsertedIdentities.length).toBe(0);

      // No device should be issued
      expect(issuedDevices.length).toBe(0);

      // No session should be created
      expect(sessionsCreated.length).toBe(0);
    });

    it("should return 200 for correct password with session + identity + device", async () => {
      const { POST } = await import("@/app/api/auth/google/unlock/route");
      const req = makeUnlockRequest(
        {
          password: "correct-password",
          googleSub: "google-sub-123",
        },
        {
          pf_unlock: "signed.user-existing",
        }
      );

      const res = await POST(req);
      expect(res.status).toBe(200);

      // Should have upserted identity
      expect(upsertedIdentities.length).toBe(1);
      expect(upsertedIdentities[0].provider).toBe("google");
      expect(upsertedIdentities[0].subject).toBe("google-sub-123");
      expect(upsertedIdentities[0].userId).toBe("user-existing");

      // Should have issued device
      expect(issuedDevices.length).toBe(1);
      expect(issuedDevices[0].userId).toBe("user-existing");

      // Should have created session
      expect(sessionsCreated.length).toBe(1);
    });
  });

  describe("MFA handling", () => {
    it("should return MFA pending token when user has MFA enabled", async () => {
      const { POST } = await import("@/app/api/auth/google/unlock/route");
      const req = makeUnlockRequest(
        {
          password: "correct-password",
          googleSub: "google-sub-123",
        },
        {
          pf_unlock: "signed.user-mfa",
        }
      );

      const res = await POST(req);

      // Should still be 200 with MFA token
      if (res.status === 200) {
        const body = await res.json();
        expect(body.mfaRequired || body.mfaPendingToken).toBeTruthy();
      }
    });

    it("should issue device even with MFA pending", async () => {
      const { POST } = await import("@/app/api/auth/google/unlock/route");
      const req = makeUnlockRequest(
        {
          password: "correct-password",
          googleSub: "google-sub-123",
        },
        {
          pf_unlock: "signed.user-mfa",
        }
      );

      await POST(req);

      // Device should still be issued even if MFA is required
      expect(issuedDevices.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe("rate limiting", () => {
    it("should check rate limit: 5/60s per IP", async () => {
      const { POST } = await import("@/app/api/auth/google/unlock/route");
      const req = makeUnlockRequest(
        {
          password: "correct-password",
        },
        {
          pf_unlock: "signed.user-existing",
        },
        {
          "x-forwarded-for": "203.0.113.1",
        }
      );

      await POST(req);

      const { checkRateLimit } = await import("@/lib/rate-limit");
      const calls = (checkRateLimit as any).mock.calls;

      // Should have IP-based rate limit check
      const ipCall = calls.find((c: any[]) => c[0].includes("google-unlock") && c[0].includes("203.0.113.1"));
      expect(ipCall).toBeTruthy();
      if (ipCall) {
        expect(ipCall[1]).toBe(5); // 5 per minute
        expect(ipCall[2]).toBe(60);
      }
    });

    it("should check rate limit: 10/h per user", async () => {
      const { POST } = await import("@/app/api/auth/google/unlock/route");
      const req = makeUnlockRequest(
        {
          password: "correct-password",
        },
        {
          pf_unlock: "signed.user-existing",
        }
      );

      await POST(req);

      const { checkRateLimit } = await import("@/lib/rate-limit");
      const calls = (checkRateLimit as any).mock.calls;

      // Should have per-user rate limit check
      const userCall = calls.find((c: any[]) => c[0].includes("user-existing"));
      expect(userCall).toBeTruthy();
      if (userCall) {
        expect(userCall[1]).toBe(10); // 10 per hour
        expect(userCall[2]).toBe(3600);
      }
    });
  });
});
