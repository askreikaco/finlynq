/**
 * Tests for requireAdmin auth guard (WP9a)
 *
 * Tests the real requireAdmin function by mocking its dependencies:
 * - requireAuth: for base authentication
 * - getUserById: for fetching user details including role
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

// Mock requireAuth to control auth state
const mockRequireAuth = vi.fn();
vi.mock("@/lib/auth/require-auth", () => ({
  requireAuth: (...args: unknown[]) => mockRequireAuth(...args),
}));

// Mock getUserById to control role resolution
const mockGetUserById = vi.fn();
vi.mock("@/lib/auth/queries", () => ({
  getUserById: (...args: unknown[]) => mockGetUserById(...args),
}));

import { requireAdmin } from "@/lib/auth/require-admin";

function makeRequest(): NextRequest {
  return new NextRequest("http://localhost:3000/api/test");
}

describe("requireAdmin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("authentication state", () => {
    it("returns unauthenticated response when requireAuth fails", async () => {
      const authResponse = NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      mockRequireAuth.mockResolvedValue({
        authenticated: false,
        response: authResponse,
      });

      const result = await requireAdmin(makeRequest());

      expect(result.authenticated).toBe(false);
      if (!result.authenticated) {
        expect(result.response.status).toBe(401);
      }
    });
  });

  describe("role-based access", () => {
    it("returns 403 when user has 'user' role", async () => {
      mockRequireAuth.mockResolvedValue({
        authenticated: true,
        context: { userId: "user-123" },
      });

      mockGetUserById.mockResolvedValue({
        id: "user-123",
        email: "user@example.com",
        role: "user",
      });

      const result = await requireAdmin(makeRequest());

      expect(result.authenticated).toBe(false);
      if (!result.authenticated) {
        expect(result.response.status).toBe(403);
        const json = await result.response.json();
        expect(json.error).toBe("Admin access required.");
      }
    });

    it("returns 403 when user is not found", async () => {
      mockRequireAuth.mockResolvedValue({
        authenticated: true,
        context: { userId: "nonexistent-user" },
      });

      mockGetUserById.mockResolvedValue(null);

      const result = await requireAdmin(makeRequest());

      expect(result.authenticated).toBe(false);
      if (!result.authenticated) {
        expect(result.response.status).toBe(403);
        const json = await result.response.json();
        expect(json.error).toBe("Admin access required.");
      }
    });

    it("returns 403 when user has 'viewer' role", async () => {
      mockRequireAuth.mockResolvedValue({
        authenticated: true,
        context: { userId: "viewer-123" },
      });

      mockGetUserById.mockResolvedValue({
        id: "viewer-123",
        role: "viewer",
      });

      const result = await requireAdmin(makeRequest());

      expect(result.authenticated).toBe(false);
      if (!result.authenticated) {
        expect(result.response.status).toBe(403);
      }
    });

    it("returns 403 when user role is undefined", async () => {
      mockRequireAuth.mockResolvedValue({
        authenticated: true,
        context: { userId: "no-role-user" },
      });

      mockGetUserById.mockResolvedValue({
        id: "no-role-user",
        role: undefined,
      });

      const result = await requireAdmin(makeRequest());

      expect(result.authenticated).toBe(false);
      if (!result.authenticated) {
        expect(result.response.status).toBe(403);
      }
    });

    it.each(["user", "viewer", "moderator", "ADMIN", "Admin", undefined, ""])(
      "returns 403 when user has role: %s",
      async (role) => {
        mockRequireAuth.mockResolvedValue({
          authenticated: true,
          context: { userId: `user-${role}` },
        });

        mockGetUserById.mockResolvedValue({
          id: `user-${role}`,
          role,
        });

        const result = await requireAdmin(makeRequest());

        expect(result.authenticated).toBe(false);
        if (!result.authenticated) {
          expect(result.response.status).toBe(403);
          const json = await result.response.json();
          expect(json.error).toBe("Admin access required.");
        }
      }
    );

    it("returns authenticated when user has 'admin' role", async () => {
      mockRequireAuth.mockResolvedValue({
        authenticated: true,
        context: { userId: "admin-123" },
      });

      mockGetUserById.mockResolvedValue({
        id: "admin-123",
        email: "admin@example.com",
        role: "admin",
      });

      const result = await requireAdmin(makeRequest());

      expect(result.authenticated).toBe(true);
      if (result.authenticated) {
        expect(result.context.userId).toBe("admin-123");
      }
    });
  });
});
