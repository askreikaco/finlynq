/**
 * DELETE /api/settings/devices (requireAuth)
 *
 * Revokes a device or all devices for the current user.
 *
 * Query params:
 * - id=<deviceId> → revoke single device, returns 404 if not found or not owned by user
 * - all=1 → revoke all of this user's devices and drop this user's entries from
 *   pf_device (other accounts' entries on this browser are kept)
 *
 * Response: 200 {ok:true} | 404 {error:"Device not found"}
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/require-auth";
import { revokeDevice, revokeAllDevices } from "@/lib/auth/queries";
import { deviceCookieOptions, removeUserDevicesFromList } from "@/lib/auth/trusted-device";

export async function DELETE(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth.authenticated) return auth.response;

  const userId = auth.context.userId!;

  // Session required (reject API-key auth)
  if (auth.context.method !== "account") {
    return NextResponse.json({ error: "Session required" }, { status: 403 });
  }

  const url = new URL(request.url);
  const deviceId = url.searchParams.get("id");
  const revokeAll = url.searchParams.get("all") === "1";

  try {
    if (revokeAll) {
      // Revoke all devices
      await revokeAllDevices(userId);

      // Drop only this user's entries from pf_device
      const response = NextResponse.json({ ok: true });
      const current = request.cookies.get("pf_device")?.value;
      const o = deviceCookieOptions();
      const newDeviceList = current
        ? (await removeUserDevicesFromList(current, userId)).newDeviceList
        : "";
      response.cookies.set("pf_device", newDeviceList, {
        ...o,
        maxAge: newDeviceList ? o.maxAge : 0,
      });
      return response;
    } else if (deviceId) {
      // Revoke single device
      const rowCount = await revokeDevice(userId, deviceId);
      if (rowCount === 0) {
        return NextResponse.json({ error: "Device not found" }, { status: 404 });
      }
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
