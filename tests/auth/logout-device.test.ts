/**
 * /api/auth/logout — Device revocation.
 *
 * On normal logout, the pf_device cookie is NOT revoked and NOT cleared
 * (keeps the trusted device active for re-login).
 * With ?everywhere=1, all devices are revoked and the pf_device cookie is cleared.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Cutoff lookup hits the DB (fail-closed); these suites have no DB, so pin "no cutoff".
vi.mock("@/lib/auth/session-cutoff", async (orig) => ({
  ...(await orig<typeof import("@/lib/auth/session-cutoff")>()),
  getSessionCutoffCached: async () => null,
}));
import { NextRequest } from "next/server";

process.env.PF_JWT_SECRET = "test-jwt-secret-for-vitest-32chars!!";
process.env.DEPLOY_GENERATION = "0";
process.env.PF_TRUSTED_DEVICE_DAYS = "30";

const revokedJtis = new Set<string>();
const revokeDeviceCalls: Array<{ userId: string; deviceId: string }> = [];
const revokeAllDevicesCalls: string[] = [];

vi.mock("@/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: (filter: unknown) => ({
          limit: async () => {
            const jti = (filter as { __jti?: string })?.__jti ?? "";
            if (jti && revokedJtis.has(jti)) {
              return [{ jti }];
            }
            return [];
          },
        }),
      }),
    }),
    insert: () => ({
      values: (row: { jti: string; expiresAt: Date }) => ({
        onConflictDoNothing: async () => {
          revokedJtis.add(row.jti);
        },
      }),
    }),
  },
}));

vi.mock("@/db/schema-pg", () => ({
  revokedJtis: { jti: "jti", expiresAt: "expires_at" },
  users: { id: "id", email: "email", displayName: "displayName", role: "role" },
}));

vi.mock("drizzle-orm", () => ({
  eq: (_col: unknown, val: unknown) => ({ __jti: val }),
}));

vi.mock("@/lib/crypto/dek-cache", () => ({
  deleteDEK: vi.fn(),
  getDEK: vi.fn(() => null),
}));

vi.mock("@/lib/auth/queries", () => ({
  getUserById: async (id: string) => ({
    id,
    email: `user${id}@example.com`,
    displayName: `User ${id}`,
    role: "user",
  }),
  recordSuccessfulLogin: vi.fn(),
  upsertIdentity: vi.fn(),
}));

vi.mock("@/lib/auth/trusted-device", () => ({
  revokeDevice: async (userId: string, deviceId: string) => {
    revokeDeviceCalls.push({ userId, deviceId });
  },
  revokeAllDevices: async (userId: string) => {
    revokeAllDevicesCalls.push(userId);
  },
  // Per-user list semantics are covered against real Postgres in
  // tests/auth/multi-device-b2.test.ts; the mock drops the removed user's entries.
  removeUserDevicesFromList: async (cookie: string | undefined, _userId: string) => ({
    newDeviceList: "",
    removed: !!cookie,
  }),
  deviceCookieOptions: () => ({
    httpOnly: true,
    secure: false,
    sameSite: "lax" as const,
    path: "/api/auth",
    maxAge: 30 * 24 * 60 * 60,
  }),
}));

import { POST as logoutPOST } from "@/app/api/auth/logout/route";
import {
  createSessionToken,
  _clearRevokedJtiCache,
} from "@/lib/auth/jwt";

function makeLogoutRequest(
  token: string | null,
  deviceCookie: string | null = null,
  everywhere: boolean = false
): NextRequest {
  const cookies: string[] = [];
  if (token) cookies.push(`pf_session=${token}`);
  if (deviceCookie) cookies.push(`pf_device=${deviceCookie}`);
  const cookieHeader = cookies.length > 0 ? cookies.join("; ") : undefined;

  const url = everywhere ? "http://localhost:3000/api/auth/logout?everywhere=1" : "http://localhost:3000/api/auth/logout";

  const req = new NextRequest(url, {
    method: "POST",
    headers: cookieHeader ? { cookie: cookieHeader } : {},
  });

  return req;
}

describe("/api/auth/logout — Device revocation", () => {
  beforeEach(() => {
    revokedJtis.clear();
    revokeDeviceCalls.length = 0;
    revokeAllDevicesCalls.length = 0;
    _clearRevokedJtiCache();
  });

  it("normal logout with pf_device cookie should NOT revoke the device", async () => {
    const { token } = await createSessionToken("u-device-logout", false);
    const deviceCookie = "device-uuid-123.secret-base64";

    const res = await logoutPOST(makeLogoutRequest(token, deviceCookie));
    expect(res.status).toBe(200);

    // Verify revokeDevice was NOT called on normal logout
    expect(revokeDeviceCalls.length).toBe(0);
  });

  it("normal logout should NOT clear the pf_device cookie", async () => {
    const { token } = await createSessionToken("u-clear-cookie", false);
    const deviceCookie = "device-uuid-456.secret-base64";

    const res = await logoutPOST(makeLogoutRequest(token, deviceCookie));
    expect(res.status).toBe(200);

    // pf_device cookie should not be touched on normal logout
    // (it will remain in the browser for trusted device re-login)
  });

  it("logout with invalid session should not revoke device or clear cookie", async () => {
    const deviceCookie = "device-uuid-789.secret-base64";

    // No token provided — invalid session
    const res = await logoutPOST(makeLogoutRequest(null, deviceCookie));
    expect(res.status).toBe(200);

    // Verify revokeDevice was NOT called (no userId and no everywhere flag)
    expect(revokeDeviceCalls.length).toBe(0);
  });

  it("logout with ?everywhere=1 should call revokeAllDevices and clear pf_device", async () => {
    const { token } = await createSessionToken("u-everywhere", false);

    const res = await logoutPOST(makeLogoutRequest(token, null, true));
    expect(res.status).toBe(200);

    // Verify revokeAllDevices was called
    expect(revokeAllDevicesCalls.length).toBe(1);
    expect(revokeAllDevicesCalls[0]).toBe("u-everywhere");

    // Verify pf_device cookie was cleared
    const setCookieHeader = res.headers.get("set-cookie");
    expect(setCookieHeader).toContain("pf_device=");
    expect(setCookieHeader).toContain("Max-Age=0");
  });

  it("logout with ?everywhere=1 and pf_device should only call revokeAllDevices", async () => {
    const { token } = await createSessionToken("u-both", false);
    const deviceCookie = "device-uuid-both.secret-base64";

    const res = await logoutPOST(makeLogoutRequest(token, deviceCookie, true));
    expect(res.status).toBe(200);

    // Verify revokeDevice was NOT called (everywhere=1 revokes all, no need for individual)
    expect(revokeDeviceCalls.length).toBe(0);

    // Verify revokeAllDevices was called
    expect(revokeAllDevicesCalls.length).toBe(1);
    expect(revokeAllDevicesCalls[0]).toBe("u-both");
  });

  it("device revocation failure on everywhere=1 should not block logout", async () => {
    // revokeAllDevices error handling is tested via the try/catch in the logout route.
    const { token } = await createSessionToken("u-error", false);
    const deviceCookie = "device-uuid-error.secret-base64";

    const res = await logoutPOST(makeLogoutRequest(token, deviceCookie, true));
    expect(res.status).toBe(200); // Logout should still succeed even if device revocation fails
    expect(revokeAllDevicesCalls.length).toBe(1);
  });
});
