/**
 * Tests for GET /api/auth/google/pending
 *
 * Covers:
 * a) valid pf_google_signup cookie → 200 {kind:"signup", email (masked), name?}
 * b) valid pf_google_unlock_data cookie → 200 {kind:"unlock", email (masked)}
 * c) missing/invalid cookies → 404 {error:"No pending Google sign-in"}
 * d) no raw tokens in response (never return sub)
 * e) rate limiting like unlock
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

process.env.PF_JWT_SECRET = "test-jwt-secret-for-vitest-32chars!!";
process.env.DEPLOY_GENERATION = "0";

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(),
}));

vi.mock("@/lib/client-ip", () => ({
  clientIp: () => "127.0.0.1",
}));

import { GET } from "@/app/api/auth/google/pending/route";
import { signShortLived, verifyShortLived } from "@/lib/auth/jwt";
import * as rateLimit from "@/lib/rate-limit";

const mockCheckRateLimit = vi.mocked(rateLimit.checkRateLimit);

function makePendingRequest(opts?: { signupToken?: string; unlockToken?: string }): NextRequest {
  const url = new URL("http://localhost:3000/api/auth/google/pending");
  const req = new NextRequest(url, { method: "GET" });

  // Manually add cookies if provided
  if (opts?.signupToken) {
    const cookies = req.cookies;
    Object.defineProperty(cookies, "get", {
      value: (name: string) => {
        if (name === "pf_google_signup") {
          return { value: opts.signupToken };
        }
        return undefined;
      },
    });
  }

  if (opts?.unlockToken) {
    const cookies = req.cookies;
    Object.defineProperty(cookies, "get", {
      value: (name: string) => {
        if (name === "pf_google_unlock_data") {
          return { value: opts.unlockToken };
        }
        return undefined;
      },
    });
  }

  return req;
}

describe("GET /api/auth/google/pending", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCheckRateLimit.mockReturnValue({
      allowed: true,
      remaining: 10,
      resetAt: Date.now() + 60_000
    } as any);
  });

  it("returns 200 with masked email and name for valid signup cookie", async () => {
    const signupPayload = {
      sub: "google_sub_123",
      email: "user@example.com",
      emailVerified: true,
      name: "John Doe",
    };
    const token = await signShortLived(signupPayload, 600, "google-signup");

    const url = new URL("http://localhost:3000/api/auth/google/pending");
    const req = new NextRequest(url, {
      method: "GET",
      headers: {
        cookie: `pf_google_signup=${token}`,
      },
    });

    const res = await GET(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.kind).toBe("signup");
    expect(data.email).toMatch(/^u\*{3}@example\.com$/); // Masked email: first char + one asterisk per remaining
    expect(data.name).toBe("John Doe");
    expect(data.sub).toBeUndefined(); // Never return raw token
  });

  it("returns 200 with masked email for valid unlock cookie", async () => {
    const unlockPayload = {
      userId: "user_123",
      sub: "google_sub_123",
      email: "alice@test.com",
      emailVerified: true,
    };
    const token = await signShortLived(unlockPayload, 300, "google-unlock-data");

    const url = new URL("http://localhost:3000/api/auth/google/pending");
    const req = new NextRequest(url, {
      method: "GET",
      headers: {
        cookie: `pf_google_unlock_data=${token}`,
      },
    });

    const res = await GET(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.kind).toBe("unlock");
    expect(data.email).toMatch(/^a\*{4}@test\.com$/); // Masked email: first char + one asterisk per remaining
    expect(data.name).toBeUndefined();
    expect(data.userId).toBeUndefined(); // Never return raw token
  });

  it("returns 404 when no valid cookies present", async () => {
    const url = new URL("http://localhost:3000/api/auth/google/pending");
    const req = new NextRequest(url, { method: "GET" });

    const res = await GET(req);
    const data = await res.json();

    expect(res.status).toBe(404);
    expect(data.error).toBe("No pending Google sign-in");
  });

  it("returns 404 for invalid/expired token", async () => {
    const url = new URL("http://localhost:3000/api/auth/google/pending");
    const req = new NextRequest(url, {
      method: "GET",
      headers: {
        cookie: "pf_google_signup=invalid.token",
      },
    });

    const res = await GET(req);
    const data = await res.json();

    expect(res.status).toBe(404);
    expect(data.error).toBe("No pending Google sign-in");
  });

  it("applies rate limiting and returns 429 when limit exceeded", async () => {
    mockCheckRateLimit.mockReturnValue({
      allowed: false,
      remaining: 0,
      resetAt: Date.now() + 60_000
    } as any);

    const url = new URL("http://localhost:3000/api/auth/google/pending");
    const req = new NextRequest(url, { method: "GET" });

    const res = await GET(req);
    const data = await res.json();

    expect(res.status).toBe(429);
    expect(data.error).toBe("Too many requests");
  });

  it("masks single-character email local part", async () => {
    const signupPayload = {
      sub: "google_sub_123",
      email: "a@example.com",
      emailVerified: true,
    };
    const token = await signShortLived(signupPayload, 600, "google-signup");

    const url = new URL("http://localhost:3000/api/auth/google/pending");
    const req = new NextRequest(url, {
      method: "GET",
      headers: {
        cookie: `pf_google_signup=${token}`,
      },
    });

    const res = await GET(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.email).toBe("*@example.com");
  });
});
