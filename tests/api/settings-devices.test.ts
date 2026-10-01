/**
 * Tests for DELETE /api/settings/devices
 *
 * Covers:
 * a) revokeDevice returns 0 (device not found or not owned by user) → 404
 * b) revokeDevice returns 1 (success) → 200 {ok:true}
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockRequireAuth = vi.fn();
const mockRevokeDevice = vi.fn();
const mockRevokeAllDevices = vi.fn();

vi.mock("@/lib/auth/require-auth", () => ({
  requireAuth: (...args: any[]) => mockRequireAuth(...args),
}));

vi.mock("@/lib/auth/queries", () => ({
  revokeDevice: (...args: any[]) => mockRevokeDevice(...args),
  revokeAllDevices: (...args: any[]) => mockRevokeAllDevices(...args),
}));

vi.mock("@/lib/auth/trusted-device", () => ({
  deviceCookieOptions: () => ({
    httpOnly: true,
    secure: false,
    sameSite: "lax" as const,
    path: "/api/auth",
    maxAge: 30 * 24 * 60 * 60,
  }),
}));

import { DELETE } from "@/app/api/settings/devices/route";

function makeDevicesRequest(opts: { query?: string; auth?: any } = {}): NextRequest {
  const url = new URL(`http://localhost:3000/api/settings/devices${opts.query || ""}`);
  return new NextRequest(url, {
    method: "DELETE",
  });
}

describe("DELETE /api/settings/devices", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuth.mockResolvedValue({
      authenticated: true,
      response: null,
      context: {
        userId: "test-user-123",
        method: "account",
      },
    });
    mockRevokeDevice.mockResolvedValue(0);
    mockRevokeAllDevices.mockResolvedValue(undefined);
  });

  describe("(a) revokeDevice returns 0 → 404", () => {
    it("returns 404 Device not found", async () => {
      mockRevokeDevice.mockResolvedValue(0);

      const req = makeDevicesRequest({ query: "?id=device-123" });
      const res = await DELETE(req);

      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.error).toBe("Device not found");
    });
  });

  describe("(b) revokeDevice returns 1 → 200", () => {
    it("returns 200 ok:true", async () => {
      mockRevokeDevice.mockResolvedValue(1);

      const req = makeDevicesRequest({ query: "?id=device-123" });
      const res = await DELETE(req);

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.ok).toBe(true);
    });
  });

  it("calls revokeDevice with userId and deviceId", async () => {
    mockRevokeDevice.mockResolvedValue(1);

    const req = makeDevicesRequest({ query: "?id=device-456" });
    await DELETE(req);

    expect(mockRevokeDevice).toHaveBeenCalledWith("test-user-123", "device-456");
  });

  it("revoke all with all=1", async () => {
    const req = makeDevicesRequest({ query: "?all=1" });
    const res = await DELETE(req);

    expect(res.status).toBe(200);
    expect(mockRevokeAllDevices).toHaveBeenCalledWith("test-user-123");
  });

  it("rejects unauthenticated requests", async () => {
    mockRequireAuth.mockResolvedValue({
      authenticated: false,
      response: new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 }),
    });

    const req = makeDevicesRequest({ query: "?id=device-123" });
    const res = await DELETE(req);

    expect(res.status).toBe(401);
  });

  it("rejects non-session auth (API key)", async () => {
    mockRequireAuth.mockResolvedValue({
      authenticated: true,
      response: null,
      context: {
        userId: "test-user-123",
        method: "apikey", // Not "account" (session)
      },
    });

    const req = makeDevicesRequest({ query: "?id=device-123" });
    const res = await DELETE(req);

    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toBe("Session required");
  });
});
