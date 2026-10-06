/**
 * /api/admin/instance/config endpoint tests (WP9a)
 *
 * Assertions:
 * 1. Requires admin authentication (401/403 on non-admin)
 * 2. Returns effective config with masked secrets
 * 3. Rejects state-changing methods (POST/PATCH/DELETE)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { GET, POST, PATCH, DELETE } from "@/app/api/admin/instance/config/route";

// Mock requireAdmin to control auth state
type AdminAuthResult =
  | {
      authenticated: true;
      context: { userId: string };
    }
  | {
      authenticated: false;
      response: NextResponse;
    };

let adminAuthState: AdminAuthResult = {
  authenticated: false,
  response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
};

vi.mock("@/lib/auth/require-admin", () => ({
  requireAdmin: vi.fn(async () => adminAuthState),
}));

describe("GET /api/admin/instance/config", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when user is not authenticated", async () => {
    adminAuthState = {
      authenticated: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };

    const request = new NextRequest("http://localhost:3000/api/admin/instance/config");
    const response = await GET(request);

    expect(response.status).toBe(401);
  });

  it("returns 403 when user is not admin", async () => {
    adminAuthState = {
      authenticated: false,
      response: NextResponse.json({ error: "Admin access required." }, { status: 403 }),
    };

    const request = new NextRequest("http://localhost:3000/api/admin/instance/config");
    const response = await GET(request);

    expect(response.status).toBe(403);
  });

  it("returns effective config when user is admin", async () => {
    adminAuthState = {
      authenticated: true,
      context: { userId: "admin-user" },
    };

    const request = new NextRequest("http://localhost:3000/api/admin/instance/config");
    const response = await GET(request);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toHaveProperty("google");
    expect(body).toHaveProperty("passkey");
    expect(body).toHaveProperty("email");
  });

  it("never leaks secrets in response JSON", async () => {
    adminAuthState = {
      authenticated: true,
      context: { userId: "admin-user" },
    };

    // Mock process.env with secrets
    const originalEnv = process.env;
    process.env.GOOGLE_CLIENT_SECRET = "super-secret-key-12345";
    process.env.SENDGRID_API_KEY = "SG.secret-sendgrid-key";

    try {
      const request = new NextRequest("http://localhost:3000/api/admin/instance/config");
      const response = await GET(request);

      const json = await response.json();
      const jsonString = JSON.stringify(json);

      // Verify secrets are not in the response
      expect(jsonString).not.toContain("super-secret-key-12345");
      expect(jsonString).not.toContain("SG.secret-sendgrid-key");
      // Should only contain masked version
      expect(jsonString).toContain("***");
    } finally {
      process.env = originalEnv;
    }
  });
});

describe("State-changing methods", () => {
  beforeEach(() => {
    adminAuthState = {
      authenticated: true,
      context: { userId: "admin-user" },
    };
    vi.clearAllMocks();
  });

  it("POST returns 405 Method Not Allowed", async () => {
    const response = await POST();
    expect(response.status).toBe(405);
  });

  it("PATCH returns 405 Method Not Allowed", async () => {
    const response = await PATCH();
    expect(response.status).toBe(405);
  });

  it("DELETE returns 405 Method Not Allowed", async () => {
    const response = await DELETE();
    expect(response.status).toBe(405);
  });
});
