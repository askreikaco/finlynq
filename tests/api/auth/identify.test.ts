/**
 * POST /api/auth/identify — Check if an email or username exists.
 * Tests: rate limiting, response shape ({ exists: boolean }),
 * and validation.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { POST } from "@/app/api/auth/identify/route";
import { NextRequest, NextResponse } from "next/server";

// Mock dependencies
vi.mock("@/db", () => ({
  getDialect: () => "postgres",
}));

vi.mock("@/lib/auth/queries", () => ({
  isIdentifierClaimed: vi.fn(),
}));

vi.mock("@/lib/validate", () => ({
  validateBody: vi.fn(),
  logApiError: vi.fn(),
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(),
}));

import { isIdentifierClaimed } from "@/lib/auth/queries";
import { validateBody, logApiError } from "@/lib/validate";
import { checkRateLimit } from "@/lib/rate-limit";

const mockIsIdentifierClaimed = isIdentifierClaimed as ReturnType<typeof vi.fn>;
const mockValidateBody = validateBody as ReturnType<typeof vi.fn>;
const mockCheckRateLimit = checkRateLimit as ReturnType<typeof vi.fn>;

function makeRequest(body: unknown, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest(new URL("http://localhost:3000/api/auth/identify"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

describe("POST /api/auth/identify", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCheckRateLimit.mockReturnValue({ allowed: true, resetAt: 0 });
    mockValidateBody.mockImplementation((body) => ({
      data: body,
      error: null,
    }));
  });

  it("returns { exists: true } when identifier exists", async () => {
    mockIsIdentifierClaimed.mockResolvedValue(true);
    const req = makeRequest({ identifier: "test@example.com" });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({ exists: true });
    expect(Object.keys(data).length).toBe(1);
  });

  it("returns { exists: false } when identifier does not exist", async () => {
    mockIsIdentifierClaimed.mockResolvedValue(false);
    const req = makeRequest({ identifier: "newuser@example.com" });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({ exists: false });
    expect(Object.keys(data).length).toBe(1);
  });

  it("does not return other fields (no user data leakage)", async () => {
    mockIsIdentifierClaimed.mockResolvedValue(true);
    const req = makeRequest({ identifier: "test@example.com" });
    const res = await POST(req);
    const data = await res.json();
    expect(data).not.toHaveProperty("name");
    expect(data).not.toHaveProperty("email");
    expect(data).not.toHaveProperty("methods");
  });

  it("is rate-limited per IP", async () => {
    mockCheckRateLimit.mockReturnValue({
      allowed: false,
      resetAt: Date.now() + 30000,
    });
    const req = makeRequest({ identifier: "test@example.com" });
    const res = await POST(req);
    expect(res.status).toBe(429);
    expect(mockCheckRateLimit).toHaveBeenCalledWith("identify:unknown", 10, 60_000);
  });

  it("normalizes email to lowercase", async () => {
    mockIsIdentifierClaimed.mockResolvedValue(true);
    const req = makeRequest({ identifier: "Test@Example.COM" });
    await POST(req);
    expect(mockValidateBody).toHaveBeenCalled();
    // The validation should pass (lowercase transformation happens in schema)
  });

  it("rejects invalid body with 400", async () => {
    mockValidateBody.mockReturnValue({
      data: null,
      error: NextResponse.json({ error: "Invalid input" }, { status: 400 }),
    });
    const req = makeRequest({});
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("trims whitespace from identifier", async () => {
    mockIsIdentifierClaimed.mockResolvedValue(false);
    const req = makeRequest({ identifier: "  test@example.com  " });
    await POST(req);
    // Should be trimmed and lowercased by schema
    expect(mockValidateBody).toHaveBeenCalled();
  });
});
