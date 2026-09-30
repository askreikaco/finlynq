/**
 * DELETE /api/settings/devices (requireAuth)
 *
 * Revokes a device or all devices for the current user.
 *
 * Query params:
 * - id=<deviceId> → revoke single device
 * - all=1 → revoke all devices and clear pf_device cookie
 *
 * Response: 200 {ok:true} | 404 {error:"Device not found"}
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/require-auth";
import { revokeDevice, revokeAllDevices } from "@/lib/auth/queries";
import { deviceCookieOptions } from "@/lib/auth/trusted-device";

export async function DELETE(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth.authenticated) return auth.response;

  const userId = auth.context.userId!;
  const url = new URL(request.url);
  const deviceId = url.searchParams.get("id");
  const revokeAll = url.searchParams.get("all") === "1";

  try {
    if (revokeAll) {
      // Revoke all devices
      await revokeAllDevices(userId);

      // Clear pf_device cookie
      const response = NextResponse.json({ ok: true });
      response.cookies.set("pf_device", "", {
        ...deviceCookieOptions(),
        maxAge: 0,
      });
      return response;
    } else if (deviceId) {
      // Revoke single device
      await revokeDevice(userId, deviceId);
      return NextResponse.json({ ok: true });
    } else {
      return NextResponse.json(
        { error: "Missing id or all parameter" },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error("Error revoking device:", error);
    return NextResponse.json(
      { error: "Server error" },
      { status: 500 }
    );
  }
}
