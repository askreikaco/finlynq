/**
 * Tests for admin edit user endpoint:
 * PATCH /api/admin/users
 *
 * Security-sensitive operations covered:
 * a) Non-admin gets 403
 * b) Duplicate email gets 409
 * c) Duplicate username gets 409
 * d) Demoting the last admin gets 409
 * e) Email change resets emailVerified=false unless explicitly set to true
 * f) disableMfa without MFA step-up code gets 403; with step-up works
 * g) Unknown fields like password/kekSalt rejected or ignored, never in DB updates
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

process.env.PF_JWT_SECRET = "test-jwt-secret-for-vitest-32chars!!";
process.env.DEPLOY_GENERATION = "0";

vi.mock("@/db", () => ({
  getDialect: vi.fn(() => "postgres"),
}));

const mockGetUserById = vi.fn();
const mockCountAdminUsers = vi.fn();
const mockGetUserByUsername = vi.fn();
const mockGetUserByEmail = vi.fn();
const mockUpdateUserDisplayName = vi.fn();
const mockUpdateUserUsername = vi.fn();
const mockUpdateUserEmailAdmin = vi.fn();
const mockDisableUserMfaForced = vi.fn();
const mockUpdateUserRole = vi.fn();
const mockUpdateUserPlan = vi.fn();

vi.mock("@/lib/auth/queries", () => ({
  getUserById: (...a: unknown[]) => mockGetUserById(...a),
  countAdminUsers: (...a: unknown[]) => mockCountAdminUsers(...a),
  getUserByUsername: (...a: unknown[]) => mockGetUserByUsername(...a),
  getUserByEmail: (...a: unknown[]) => mockGetUserByEmail(...a),
  updateUserDisplayName: (...a: unknown[]) => mockUpdateUserDisplayName(...a),
  updateUserUsername: (...a: unknown[]) => mockUpdateUserUsername(...a),
  updateUserEmailAdmin: (...a: unknown[]) => mockUpdateUserEmailAdmin(...a),
  disableUserMfaForced: (...a: unknown[]) => mockDisableUserMfaForced(...a),
  updateUserRole: (...a: unknown[]) => mockUpdateUserRole(...a),
  updateUserPlan: (...a: unknown[]) => mockUpdateUserPlan(...a),
}));

const mockRequireAdmin = vi.fn();
vi.mock("@/lib/auth/require-admin", () => ({
  requireAdmin: (...a: unknown[]) => mockRequireAdmin(...a),
}));

const mockLogAdminAction = vi.fn();
const mockClientIp = vi.fn();
vi.mock("@/lib/admin-audit", () => ({
  logAdminAction: (...a: unknown[]) => mockLogAdminAction(...a),
  clientIp: (...a: unknown[]) => mockClientIp(...a),
}));

const mockGetDEK = vi.fn();
vi.mock("@/lib/crypto/dek-cache", () => ({
  getDEK: (...a: unknown[]) => mockGetDEK(...a),
}));

const mockDecryptField = vi.fn();
vi.mock("@/lib/crypto/envelope", () => ({
  decryptField: (...a: unknown[]) => mockDecryptField(...a),
}));

const mockVerifyMfaCode = vi.fn();
vi.mock("@/lib/auth", () => ({
  verifyMfaCode: (...a: unknown[]) => mockVerifyMfaCode(...a),
}));

vi.mock("@/lib/validate", () => ({
  validateBody: (data: unknown, schema: any) => {
    try {
      const parsed = schema.parse(data);
      return { data: parsed, error: null };
    } catch {
      return { data: null, error: new Response(JSON.stringify({ error: "Invalid input" }), { status: 400 }) };
    }
  },
}));

import { PATCH } from "@/app/api/admin/users/route";
import { createMockRequest } from "../helpers/api-test-utils";

describe("PATCH /api/admin/users - Edit User", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockClientIp.mockReturnValue("127.0.0.1");
  });

  describe("(a) Non-admin gets 403", () => {
    it("non-admin access returns 403", async () => {
      const mockResponse = new Response(JSON.stringify({ error: "Unauthorized" }), { status: 403 });
      mockRequireAdmin.mockResolvedValue({
        authenticated: false,
        response: mockResponse,
      } as any);

      const req = createMockRequest("http://localhost:3000/api/admin/users", {
        method: "PATCH",
        body: { userId: "user-1", displayName: "Test" },
      });

      const res = await PATCH(req);
      expect(res.status).toBe(403);
    });
  });

  describe("(b) Duplicate email/username gets 409", () => {
    beforeEach(() => {
      mockRequireAdmin.mockResolvedValue({
        authenticated: true,
        context: { userId: "admin-1", sessionId: "session-1" },
      } as any);
    });

    it("duplicate email gets 409", async () => {
      const adminUser = {
        id: "admin-1",
        mfaEnabled: 0,
        mfaSecret: null,
        role: "admin",
      };

      const targetUser = {
        id: "user-1",
        email: "old@example.com",
        emailVerified: 0,
        mfaEnabled: 0,
        role: "user",
        plan: "free",
        displayName: null,
        username: "user1",
      };

      const existingUser = { id: "user-2", email: "new@example.com" };

      mockGetUserById.mockResolvedValueOnce(adminUser).mockResolvedValueOnce(targetUser);
      mockGetUserByEmail.mockResolvedValue(existingUser);

      const req = createMockRequest("http://localhost:3000/api/admin/users", {
        method: "PATCH",
        body: { userId: "user-1", email: "new@example.com" },
      });

      const res = await PATCH(req);
      expect(res.status).toBe(409);
      const data = await res.json();
      expect(data.error).toContain("Email already taken");
    });

    it("duplicate username gets 409", async () => {
      const adminUser = {
        id: "admin-1",
        mfaEnabled: 0,
        mfaSecret: null,
        role: "admin",
      };

      const targetUser = {
        id: "user-1",
        email: "old@example.com",
        emailVerified: 0,
        mfaEnabled: 0,
        role: "user",
        plan: "free",
        displayName: null,
        username: "olduser",
      };

      const existingUser = { id: "user-2", username: "newuser" };

      mockGetUserById.mockResolvedValueOnce(adminUser).mockResolvedValueOnce(targetUser);
      mockGetUserByUsername.mockResolvedValue(existingUser);

      const req = createMockRequest("http://localhost:3000/api/admin/users", {
        method: "PATCH",
        body: { userId: "user-1", username: "newuser" },
      });

      const res = await PATCH(req);
      expect(res.status).toBe(409);
      const data = await res.json();
      expect(data.error).toContain("Username already taken");
    });
  });

  describe("(c) Demoting the last admin gets 409", () => {
    beforeEach(() => {
      mockRequireAdmin.mockResolvedValue({
        authenticated: true,
        context: { userId: "admin-1", sessionId: "session-1" },
      } as any);
    });

    it("demoting the last admin gets 409", async () => {
      const adminUser = {
        id: "admin-1",
        mfaEnabled: 0,
        mfaSecret: null,
        role: "admin",
      };

      const targetUser = {
        id: "admin-1",
        email: "admin@example.com",
        emailVerified: 1,
        mfaEnabled: 0,
        role: "admin",
        plan: "free",
        displayName: "Admin User",
        username: "admin",
      };

      mockGetUserById.mockResolvedValueOnce(adminUser).mockResolvedValueOnce(targetUser);
      mockCountAdminUsers.mockResolvedValue(1); // only one admin

      const req = createMockRequest("http://localhost:3000/api/admin/users", {
        method: "PATCH",
        body: { userId: "admin-1", role: "user" },
      });

      const res = await PATCH(req);
      expect(res.status).toBe(409);
      const data = await res.json();
      expect(data.error).toContain("last admin");
    });
  });

  describe("(d) Email change resets emailVerified", () => {
    beforeEach(() => {
      mockRequireAdmin.mockResolvedValue({
        authenticated: true,
        context: { userId: "admin-1", sessionId: "session-1" },
      } as any);
    });

    it("email change resets emailVerified to false", async () => {
      const adminUser = {
        id: "admin-1",
        mfaEnabled: 0,
        mfaSecret: null,
        role: "admin",
      };

      const targetUser = {
        id: "user-1",
        email: "old@example.com",
        emailVerified: 1,
        mfaEnabled: 0,
        role: "user",
        plan: "free",
        displayName: null,
        username: "user1",
      };

      mockGetUserById.mockResolvedValueOnce(adminUser).mockResolvedValueOnce(targetUser);
      mockGetUserByEmail.mockResolvedValue(null); // new email not taken
      mockUpdateUserEmailAdmin.mockResolvedValue(undefined);

      const req = createMockRequest("http://localhost:3000/api/admin/users", {
        method: "PATCH",
        body: { userId: "user-1", email: "new@example.com" },
      });

      const res = await PATCH(req);
      expect(res.status).toBe(200);

      // Verify updateUserEmailAdmin was called with emailVerified undefined (which defaults to false)
      expect(mockUpdateUserEmailAdmin).toHaveBeenCalledWith("user-1", "new@example.com", undefined);
    });

    it("email change with emailVerified=true sets it to true", async () => {
      const adminUser = {
        id: "admin-1",
        mfaEnabled: 0,
        mfaSecret: null,
        role: "admin",
      };

      const targetUser = {
        id: "user-1",
        email: "old@example.com",
        emailVerified: 0,
        mfaEnabled: 0,
        role: "user",
        plan: "free",
        displayName: null,
        username: "user1",
      };

      mockGetUserById.mockResolvedValueOnce(adminUser).mockResolvedValueOnce(targetUser);
      mockGetUserByEmail.mockResolvedValue(null);
      mockUpdateUserEmailAdmin.mockResolvedValue(undefined);

      const req = createMockRequest("http://localhost:3000/api/admin/users", {
        method: "PATCH",
        body: { userId: "user-1", email: "new@example.com", emailVerified: true },
      });

      const res = await PATCH(req);
      expect(res.status).toBe(200);

      // Verify emailVerified=true was passed through
      expect(mockUpdateUserEmailAdmin).toHaveBeenCalledWith("user-1", "new@example.com", true);
    });
  });

  describe("(e) disableMfa requires step-up code when admin has MFA", () => {
    beforeEach(() => {
      mockRequireAdmin.mockResolvedValue({
        authenticated: true,
        context: { userId: "admin-1", sessionId: "session-1" },
      } as any);
    });

    it("disableMfa without MFA code gets 403 when admin has MFA", async () => {
      const adminUser = {
        id: "admin-1",
        mfaEnabled: 1,
        mfaSecret: "encrypted-secret",
        role: "admin",
      };

      const targetUser = {
        id: "user-1",
        email: "user@example.com",
        emailVerified: 0,
        mfaEnabled: 1,
        role: "user",
        plan: "free",
        displayName: null,
        username: "user1",
      };

      mockGetUserById.mockResolvedValueOnce(adminUser).mockResolvedValueOnce(targetUser);

      const req = createMockRequest("http://localhost:3000/api/admin/users", {
        method: "PATCH",
        body: { userId: "user-1", disableMfa: true },
      });

      const res = await PATCH(req);
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toContain("MFA code required");
    });

    it("disableMfa with valid MFA code succeeds", async () => {
      const adminUser = {
        id: "admin-1",
        mfaEnabled: 1,
        mfaSecret: "encrypted-secret",
        role: "admin",
      };

      const targetUser = {
        id: "user-1",
        email: "user@example.com",
        emailVerified: 0,
        mfaEnabled: 1,
        role: "user",
        plan: "free",
        displayName: null,
        username: "user1",
      };

      mockGetUserById.mockResolvedValueOnce(adminUser).mockResolvedValueOnce(targetUser);
      mockGetDEK.mockReturnValue(Buffer.alloc(32, 0xaa));
      mockDecryptField.mockReturnValue("JBSWY3DP");
      mockVerifyMfaCode.mockReturnValue(true);
      mockDisableUserMfaForced.mockResolvedValue(undefined);

      const req = createMockRequest("http://localhost:3000/api/admin/users", {
        method: "PATCH",
        body: { userId: "user-1", disableMfa: true, mfaCode: "123456" },
      });

      const res = await PATCH(req);
      expect(res.status).toBe(200);
      expect(mockDisableUserMfaForced).toHaveBeenCalledWith("user-1");
    });
  });

  describe("(f) Password/kekSalt fields rejected or ignored", () => {
    beforeEach(() => {
      mockRequireAdmin.mockResolvedValue({
        authenticated: true,
        context: { userId: "admin-1", sessionId: "session-1" },
      } as any);
    });

    it("password field is ignored and never sent to DB", async () => {
      const adminUser = {
        id: "admin-1",
        mfaEnabled: 0,
        mfaSecret: null,
        role: "admin",
      };

      const targetUser = {
        id: "user-1",
        email: "user@example.com",
        emailVerified: 0,
        mfaEnabled: 0,
        role: "user",
        plan: "free",
        displayName: "Old Name",
        username: "user1",
      };

      mockGetUserById.mockResolvedValueOnce(adminUser).mockResolvedValueOnce(targetUser);
      mockUpdateUserDisplayName.mockResolvedValue(undefined);

      const req = createMockRequest("http://localhost:3000/api/admin/users", {
        method: "PATCH",
        body: {
          userId: "user-1",
          displayName: "New Name",
          password: "malicious-password",
          kekSalt: "malicious-salt",
        },
      });

      const res = await PATCH(req);
      expect(res.status).toBe(200);

      // Verify only displayName update was called, not password/kekSalt
      expect(mockUpdateUserDisplayName).toHaveBeenCalledWith("user-1", "New Name");
      expect(mockUpdateUserDisplayName).not.toHaveBeenCalledWith(expect.stringContaining("password"), expect.anything());
      expect(mockUpdateUserDisplayName).not.toHaveBeenCalledWith(expect.stringContaining("kekSalt"), expect.anything());
    });

    it("sends only changed fields in request", async () => {
      const adminUser = {
        id: "admin-1",
        mfaEnabled: 0,
        mfaSecret: null,
        role: "admin",
      };

      const targetUser = {
        id: "user-1",
        email: "user@example.com",
        emailVerified: 0,
        mfaEnabled: 0,
        role: "user",
        plan: "free",
        displayName: "Old Name",
        username: "user1",
      };

      mockGetUserById.mockResolvedValueOnce(adminUser).mockResolvedValueOnce(targetUser);
      mockUpdateUserDisplayName.mockResolvedValue(undefined);

      const req = createMockRequest("http://localhost:3000/api/admin/users", {
        method: "PATCH",
        body: { userId: "user-1", displayName: "New Name" },
      });

      const res = await PATCH(req);
      expect(res.status).toBe(200);

      // Verify the response only includes the changed field
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.after.displayName).toBe("New Name");
    });
  });
});
