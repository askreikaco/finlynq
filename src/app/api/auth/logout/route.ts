/**
 * POST /api/auth/logout — Sign out (managed edition).
 *
 * Default: revoke the ACTIVE account only (denylist its jti + wipe its DEK) and
 * promote the next still-switchable stashed account to active; the last
 * account out clears everything. ?all=1: revoke every jti in the bundle,
 * wipe every DEK, clear both cookies.
 * ?everywhere=1: also revoke trusted devices (active user; every bundle
 * user with all=1) and remove ONLY those users' entries from the pf_device
 * list (other accounts' entries on this browser survive; the cookie is
 * cleared when none remain). pf_device is otherwise kept.
 * Response: {success:true, activeUserId|null}. Never returns tokens.
 */

import { NextRequest, NextResponse } from "next/server";
import { revokeAllDevices, removeUserDevicesFromList, deviceCookieOptions } from "@/lib/auth/trusted-device";
import { logoutBundle } from "@/lib/auth/session-bundle";

export async function POST(request: NextRequest) {
  const url = new URL(request.url);
  const all = url.searchParams.get("all") === "1";
  const everywhere = url.searchParams.get("everywhere") === "1";

  const response = NextResponse.json({ success: true, activeUserId: null as string | null });
  const { activeUserId, revoked, loggedOut } = await logoutBundle(request, response, { all });

  if (everywhere) {
    // all=1 -> every user in the bundle; otherwise the account being signed out.
    const users = new Set(all ? revoked.map((m) => m.userId) : loggedOut ? [loggedOut.userId] : []);
    for (const userId of users) {
      try {
        await revokeAllDevices(userId);
      } catch {
        // swallow — device revocation must not block logout
      }
    }
    const current = request.cookies.get("pf_device")?.value;
    if (!current) {
      response.cookies.set("pf_device", "", { ...deviceCookieOptions(), maxAge: 0 });
    } else if (users.size > 0) {
      try {
        let list: string | undefined = current;
        for (const userId of users) {
          list = (await removeUserDevicesFromList(list, userId)).newDeviceList;
        }
        const o = deviceCookieOptions();
        response.cookies.set("pf_device", list ?? "", { ...o, maxAge: list ? o.maxAge : 0 });
      } catch {
        // fail closed: drop the whole cookie
        response.cookies.set("pf_device", "", { ...deviceCookieOptions(), maxAge: 0 });
      }
    }
  }

  // Rebuild body now that the outcome is known (cookies already on `response`).
  const out = NextResponse.json({ success: true, activeUserId });
  for (const c of response.cookies.getAll()) out.cookies.set(c);
  return out;
}
