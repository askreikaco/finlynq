/**
 * Trusted-device policy at login completion (password login, mfa/verify,
 * mfa/recovery/verify). Never throws: a device failure must not fail a login.
 *
 * pf_device is a per-user list (multi-account). Only THIS user's entry is
 * ever touched; other accounts' entries on this browser survive.
 *
 * trustDevice !== false -> issue a fresh entry for this user (replacing this
 *   user's existing entry) and set the merged cookie.
 * trustDevice === false ("shared computer") -> issue nothing, revoke and
 *   remove only this user's entry in this browser's cookie; the cookie is
 *   cleared only when no other verified entry remains.
 */
import type { NextRequest, NextResponse } from "next/server";
import { logApiError } from "@/lib/validate";
import {
  issueDevice,
  removeUserDevicesFromList,
  deviceCookieOptions,
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
    const current = request.cookies.get("pf_device")?.value;
    const o = deviceCookieOptions();
    if (trustDevice === false) {
      if (current) {
        const { newDeviceList } = await removeUserDevicesFromList(current, userId, { revoke: true });
        response.cookies.set("pf_device", newDeviceList, {
          httpOnly: o.httpOnly,
          secure: o.secure,
          sameSite: o.sameSite,
          maxAge: newDeviceList ? o.maxAge : 0,
          path: o.path,
        });
      }
      return;
    }
    if (opts.alreadyIssued || !dek) return;
    const issued = await issueDevice(
      userId,
      dek,
      request.headers.get("user-agent") || undefined,
      undefined,
      current
    );
    if (issued) {
      response.cookies.set("pf_device", issued.cookieList, {
        httpOnly: o.httpOnly,
        secure: o.secure,
        sameSite: o.sameSite,
        maxAge: o.maxAge,
        path: o.path,
      });
    }
  } catch (err) {
    await logApiError("POST", `${routeLabel} (device)`, err, userId);
  }
}
