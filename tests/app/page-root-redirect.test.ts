/**
 * Root page PF_ROOT_REDIRECT feature tests
 *
 * Verifies redirect behavior when PF_ROOT_REDIRECT is set:
 * (a) Flag unset: "/" renders normally without redirect
 * (b) Flag "1" + no cookie: redirect to /cloud
 * (c) Flag "1" + valid session: redirect to /dashboard
 * (d) Flag "1" + verifySessionToken returns null: redirect to /cloud
 * (e) Flag "1" + verifySessionToken throws: redirect to /cloud
 * (f) Flag "0": no redirect
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Mock landing components and styles
vi.mock("@/components/landing/landing-client", () => ({
  LandingClient: () => null,
}));

vi.mock("@/components/seo/json-ld", () => ({
  JsonLd: () => null,
  softwareApplicationSchema: () => ({}),
}));

vi.mock("./landing.css", () => ({}));

// Set up mocks for next/headers, next/navigation, and jwt
let mockCookieToken: string | null = null;

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: (name: string) => {
      if (name === "pf_session" && mockCookieToken) {
        return { value: mockCookieToken };
      }
      return undefined;
    },
  })),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error("REDIRECT:" + url);
  }),
}));

vi.mock("@/lib/auth/jwt", () => ({
  verifySessionToken: vi.fn(),
}));

// Now import after mocks are set up
import * as jwtModule from "@/lib/auth/jwt";
import HomePage from "@/app/page";

describe("Root Page — PF_ROOT_REDIRECT", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCookieToken = null;
  });

  afterEach(() => {
    delete process.env.PF_ROOT_REDIRECT;
    mockCookieToken = null;
  });

  describe("(a) Flag unset: renders landing page without redirect", () => {
    it("HomePage resolves to React element when PF_ROOT_REDIRECT is unset", async () => {
      delete process.env.PF_ROOT_REDIRECT;
      const result = await HomePage();
      // Should resolve to a React element (not throw redirect)
      expect(result).toBeDefined();
    });
  });

  describe("(b) Flag '1' + no cookie: redirect to /cloud", () => {
    beforeEach(() => {
      process.env.PF_ROOT_REDIRECT = "1";
      mockCookieToken = null;
    });

    it("HomePage throws with REDIRECT:/cloud when no session cookie", async () => {
      await expect(HomePage()).rejects.toThrow("REDIRECT:/cloud");
    });
  });

  describe("(c) Flag '1' + valid session: redirect to /dashboard", () => {
    beforeEach(() => {
      process.env.PF_ROOT_REDIRECT = "1";
      mockCookieToken = "valid-token";
      vi.mocked(jwtModule.verifySessionToken).mockResolvedValue({
        sub: "user-123",
        jti: "session-456",
        mfa: false,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 86400,
        iss: "pf-auth",
        aud: "pf-app",
      });
    });

    it("HomePage throws with REDIRECT:/dashboard when session is valid", async () => {
      await expect(HomePage()).rejects.toThrow("REDIRECT:/dashboard");
    });
  });

  describe("(d) Flag '1' + verifySessionToken returns null: redirect to /cloud", () => {
    beforeEach(() => {
      process.env.PF_ROOT_REDIRECT = "1";
      mockCookieToken = "invalid-token";
      vi.mocked(jwtModule.verifySessionToken).mockResolvedValue(null);
    });

    it("HomePage throws with REDIRECT:/cloud when session token is invalid", async () => {
      await expect(HomePage()).rejects.toThrow("REDIRECT:/cloud");
    });
  });

  describe("(e) Flag '1' + verifySessionToken throws: redirect to /cloud", () => {
    beforeEach(() => {
      process.env.PF_ROOT_REDIRECT = "1";
      mockCookieToken = "malformed-token";
      vi.mocked(jwtModule.verifySessionToken).mockRejectedValue(
        new Error("Token verification failed")
      );
    });

    it("HomePage throws with REDIRECT:/cloud when token verification fails", async () => {
      await expect(HomePage()).rejects.toThrow("REDIRECT:/cloud");
    });
  });

  describe("(f) Flag '0': no redirect", () => {
    beforeEach(() => {
      process.env.PF_ROOT_REDIRECT = "0";
    });

    it("HomePage resolves without redirect when flag is '0'", async () => {
      const result = await HomePage();
      expect(result).toBeDefined();
    });
  });
});
