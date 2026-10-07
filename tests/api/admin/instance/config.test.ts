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
import * as routeModule from "@/app/api/admin/instance/config/route";
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

// Mock the email config resolution
vi.mock("@/lib/email", () => ({
  resolveEmailConfig: vi.fn(async () => ({
    provider: { value: undefined, source: "none" as const },
    from: { value: undefined, source: "none" as const },
    brevoApiKey: { value: undefined, source: "none" as const },
    resendApiKey: { value: undefined, source: "none" as const },
    smtpHost: { value: undefined, source: "none" as const },
    smtpPort: { value: undefined, source: "none" as const },
    smtpUser: { value: undefined, source: "none" as const },
    smtpPass: { value: undefined, source: "none" as const },
  })),
  activeEmailProvider: vi.fn(() => "none" as const),
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

    // Mock process.env with secrets using vi.stubEnv
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "super-secret-key-12345");
    vi.stubEnv("RESEND_API_KEY", "re_test-resend-api-key");
    vi.stubEnv("BREVO_API_KEY", "xkeysib-test-brevo-api-key");
    vi.stubEnv("SMTP_PASS", "smtp-password-secret");

    try {
      const request = new NextRequest("http://localhost:3000/api/admin/instance/config");
      const response = await GET(request);

      const json = await response.json();
      const jsonString = JSON.stringify(json);

      // Verify secrets are not in the response
      expect(jsonString).not.toContain("super-secret-key-12345");
      expect(jsonString).not.toContain("re_test-resend-api-key");
      expect(jsonString).not.toContain("xkeysib-test-brevo-api-key");
      expect(jsonString).not.toContain("smtp-password-secret");
      // Should only contain masked version
      expect(jsonString).toContain("***");
    } finally {
      vi.unstubAllEnvs();
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

  it("route module exports only GET, POST, PATCH, DELETE (no PUT or other HTTP verbs)", () => {
    // Get all exported names from the route module
    const httpVerbs = Object.keys(routeModule).filter((key) =>
      ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"].includes(key)
    );
    // Should contain exactly these four: GET, POST, PATCH, DELETE
    expect(httpVerbs.sort()).toEqual(["DELETE", "GET", "PATCH", "POST"]);
    // Specifically, PUT should not be exported
    expect((routeModule as Record<string, unknown>).PUT).toBeUndefined();
  });
});
