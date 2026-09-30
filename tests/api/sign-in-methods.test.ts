/**
 * Tests for sign-in-methods endpoints:
 * - GET /api/settings/sign-in-methods
 * - DELETE /api/settings/sign-in-methods/google
 * - DELETE /api/settings/devices
 *
 * Covers:
 * a) GET requires auth, returns identities and devices scoped to user
 * b) DELETE google with wrong password → 401, deleteIdentities not called
 * c) DELETE google with correct password → 200, deleteIdentities called
 * d) DELETE devices?id= → revokeDevice called
 * e) DELETE devices?all=1 → revokeAllDevices called, pf_device cleared
 * f) Unauthorized requests return 401
 * g) No secret_hash in response
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

process.env.PF_JWT_SECRET = "test-jwt-secret-for-vitest-32chars!!";
process.env.DEPLOY_GENERATION = "0";

vi.mock("@/lib/auth/require-auth", () => ({
  requireAuth: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  verifyPassword: vi.fn(),
}));

vi.mock("@/lib/auth/queries", () => ({
  listIdentities: vi.fn(),
  listDevices: vi.fn(),
  getUserById: vi.fn(),
  deleteIdentities: vi.fn(),
  revokeDevice: vi.fn(),
  revokeAllDevices: vi.fn(),
}));

vi.mock("@/lib/auth/trusted-device", () => ({
  deviceCookieOptions: () => ({
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/auth",
  }),
}));

import { GET as getSignInMethods } from "@/app/api/settings/sign-in-methods/route";
import { DELETE as deleteGoogle } from "@/app/api/settings/sign-in-methods/google/route";
import { DELETE as deleteDevice } from "@/app/api/settings/devices/route";
import * as requireAuth from "@/lib/auth/require-auth";
import * as auth from "@/lib/auth";
import * as queries from "@/lib/auth/queries";

const mockRequireAuth = vi.mocked(requireAuth.requireAuth);
const mockVerifyPassword = vi.mocked(auth.verifyPassword);
const mockListIdentities = vi.mocked(queries.listIdentities);
const mockListDevices = vi.mocked(queries.listDevices);
const mockGetUserById = vi.mocked(queries.getUserById);
const mockDeleteIdentities = vi.mocked(queries.deleteIdentities);
const mockRevokeDevice = vi.mocked(queries.revokeDevice);
const mockRevokeAllDevices = vi.mocked(queries.revokeAllDevices);

describe("GET /api/settings/sign-in-methods", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("requires authentication", async () => {
    const mockResponse = new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    mockRequireAuth.mockResolvedValue({
      authenticated: false,
      response: mockResponse,
      context: {}
    } as any);

    const url = new URL("http://localhost:3000/api/settings/sign-in-methods");
    const req = new NextRequest(url, { method: "GET" });

    const res = await getSignInMethods(req);
    expect(res).toBe(mockResponse);
  });

  it("returns sign-in methods and devices for authenticated user", async () => {
    mockRequireAuth.mockResolvedValue({
      authenticated: true,
      context: { userId: "user_123" },
    } as any);

    const now = new Date().toISOString();
    const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    mockListIdentities.mockResolvedValue([
      {
        id: "identity_1",
        userId: "user_123",
        provider: "google",
        providerSubject: "google_sub_123",
        email: "user@example.com",
        emailVerified: 1,
        createdAt: now,
        lastLoginAt: now,
      },
    ] as any);

    mockListDevices.mockResolvedValue([
      {
        id: "device_1",
        userId: "user_123",
        secretHash: "hash",
        dekWrapped: "wrapped",
        label: "My Device",
        createdAt: now,
        lastUsedAt: now,
        expiresAt: futureDate,
        revokedAt: null,
      },
    ] as any);

    const url = new URL("http://localhost:3000/api/settings/sign-in-methods");
    const req = new NextRequest(url, {
      method: "GET",
      headers: { cookie: "pf_device=device_1.secret" },
    });

    const res = await getSignInMethods(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.google.linked).toBe(true);
    expect(data.google.email).toBe("user@example.com");
    expect(data.hasPassword).toBe(true);
    expect(data.devices).toHaveLength(1);
    expect(data.devices[0].id).toBe("device_1");
    expect(data.devices[0].label).toBe("My Device");
    expect(data.devices[0].current).toBe(true);
    // Ensure no secret_hash in response
    expect(data.devices[0].secretHash).toBeUndefined();
  });

  it("excludes revoked and expired devices", async () => {
    mockRequireAuth.mockResolvedValue({
      authenticated: true,
      context: { userId: "user_123" },
    } as any);

    const now = new Date().toISOString();
    const pastDate = new Date(Date.now() - 1 * 60 * 1000).toISOString(); // 1 min ago

    mockListIdentities.mockResolvedValue([] as any);
    mockListDevices.mockResolvedValue([
      {
        id: "device_1",
        userId: "user_123",
        secretHash: "hash",
        dekWrapped: "wrapped",
        label: "Active",
        createdAt: now,
        lastUsedAt: now,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        revokedAt: null,
      },
      {
        id: "device_2",
        userId: "user_123",
        secretHash: "hash",
        dekWrapped: "wrapped",
        label: "Revoked",
        createdAt: now,
        lastUsedAt: now,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        revokedAt: now,
      },
      {
        id: "device_3",
        userId: "user_123",
        secretHash: "hash",
        dekWrapped: "wrapped",
        label: "Expired",
        createdAt: now,
        lastUsedAt: now,
        expiresAt: pastDate,
        revokedAt: null,
      },
    ] as any);

    const url = new URL("http://localhost:3000/api/settings/sign-in-methods");
    const req = new NextRequest(url, { method: "GET" });

    const res = await getSignInMethods(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.devices).toHaveLength(1);
    expect(data.devices[0].id).toBe("device_1");
  });
});

describe("DELETE /api/settings/sign-in-methods/google", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("requires authentication", async () => {
    const mockResponse = new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    mockRequireAuth.mockResolvedValue({
      authenticated: false,
      response: mockResponse,
      context: {}
    } as any);

    const url = new URL("http://localhost:3000/api/settings/sign-in-methods/google");
    const req = new NextRequest(url, { method: "DELETE", body: JSON.stringify({ password: "test" }) });

    const res = await deleteGoogle(req);
    expect(res).toBe(mockResponse);
  });

  it("returns 401 for wrong password without calling deleteIdentities", async () => {
    mockRequireAuth.mockResolvedValue({
      authenticated: true,
      context: { userId: "user_123" },
    } as any);

    mockGetUserById.mockResolvedValue({
      id: "user_123",
      passwordHash: "hashed_password",
    } as any);

    mockVerifyPassword.mockResolvedValue(false);

    const url = new URL("http://localhost:3000/api/settings/sign-in-methods/google");
    const req = new NextRequest(url, {
      method: "DELETE",
      body: JSON.stringify({ password: "wrong_password" }),
    });

    const res = await deleteGoogle(req);
    const data = await res.json();

    expect(res.status).toBe(401);
    expect(data.error).toBe("Invalid password");
    expect(mockDeleteIdentities).not.toHaveBeenCalled();
  });

  it("deletes Google identity with correct password", async () => {
    mockRequireAuth.mockResolvedValue({
      authenticated: true,
      context: { userId: "user_123" },
    } as any);

    mockGetUserById.mockResolvedValue({
      id: "user_123",
      passwordHash: "hashed_password",
    } as any);

    mockVerifyPassword.mockResolvedValue(true);
    mockDeleteIdentities.mockResolvedValue(undefined as any);

    const url = new URL("http://localhost:3000/api/settings/sign-in-methods/google");
    const req = new NextRequest(url, {
      method: "DELETE",
      body: JSON.stringify({ password: "correct_password" }),
    });

    const res = await deleteGoogle(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(mockDeleteIdentities).toHaveBeenCalledWith("user_123", "google");
  });

  it("returns 400 for missing password", async () => {
    mockRequireAuth.mockResolvedValue({
      authenticated: true,
      context: { userId: "user_123" },
    } as any);

    const url = new URL("http://localhost:3000/api/settings/sign-in-methods/google");
    const req = new NextRequest(url, {
      method: "DELETE",
      body: JSON.stringify({}),
    });

    const res = await deleteGoogle(req);
    const data = await res.json();

    expect(res.status).toBe(400);
  });
});

describe("DELETE /api/settings/devices", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("requires authentication", async () => {
    const mockResponse = new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    mockRequireAuth.mockResolvedValue({
      authenticated: false,
      response: mockResponse,
      context: {}
    } as any);

    const url = new URL("http://localhost:3000/api/settings/devices?id=device_1");
    const req = new NextRequest(url, { method: "DELETE" });

    const res = await deleteDevice(req);
    expect(res).toBe(mockResponse);
  });

  it("revokes single device with id parameter", async () => {
    mockRequireAuth.mockResolvedValue({
      authenticated: true,
      context: { userId: "user_123" },
    } as any);

    mockRevokeDevice.mockResolvedValue(undefined as any);

    const url = new URL("http://localhost:3000/api/settings/devices?id=device_1");
    const req = new NextRequest(url, { method: "DELETE" });

    const res = await deleteDevice(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(mockRevokeDevice).toHaveBeenCalledWith("user_123", "device_1");
  });

  it("revokes all devices with all=1 parameter and clears pf_device cookie", async () => {
    mockRequireAuth.mockResolvedValue({
      authenticated: true,
      context: { userId: "user_123" },
    } as any);

    mockRevokeAllDevices.mockResolvedValue(undefined as any);

    const url = new URL("http://localhost:3000/api/settings/devices?all=1");
    const req = new NextRequest(url, { method: "DELETE" });

    const res = await deleteDevice(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(mockRevokeAllDevices).toHaveBeenCalledWith("user_123");
    expect(res.cookies.get("pf_device")?.value).toBe("");
  });

  it("returns 400 when neither id nor all is provided", async () => {
    mockRequireAuth.mockResolvedValue({
      authenticated: true,
      context: { userId: "user_123" },
    } as any);

    const url = new URL("http://localhost:3000/api/settings/devices");
    const req = new NextRequest(url, { method: "DELETE" });

    const res = await deleteDevice(req);
    const data = await res.json();

    expect(res.status).toBe(400);
  });
});
