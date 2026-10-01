/**
 * POST /api/auth/identify — { exists } only, rate-limited, normalized,
 * generic errors, never logs the identifier. Real zod + real validateBody;
 * only the DB lookup, rate limiter and error logger are mocked.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/db", () => ({ getDialect: () => "postgres" }));
vi.mock("@/lib/auth/queries", () => ({ isIdentifierClaimed: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: vi.fn() }));
vi.mock("@/lib/validate", async () => {
  const actual = await vi.importActual<typeof import("@/lib/validate")>("@/lib/validate");
  return { ...actual, logApiError: vi.fn(async () => {}) };
});

import { POST } from "@/app/api/auth/identify/route";
import { isIdentifierClaimed } from "@/lib/auth/queries";
import { checkRateLimit } from "@/lib/rate-limit";
import { logApiError } from "@/lib/validate";

const claimed = isIdentifierClaimed as ReturnType<typeof vi.fn>;
const limit = checkRateLimit as ReturnType<typeof vi.fn>;

function req(body: unknown, headers: Record<string, string> = {}, raw?: string): NextRequest {
  return new NextRequest(new URL("http://localhost:3000/api/auth/identify"), {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: raw ?? JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  limit.mockReturnValue({ allowed: true, remaining: 4, resetAt: Date.now() + 60_000 });
});

describe("POST /api/auth/identify", () => {
  it("returns exactly { exists: true } / { exists: false }", async () => {
    claimed.mockResolvedValueOnce(true);
    const a = await POST(req({ identifier: "a@example.com" }));
    expect(a.status).toBe(200);
    expect(await a.json()).toStrictEqual({ exists: true });
    claimed.mockResolvedValueOnce(false);
    const b = await POST(req({ identifier: "b@example.com" }));
    expect(b.status).toBe(200);
    expect(await b.json()).toStrictEqual({ exists: false });
  });

  it("does the same single lookup for both outcomes (no extra work)", async () => {
    claimed.mockResolvedValue(true);
    await POST(req({ identifier: "a@example.com" }));
    claimed.mockResolvedValue(false);
    await POST(req({ identifier: "b@example.com" }));
    expect(claimed).toHaveBeenCalledTimes(2);
  });

  it("trims and lowercases before the lookup (matches login's lower() match)", async () => {
    claimed.mockResolvedValue(false);
    await POST(req({ identifier: "  Test@Example.COM  " }));
    expect(claimed).toHaveBeenCalledWith("test@example.com");
  });

  it("matches usernames through the same lookup (no email-only shortcut)", async () => {
    claimed.mockResolvedValue(true);
    const res = await POST(req({ identifier: "Cool.Dragon" }));
    expect(claimed).toHaveBeenCalledWith("cool.dragon");
    expect(await res.json()).toStrictEqual({ exists: true });
  });

  it.each([{}, { identifier: "" }, { identifier: "   " }, { identifier: 5 }, { identifier: "x".repeat(255) }])(
    "rejects invalid body %j with 400 and no lookup",
    async (b) => {
      const res = await POST(req(b));
      expect(res.status).toBe(400);
      expect(claimed).not.toHaveBeenCalled();
    }
  );

  it("rate-limits per IP at the login budget (5/60s) using x-real-ip", async () => {
    claimed.mockResolvedValue(false);
    await POST(req({ identifier: "a@example.com" }, { "x-real-ip": "203.0.113.9" }));
    expect(limit).toHaveBeenCalledWith("identify:203.0.113.9", 5, 60_000);
  });

  it("returns 429 + Retry-After and skips the lookup when limited", async () => {
    limit.mockReturnValue({ allowed: false, remaining: 0, resetAt: Date.now() + 30_000 });
    const res = await POST(req({ identifier: "a@example.com" }));
    expect(res.status).toBe(429);
    expect(Number(res.headers.get("Retry-After"))).toBeGreaterThan(0);
    expect(claimed).not.toHaveBeenCalled();
    expect(await res.json()).toStrictEqual({ error: "Too many requests. Please try again later." });
  });

  it("returns a generic 500 and never logs the identifier", async () => {
    claimed.mockRejectedValue(new Error("db down for secret-person@example.com"));
    const res = await POST(req({ identifier: "secret-person@example.com" }));
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain("secret-person");
    const logged = JSON.stringify((logApiError as ReturnType<typeof vi.fn>).mock.calls.map((c) => c.slice(0, 2)));
    expect(logged).not.toContain("secret-person");
  });

  it("returns generic 500 on malformed JSON", async () => {
    const res = await POST(req(null, {}, "{not json"));
    expect(res.status).toBe(500);
    expect(claimed).not.toHaveBeenCalled();
  });
});
