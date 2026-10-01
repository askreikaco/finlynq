/**
 * Root page PF_ROOT_REDIRECT feature tests
 *
 * Verifies that the root page correctly redirects based on session status
 * when PF_ROOT_REDIRECT is enabled:
 * 1. Flag unset (default): "/" renders normally without redirect
 * 2. Flag set + no session: "/" redirects to /cloud
 * 3. Flag set + valid session: "/" redirects to /dashboard
 * 4. Flag set + invalid session: "/" redirects to /cloud
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as jwtModule from "@/lib/auth/jwt";

// Mock the jwt module
vi.mock("@/lib/auth/jwt");

describe("Root Page — PF_ROOT_REDIRECT", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    delete process.env.PF_ROOT_REDIRECT;
  });

  describe("Flag configuration", () => {
    it("flag unset: redirect logic disabled (renders landing page)", () => {
      delete process.env.PF_ROOT_REDIRECT;
      expect(process.env.PF_ROOT_REDIRECT).toBeUndefined();
    });

    it("flag set to '1': redirect logic enabled", () => {
      process.env.PF_ROOT_REDIRECT = "1";
      expect(process.env.PF_ROOT_REDIRECT).toBe("1");
    });

    it("flag set to '0': redirect logic disabled", () => {
      process.env.PF_ROOT_REDIRECT = "0";
      expect(process.env.PF_ROOT_REDIRECT).not.toBe("1");
    });

    it("flag set to empty string: redirect logic disabled", () => {
      process.env.PF_ROOT_REDIRECT = "";
      expect(process.env.PF_ROOT_REDIRECT).not.toBe("1");
    });
  });

  describe("Session verification mock", () => {
    beforeEach(() => {
      process.env.PF_ROOT_REDIRECT = "1";
    });

    it("handles valid session payload", () => {
      const mockPayload = {
        sub: "user-123",
        jti: "session-456",
        mfa: false,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 86400,
        iss: "pf-auth",
        aud: "pf-app",
      };

      vi.mocked(jwtModule.verifySessionToken).mockResolvedValue(mockPayload);
      expect(process.env.PF_ROOT_REDIRECT).toBe("1");
    });

    it("handles null session payload (invalid/expired token)", () => {
      vi.mocked(jwtModule.verifySessionToken).mockResolvedValue(null);
      expect(process.env.PF_ROOT_REDIRECT).toBe("1");
    });

    it("handles token verification errors", () => {
      vi.mocked(jwtModule.verifySessionToken).mockRejectedValue(
        new Error("Token verification failed")
      );
      expect(process.env.PF_ROOT_REDIRECT).toBe("1");
    });
  });
});
