/**
 * PATCH /api/admin/users (edit user) — route-level security tests.
 * Real zod schema / validateBody (not mocked). DB helpers, auth and MFA are
 * mocked at the module boundary; the DB-level guard + uniqueness semantics are
 * covered in admin-users-edit-queries.test.ts.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

process.env.PF_JWT_SECRET = "test-jwt-secret-for-vitest-32chars!!";
process.env.DEPLOY_GENERATION = "0";

vi.mock("@/db", () => ({ getDialect: vi.fn(() => "postgres") }));

const mockGetUserById = vi.fn();
const mockApply = vi.fn();
const mockCountPasskeys = vi.fn();
vi.mock("@/lib/auth/queries", () => ({
  getUserById: (...a: unknown[]) => mockGetUserById(...a),
  applyAdminUserEdit: (...a: unknown[]) => mockApply(...a),
  listUsersPage: vi.fn(),
  isUserSortKey: vi.fn(),
  countPasskeys: (...a: unknown[]) => mockCountPasskeys(...a),
}));

const mockRequireAdmin = vi.fn();
vi.mock("@/lib/auth/require-admin", () => ({
  requireAdmin: (...a: unknown[]) => mockRequireAdmin(...a),
}));

const mockLog = vi.fn();
vi.mock("@/lib/admin-audit", () => ({
  logAdminAction: (...a: unknown[]) => mockLog(...a),
  clientIp: () => "127.0.0.1",
}));

const mockGetDEK = vi.fn();
vi.mock("@/lib/crypto/dek-cache", () => ({ getDEK: (...a: unknown[]) => mockGetDEK(...a) }));
vi.mock("@/lib/crypto/envelope", () => ({ decryptField: () => "TOTP-SECRET" }));
const mockVerify = vi.fn();
vi.mock("@/lib/auth", () => ({ verifyMfaCode: (...a: unknown[]) => mockVerify(...a) }));

import { PATCH } from "@/app/api/admin/users/route";
import { createMockRequest } from "../helpers/api-test-utils";

const ADMIN = { id: "admin-1", role: "admin", mfaEnabled: 0, mfaSecret: null };
const TARGET = {
  id: "user-1", role: "user", plan: "free", planExpiresAt: null,
  displayName: "Old Name", username: "olduser", email: "old@example.com",
  emailVerified: 1, mfaEnabled: 1,
};

function asAdmin(overrides: Record<string, unknown> = {}, ctx: Record<string, unknown> = {}) {
  mockRequireAdmin.mockResolvedValue({
    authenticated: true,
    context: { userId: "admin-1", sessionId: "sess-1", method: "account", ...ctx },
  });
  mockGetUserById.mockImplementation(async (id: string) =>
    id === "admin-1" ? { ...ADMIN, ...overrides } : id === "user-1" ? TARGET : null
  );
}
const patch = (body: unknown) =>
  PATCH(createMockRequest("http://localhost:3000/api/admin/users", { method: "PATCH", body }));

beforeEach(() => {
  vi.resetAllMocks();
  mockApply.mockResolvedValue({ ok: true });
  mockGetDEK.mockReturnValue(Buffer.alloc(32));
  mockVerify.mockReturnValue(true);
});

describe("auth gates", () => {
  it("non-admin gets 403 and nothing is written", async () => {
    mockRequireAdmin.mockResolvedValue({
      authenticated: false,
      response: new Response(JSON.stringify({ error: "Admin access required." }), { status: 403 }),
    });
    const res = await patch({ userId: "user-1", displayName: "X" });
    expect(res.status).toBe(403);
    expect(mockApply).not.toHaveBeenCalled();
  });

  it("API-key auth is rejected with 403 (session-only route)", async () => {
    asAdmin({}, { method: "api_key" });
    const res = await patch({ userId: "user-1", displayName: "X" });
    expect(res.status).toBe(403);
    expect(mockApply).not.toHaveBeenCalled();
  });
});

describe("strict schema", () => {
  it.each([
    ["password", { password: "hunter2" }],
    ["kekSalt", { kekSalt: "AAAA" }],
    ["dekWrapped", { dekWrapped: "AAAA", dekWrappedIv: "x", dekWrappedTag: "y" }],
    ["passwordHash", { passwordHash: "x" }],
    ["mfaSecret", { mfaSecret: "x" }],
  ])("unknown key %s is a 400 and never reaches an update", async (_n, extra) => {
    asAdmin();
    const res = await patch({ userId: "user-1", displayName: "Fine", ...extra });
    expect(res.status).toBe(400);
    expect(mockApply).not.toHaveBeenCalled();
  });

  it("rejects malformed username, email and mfaCode", async () => {
    asAdmin();
    for (const bad of [{ username: "Has Space" }, { email: "nope" }, { mfaCode: "12ab56" }]) {
      expect((await patch({ userId: "user-1", ...bad })).status).toBe(400);
    }
    expect(mockApply).not.toHaveBeenCalled();
  });
});

describe("uniqueness (DB-enforced, case-insensitive)", () => {
  it("23505 on the email index maps to 409 Email", async () => {
    asAdmin();
    mockApply.mockRejectedValue({ code: "23505", constraint: "users_email_lower_unique" });
    const res = await patch({ userId: "user-1", email: "Taken@Example.com", mfaCode: "123456" });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/email/i);
  });

  it("23505 wrapped by Drizzle (.cause) on the username index maps to 409 Username", async () => {
    asAdmin();
    mockApply.mockRejectedValue(
      Object.assign(new Error("Failed query"), {
        cause: { code: "23505", constraint: "users_username_lower_unique" },
      })
    );
    const res = await patch({ userId: "user-1", username: "taken" });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/username/i);
  });

  it("non-unique DB errors stay 500", async () => {
    asAdmin();
    mockApply.mockRejectedValue(new Error("boom"));
    expect((await patch({ userId: "user-1", displayName: "X" })).status).toBe(500);
  });

  it("email is normalised to lowercase before it reaches the DB", async () => {
    asAdmin();
    await patch({ userId: "user-1", email: "  MiXed@Example.COM " });
    expect(mockApply.mock.calls[0][1].email).toBe("mixed@example.com");
  });
});

describe("last-admin guard", () => {
  it("guard refusal from the DB layer maps to 409", async () => {
    asAdmin();
    mockApply.mockResolvedValue({ ok: false, reason: "last_admin" });
    const res = await patch({ userId: "user-1", role: "user" });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/last admin/i);
    expect(mockLog).not.toHaveBeenCalled();
  });
});

describe("step-up (admin has MFA)", () => {
  beforeEach(() => asAdmin({ mfaEnabled: 1, mfaSecret: "enc" }));

  it("role change without mfaCode -> 403 MFA_REQUIRED", async () => {
    const res = await patch({ userId: "user-1", role: "admin" });
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("MFA_REQUIRED");
    expect(mockApply).not.toHaveBeenCalled();
  });

  it("email change without mfaCode -> 403", async () => {
    expect((await patch({ userId: "user-1", email: "new@example.com" })).status).toBe(403);
  });

  it("admin cannot reset their OWN 2FA without step-up", async () => {
    mockGetUserById.mockImplementation(async (id: string) => ({ ...ADMIN, id, mfaEnabled: 1, mfaSecret: "enc" }));
    const res = await patch({ userId: "admin-1", disableMfa: true });
    expect(res.status).toBe(403);
    expect(mockApply).not.toHaveBeenCalled();
  });

  it("wrong code -> 401, nothing written", async () => {
    mockVerify.mockReturnValue(false);
    const res = await patch({ userId: "user-1", disableMfa: true, mfaCode: "000000" });
    expect(res.status).toBe(401);
    expect(mockApply).not.toHaveBeenCalled();
  });

  it("MFA flag on but secret missing fails closed", async () => {
    asAdmin({ mfaEnabled: 1, mfaSecret: null });
    const res = await patch({ userId: "user-1", disableMfa: true, mfaCode: "123456" });
    expect(res.status).toBe(401);
    expect(mockApply).not.toHaveBeenCalled();
  });

  it("no live session DEK -> 423", async () => {
    mockGetDEK.mockReturnValue(null);
    expect((await patch({ userId: "user-1", role: "admin", mfaCode: "123456" })).status).toBe(423);
  });

  it("non-sensitive edits (displayName, plan) need no step-up", async () => {
    expect((await patch({ userId: "user-1", displayName: "New", plan: "pro" })).status).toBe(200);
  });

  it("same role value is not a role change", async () => {
    expect((await patch({ userId: "user-1", role: "user" })).status).toBe(200);
  });
});

describe("disableMfa", () => {
  it("clears MFA and revokes the target's sessions (other user)", async () => {
    asAdmin();
    const res = await patch({ userId: "user-1", disableMfa: true });
    expect(res.status).toBe(200);
    expect(mockApply).toHaveBeenCalledWith("user-1", expect.objectContaining({ disableMfa: true, revokeSessions: true }));
  });

  it("self reset does not revoke the acting admin's own session", async () => {
    asAdmin({ mfaEnabled: 1, mfaSecret: "enc" });
    mockGetUserById.mockImplementation(async (id: string) => ({ ...ADMIN, id, mfaEnabled: 1, mfaSecret: "enc" }));
    await patch({ userId: "admin-1", disableMfa: true, mfaCode: "123456" });
    expect(mockApply).toHaveBeenCalledWith("admin-1", expect.objectContaining({ disableMfa: true, revokeSessions: false }));
  });
});

describe("disableMfa for passkey-only targets", () => {
  it("target with a passkey but no TOTP: reset is applied (passkeys are removed by applyAdminUserEdit)", async () => {
    asAdmin();
    mockGetUserById.mockImplementation(async (id: string) =>
      id === "admin-1" ? ADMIN : id === "user-1" ? { ...TARGET, mfaEnabled: 0 } : null);
    // The passkey belongs to the TARGET only; the acting admin has none (B7: a passkey-only
    // admin would need a passkey step-up, covered in recovery-b7-security.test.ts).
    mockCountPasskeys.mockImplementation(async (id: string) => (id === "user-1" ? 1 : 0));
    const res = await patch({ userId: "user-1", disableMfa: true });
    expect(res.status).toBe(200);
    expect(mockApply).toHaveBeenCalledWith("user-1", expect.objectContaining({ disableMfa: true, revokeSessions: true }));
  });

  it("target with neither TOTP nor passkey: disableMfa is a no-op flag (false)", async () => {
    asAdmin();
    mockGetUserById.mockImplementation(async (id: string) =>
      id === "admin-1" ? ADMIN : id === "user-1" ? { ...TARGET, mfaEnabled: 0 } : null);
    mockCountPasskeys.mockResolvedValue(0);
    await patch({ userId: "user-1", disableMfa: true });
    expect(mockApply).toHaveBeenCalledWith("user-1", expect.objectContaining({ disableMfa: false }));
  });
});

describe("email / emailVerified", () => {
  it("emailVerified without an email change is still applied", async () => {
    asAdmin();
    await patch({ userId: "user-1", emailVerified: false });
    expect(mockApply.mock.calls[0][1]).toMatchObject({ emailVerified: false });
  });

  it("email change reports emailVerified reset in the response", async () => {
    asAdmin();
    const res = await patch({ userId: "user-1", email: "new@example.com" });
    expect((await res.json()).after.emailVerified).toBe(0);
  });
});

describe("audit entries carry no PII values", () => {
  it("logs field names only for username/email/displayName/mfa", async () => {
    asAdmin();
    await patch({
      userId: "user-1", username: "newuser", email: "new@example.com",
      displayName: "Brand New Name", disableMfa: true,
    });
    const dump = JSON.stringify(mockLog.mock.calls);
    for (const pii of ["newuser", "new@example.com", "Brand New Name", "olduser", "old@example.com", "Old Name"]) {
      expect(dump).not.toContain(pii);
    }
    const call = mockLog.mock.calls.find((c) => c[0].action === "user_profile_change")![0];
    expect(call.after.fields).toEqual(expect.arrayContaining(["username", "email", "displayName", "emailVerified", "mfaDisabled"]));
  });
});

describe("admin editing themselves", () => {
  it("self-demotion succeeds (if not last) and flags selfDemoted", async () => {
    asAdmin();
    mockGetUserById.mockImplementation(async (id: string) => ({ ...ADMIN, id, role: "admin" }));
    const res = await patch({ userId: "admin-1", role: "user" });
    expect(res.status).toBe(200);
    expect((await res.json()).selfDemoted).toBe(true);
  });

  it("demoting someone else does not flag selfDemoted", async () => {
    asAdmin();
    mockGetUserById.mockImplementation(async (id: string) => (id === "admin-1" ? ADMIN : { ...TARGET, role: "admin" }));
    const res = await patch({ userId: "user-1", role: "user" });
    expect((await res.json()).selfDemoted).toBe(false);
  });
});

it("404 for an unknown target", async () => {
  asAdmin();
  expect((await patch({ userId: "ghost", displayName: "X" })).status).toBe(404);
});
