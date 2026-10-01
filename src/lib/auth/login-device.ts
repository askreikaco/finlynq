/**
 * Trusted-device policy at login completion (password login, mfa/verify,
 * mfa/recovery/verify). Never throws: a device failure must not fail a login.
 *
 * trustDevice !== false -> issue a fresh pf_device (replacing this browser's
 *   existing one if it belongs to the user) and set the cookie.
 * trustDevice === false ("shared computer") -> issue nothing, revoke this
 *   browser's existing device (user-scoped) and clear the cookie.
 */
import type { NextRequest, NextResponse } from "next/server";
import { logApiError } from "@/lib/validate";
import { issueDevice, revokeDevice, deviceCookieOptions } from "@/lib/auth/trusted-device";

/** Device id from a `<id>.<secret>` pf_device cookie value. */
function deviceIdFromCookie(value: string | undefined): string | undefined {
  const parts = value?.split(".");
  return parts && parts.length === 2 && parts[0] ? parts[0] : undefined;
}

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
    const existingId = deviceIdFromCookie(request.cookies.get("pf_device")?.value);
    const o = deviceCookieOptions();
    if (trustDevice === false) {
      if (existingId) await revokeDevice(userId, existingId);
      response.cookies.set("pf_device", "", {
        httpOnly: o.httpOnly,
        secure: o.secure,
        sameSite: o.sameSite,
        maxAge: 0,
        path: o.path,
      });
      return;
    }
    if (opts.alreadyIssued || !dek) return;
    const issued = await issueDevice(
      userId,
      dek,
      request.headers.get("user-agent") || undefined,
      existingId
    );
    if (issued) {
      response.cookies.set("pf_device", issued.cookieValue, {
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
