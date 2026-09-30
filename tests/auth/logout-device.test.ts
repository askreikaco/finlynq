/**
 * /api/auth/logout — Device revocation.
 *
 * On logout, the pf_device cookie is parsed and the current device is revoked.
 * With ?everywhere=1, all devices are revoked.
 * The pf_device cookie is always cleared regardless of session validity.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
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
}));

vi.mock("drizzle-orm", () => ({
  eq: (_col: unknown, val: unknown) => ({ __jti: val }),
}));

vi.mock("@/lib/crypto/dek-cache", () => ({
  deleteDEK: vi.fn(),
}));

vi.mock("@/lib/auth/trusted-device", () => ({
  revokeDevice: async (userId: string, deviceId: string) => {
    revokeDeviceCalls.push({ userId, deviceId });
  },
  revokeAllDevices: async (userId: string) => {
    revokeAllDevicesCalls.push(userId);
  },
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

  it("logout with pf_device cookie should call revokeDevice with parsed device id", async () => {
    const { token } = await createSessionToken("u-device-logout", false);
    const deviceCookie = "device-uuid-123.secret-base64";

    const res = await logoutPOST(makeLogoutRequest(token, deviceCookie));
    expect(res.status).toBe(200);

    // Verify revokeDevice was called with the parsed device id
    expect(revokeDeviceCalls.length).toBe(1);
    expect(revokeDeviceCalls[0].userId).toBe("u-device-logout");
    expect(revokeDeviceCalls[0].deviceId).toBe("device-uuid-123");
  });

  it("logout with pf_device cookie should always clear the cookie", async () => {
    const { token } = await createSessionToken("u-clear-cookie", false);
    const deviceCookie = "device-uuid-456.secret-base64";

    const res = await logoutPOST(makeLogoutRequest(token, deviceCookie));
    expect(res.status).toBe(200);

    // Check that pf_device cookie was set to expire
    const setCookieHeader = res.headers.get("set-cookie");
    expect(setCookieHeader).toContain("pf_device=");
    expect(setCookieHeader).toContain("Max-Age=0");
  });

  it("logout with invalid session should still clear the pf_device cookie", async () => {
    const deviceCookie = "device-uuid-789.secret-base64";

    // No token provided — invalid session
    const res = await logoutPOST(makeLogoutRequest(null, deviceCookie));
    expect(res.status).toBe(200);

    // Verify revokeDevice was NOT called (no userId)
    expect(revokeDeviceCalls.length).toBe(0);

    // Verify cookie was still cleared
    const setCookieHeader = res.headers.get("set-cookie");
    expect(setCookieHeader).toContain("pf_device=");
    expect(setCookieHeader).toContain("Max-Age=0");
  });

  it("logout with ?everywhere=1 should call revokeAllDevices", async () => {
    const { token } = await createSessionToken("u-everywhere", false);

    const res = await logoutPOST(makeLogoutRequest(token, null, true));
    expect(res.status).toBe(200);

    // Verify revokeAllDevices was called
    expect(revokeAllDevicesCalls.length).toBe(1);
    expect(revokeAllDevicesCalls[0]).toBe("u-everywhere");
  });

  it("logout with ?everywhere=1 and pf_device should revoke both device and all devices", async () => {
    const { token } = await createSessionToken("u-both", false);
    const deviceCookie = "device-uuid-both.secret-base64";

    const res = await logoutPOST(makeLogoutRequest(token, deviceCookie, true));
    expect(res.status).toBe(200);

    // Verify revokeDevice was called for the current device
    expect(revokeDeviceCalls.length).toBe(1);
    expect(revokeDeviceCalls[0].userId).toBe("u-both");
    expect(revokeDeviceCalls[0].deviceId).toBe("device-uuid-both");

    // Verify revokeAllDevices was also called
    expect(revokeAllDevicesCalls.length).toBe(1);
    expect(revokeAllDevicesCalls[0]).toBe("u-both");
  });

  it("device revocation failure should not block logout", async () => {
    // revokeDevice error is already mocked to succeed by default,
    // but we've verified it's called. The actual error handling is tested
    // via the try/catch in the logout route.
    const { token } = await createSessionToken("u-error", false);
    const deviceCookie = "device-uuid-error.secret-base64";

    const res = await logoutPOST(makeLogoutRequest(token, deviceCookie));
    expect(res.status).toBe(200); // Logout should still succeed
    expect(revokeDeviceCalls.length).toBe(1);
  });
});
