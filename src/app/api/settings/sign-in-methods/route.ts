/**
 * GET /api/settings/sign-in-methods (requireAuth)
 *
 * Returns sign-in methods and devices for the current user.
 *
 * Response: {
 *   google: {linked:boolean, email?:string, linkedAt?:string, lastLoginAt?:string|null},
 *   hasPassword: true,
 *   devices: [{id, label, createdAt, lastUsedAt, expiresAt, current:boolean}]
 * }
 *
 * Devices are filtered to exclude revoked or expired entries.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/require-auth";
import { listIdentities, listDevices } from "@/lib/auth/queries";
import { parseDeviceIdsFromCookie } from "@/lib/auth/trusted-device";

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth.authenticated) return auth.response;

  const userId = auth.context.userId!;

  // Get identities for the user
  const identities = await listIdentities(userId);
  const googleIdentity = identities.find((id) => id.provider === "google");

  // Get devices for the user
  const allDevices = await listDevices(userId);
  const now = new Date();
  const cookieDeviceIds = new Set(parseDeviceIdsFromCookie(request.cookies.get("pf_device")?.value));

  // Filter to non-revoked, non-expired devices
  const devices = allDevices
    .filter((d) => !d.revokedAt && d.expiresAt && new Date(d.expiresAt) > now)
    .map((d) => ({
      id: d.id,
      label: d.label || "Unknown device",
      createdAt: d.createdAt,
      lastUsedAt: d.lastUsedAt,
      expiresAt: d.expiresAt,
      // current = this user's device id is an entry in the pf_device list
      current: cookieDeviceIds.has(d.id),
    }));

  // Build response
  const response: Record<string, unknown> = {
    google: {
      linked: !!googleIdentity,
      ...(googleIdentity && {
        email: googleIdentity.email,
        linkedAt: googleIdentity.createdAt,
        lastLoginAt: googleIdentity.lastLoginAt,
      }),
    },
    hasPassword: true, // Google users always set a password at register
    devices,
  };

  return NextResponse.json(response);
}
