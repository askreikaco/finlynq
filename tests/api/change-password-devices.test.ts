/**
 * POST /api/settings/change-password — Device revocation on password change.
 *
 * After a password change every trusted device EXCEPT the current browser's
 * (pf_device cookie `<uuid>.<secret>`) is revoked (owner decision, recovery B2).
 * No/garbled cookie -> all revoked. A failure in device revocation, the
 * security event, or the email must not fail the password change itself.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import crypto from "crypto";

vi.mock("@/db", () => ({
  getDialect: () => "postgres",
}));

const mockGetUserById = vi.fn();
const mockUpdateUserPasswordAndWrap = vi.fn();
const mockRevokeAllDevices = vi.fn();
const mockSendEmail = vi.fn();
const mockLogEvent = vi.fn();

vi.mock("@/lib/auth/queries", () => ({
  getUserById: (...a: unknown[]) => mockGetUserById(...a),
  updateUserPasswordAndWrap: (...a: unknown[]) =>
    mockUpdateUserPasswordAndWrap(...a),
  revokeAllDevicesExcept: (...a: unknown[]) => mockRevokeAllDevices(...a),
}));

vi.mock("@/lib/auth/trusted-device", () => ({
  parseDeviceIdFromCookie: (v: string | undefined) => {
    const p = v?.split(".");
    return p && p.length === 2 ? p[0] : undefined;
  },
}));

vi.mock("@/lib/email", () => ({
  sendEmail: (...a: unknown[]) => mockSendEmail(...a),
  passwordChangedEmail: (to: string) => ({ to, subject: "s", html: "h", text: "t" }),
}));

vi.mock("@/lib/auth/security-events", () => ({
  logSecurityEvent: (...a: unknown[]) => mockLogEvent(...a),
}));

vi.mock("@/lib/auth/require-auth", async () => {
  const actual = await vi.importActual("@/lib/auth/require-auth");
  return {
    ...(actual as object),
    requireAuth: vi.fn().mockResolvedValue({
      authenticated: true,
      context: {
        userId: "test-user-123",
        method: "passphrase" as const,
        mfaVerified: false,
        dek: Buffer.alloc(32, 0xaa),
        sessionId: "test-session-jti",
      },
    }),
  };
});

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: () => ({ allowed: true, remaining: 100, resetAt: 0 }),
}));

vi.mock("@/lib/validate", () => ({
  validateBody: (data: unknown) => ({
    error: null,
    data: {
      currentPassword: "CurrentPassword123!@#",
      newPassword: "NewPassword456!@#$%",
    },
  }),
  safeErrorMessage: (err: unknown, fallback: string) => fallback,
  logApiError: vi.fn(),
}));

vi.mock("@/lib/crypto/envelope", () => ({
  deriveKEK: () => Buffer.alloc(32, 0xbb),
  unwrapDEK: () => Buffer.alloc(32, 0xaa),
  wrapDEK: (kek: Buffer, dek: Buffer, salt: Buffer) => ({
    salt,
    wrapped: Buffer.alloc(48, 0xcc),
    iv: Buffer.alloc(12, 0xdd),
    tag: Buffer.alloc(16, 0xee),
  }),
  generateSalt: () => Buffer.alloc(16, 0xff),
  createWrappedDEKForPassword: () => ({
    wrapped: {
      salt: Buffer.alloc(16, 0xff),
      wrapped: Buffer.alloc(48, 0xcc),
      iv: Buffer.alloc(12, 0xdd),
      tag: Buffer.alloc(16, 0xee),
    },
    dek: Buffer.alloc(32, 0xaa),
  }),
}));

vi.mock("@/lib/auth", () => ({
  hashPassword: async () => "hashed-new-password",
  verifyPassword: async () => true,
}));

vi.mock("@/lib/auth/password-policy", () => ({
  validatePasswordStrength: () => null,
}));

import { POST } from "@/app/api/settings/change-password/route";
import { createMockRequest, parseResponse } from "../helpers/api-test-utils";

beforeEach(() => {
  vi.clearAllMocks();
  mockGetUserById.mockResolvedValue({
    id: "test-user-123",
    passwordHash: "hashed-old-password",
    kekSalt: Buffer.alloc(16, 0xff).toString("base64"),
    dekWrapped: Buffer.alloc(48, 0xcc).toString("base64"),
    dekWrappedIv: Buffer.alloc(12, 0xdd).toString("base64"),
    dekWrappedTag: Buffer.alloc(16, 0xee).toString("base64"),
    pepperVersion: 1,
  });
  mockUpdateUserPasswordAndWrap.mockResolvedValue(undefined);
  mockRevokeAllDevices.mockResolvedValue(undefined);
  mockSendEmail.mockResolvedValue(undefined);
  mockLogEvent.mockResolvedValue(undefined);
});

describe("POST /api/settings/change-password — Device revocation", () => {
  it("revokes all devices (no keep id) when no pf_device cookie", async () => {
    const req = createMockRequest(
      "http://localhost:3000/api/settings/change-password",
      {
        method: "POST",
        body: {
          currentPassword: "CurrentPassword123!@#",
          newPassword: "NewPassword456!@#$%",
        },
      }
    );

    const res = await POST(req);
    const { status, data } = await parseResponse(res);

    expect(status).toBe(200);
    expect(data).toMatchObject({ success: true });

    // Missing cookie -> keep nothing
    expect(mockRevokeAllDevices).toHaveBeenCalledWith("test-user-123", undefined);
  });

  it("keeps the current device (id from pf_device cookie) and revokes the rest", async () => {
    const req = createMockRequest(
      "http://localhost:3000/api/settings/change-password",
      {
        method: "POST",
        body: { currentPassword: "CurrentPassword123!@#", newPassword: "NewPassword456!@#$%" },
        headers: { cookie: "pf_device=dev-current-id.somesecret" },
      }
    );
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(mockRevokeAllDevices).toHaveBeenCalledTimes(1);
    expect(mockRevokeAllDevices).toHaveBeenCalledWith("test-user-123", "dev-current-id");
  });

  it("garbled pf_device cookie -> all revoked", async () => {
    const req = createMockRequest(
      "http://localhost:3000/api/settings/change-password",
      {
        method: "POST",
        body: { currentPassword: "CurrentPassword123!@#", newPassword: "NewPassword456!@#$%" },
        headers: { cookie: "pf_device=nodothere" },
      }
    );
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(mockRevokeAllDevices).toHaveBeenCalledWith("test-user-123", undefined);
  });

  it("sends the password-changed email only when users.email is set, and email failure does not fail", async () => {
    const mk = () => createMockRequest("http://localhost:3000/api/settings/change-password", {
      method: "POST",
      body: { currentPassword: "CurrentPassword123!@#", newPassword: "NewPassword456!@#$%" },
    });
    let res = await POST(mk());
    expect(res.status).toBe(200);
    expect(mockSendEmail).not.toHaveBeenCalled();

    mockGetUserById.mockResolvedValue({
      id: "test-user-123", email: "a@b.co", passwordHash: "h",
      kekSalt: Buffer.alloc(16, 0xff).toString("base64"),
      dekWrapped: Buffer.alloc(48, 0xcc).toString("base64"),
      dekWrappedIv: Buffer.alloc(12, 0xdd).toString("base64"),
      dekWrappedTag: Buffer.alloc(16, 0xee).toString("base64"),
      pepperVersion: 1,
    });
    res = await POST(mk());
    expect(res.status).toBe(200);
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    expect(mockLogEvent).toHaveBeenCalledWith("test-user-123", "password_changed", expect.anything());

    mockSendEmail.mockRejectedValueOnce(new Error("smtp down"));
    res = await POST(mk());
    expect(res.status).toBe(200);
  });

  it("should not fail password change if revokeAllDevicesExcept throws", async () => {
    // Make revokeAllDevices throw an error
    mockRevokeAllDevices.mockRejectedValueOnce(
      new Error("Database connection failed")
    );

    const req = createMockRequest(
      "http://localhost:3000/api/settings/change-password",
      {
        method: "POST",
        body: {
          currentPassword: "CurrentPassword123!@#",
          newPassword: "NewPassword456!@#$%",
        },
      }
    );

    const res = await POST(req);
    const { status, data } = await parseResponse(res);

    // Password change should still succeed
    expect(status).toBe(200);
    expect(data).toMatchObject({ success: true });

    // Verify updateUserPasswordAndWrap was still called
    expect(mockUpdateUserPasswordAndWrap).toHaveBeenCalledTimes(1);
  });

  it("should revoke devices even if the user has no envelope yet", async () => {
    // Simulate a pre-encryption account
    mockGetUserById.mockResolvedValue({
      id: "test-user-123",
      passwordHash: "hashed-old-password",
      kekSalt: null,
      dekWrapped: null,
      dekWrappedIv: null,
      dekWrappedTag: null,
      pepperVersion: 1,
    });

    const req = createMockRequest(
      "http://localhost:3000/api/settings/change-password",
      {
        method: "POST",
        body: {
          currentPassword: "CurrentPassword123!@#",
          newPassword: "NewPassword456!@#$%",
        },
      }
    );

    const res = await POST(req);
    const { status, data } = await parseResponse(res);

    expect(status).toBe(200);
    expect(data).toMatchObject({ success: true });

    // Verify devices were revoked even for pre-encryption accounts
    expect(mockRevokeAllDevices).toHaveBeenCalledWith("test-user-123", undefined);
  });
});
