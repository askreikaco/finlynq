/**
 * Trusted-device policy at login completion (password login, mfa/verify,
 * mfa/recovery/verify). Never throws: a device failure must not fail a login.
 *
 * trustDevice !== false -> issue a fresh pf_device entry for this user
 *   (replacing any existing device for this user in the list) and update
 *   the cookie. Other users' devices are preserved.
 * trustDevice === false ("shared computer") -> issue nothing, revoke this
 *   user's devices, and remove their entries from the cookie.
 */
import type { NextRequest, NextResponse } from "next/server";
import { logApiError } from "@/lib/validate";
import {
  issueDevice,
  revokeAllDevices,
  deviceCookieOptions,
  removeUserDevicesFromList,
} from "@/lib/auth/trusted-device";

export async function applyTrustedDevicePolicy(opts: {
  request: NextRequest;
  response: NextResponse;
  userId: string;
  dek: Buffer | null;
  trustDevice: boolean;
  /** Device already issued earlier in this request (google link) — cookie set by caller. */
  alreadyIssued?: boolean;
  routeLabel: string;
}): Promise<void> {
  const { request, response, userId, dek, trustDevice, routeLabel } = opts;
  try {
    const currentDeviceCookie = request.cookies.get("pf_device")?.value;
    const o = deviceCookieOptions();

    if (trustDevice === false) {
      // Shared computer: revoke this user's devices and remove from list
      await revokeAllDevices(userId);
      const { newDeviceList, removed } = await removeUserDevicesFromList(currentDeviceCookie, userId);
      if (removed || currentDeviceCookie) {
        // Update or clear the cookie
        if (newDeviceList) {
          response.cookies.set("pf_device", newDeviceList, {
            httpOnly: o.httpOnly,
            secure: o.secure,
            sameSite: o.sameSite,
            maxAge: o.maxAge,
            path: o.path,
          });
        } else {
          response.cookies.set("pf_device", "", {
            httpOnly: o.httpOnly,
            secure: o.secure,
            sameSite: o.sameSite,
            maxAge: 0,
            path: o.path,
          });
        }
      }
      return;
    }

    if (opts.alreadyIssued || !dek) return;

    const issued = await issueDevice(userId, dek, currentDeviceCookie, request.headers.get("user-agent") || undefined);
    if (issued) {
      response.cookies.set("pf_device", issued.newDeviceEntry, {
        httpOnly: o.httpOnly,
        secure: o.secure,
        sameSite: o.sameSite,
        maxAge: issued.maxAgeSeconds,
        path: o.path,
      });
    }
  } catch (err) {
    await logApiError("POST", `${routeLabel} (device)`, err, userId);
  }
}
