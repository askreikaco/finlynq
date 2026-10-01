/**
 * POST /api/auth/logout — Clear the session (managed edition).
 *
 * Default (?all unset): revoke active session + DEK, remove from bundle,
 * promote the next stashed account to active (if any). Return {activeUserId|null}.
 *
 * ?all=1: revoke ALL jtis in bundle + DEKs, clear both cookies, return {activeUserId:null}.
 *
 * ?everywhere=1: when combined with (or without) ?all, also revoke all trusted
 * devices for the user(s) being logged out.
 *
 * Wipes DEKs from in-memory cache and inserts jtis into the server-side
 * `revoked_jtis` denylist so stolen cookies can't access after logout (finding H-5).
 *
 * Keeps pf_device cookie on normal logout (trusted device survives); clears on
 * ?everywhere=1.
 */

import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE, revokeJti } from "@/lib/auth";
import { deleteDEK } from "@/lib/crypto/dek-cache";
import { revokeAllDevices, deviceCookieOptions } from "@/lib/auth/trusted-device";
import { readBundle, removeAccount } from "@/lib/auth/session-bundle";

export async function POST(request: NextRequest) {
  const url = new URL(request.url);
  const logoutAll = url.searchParams.get("all") === "1";
  const everywhere = url.searchParams.get("everywhere") === "1";

  // Read the bundle to get all tokens
  const { active, stash } = await readBundle(request);

  let activeUserId: string | null = null;

  if (logoutAll) {
    // Revoke all jtis in the bundle (active + all stash entries)
    if (active?.jti) {
      const exp = new Date(Date.now() + 24 * 60 * 60_000);
      try {
        await revokeJti(active.jti, exp);
      } catch {
        // swallow
      }
      deleteDEK(active.jti);

      // If ?everywhere, revoke all devices for this user
      if (everywhere && active.userId) {
        try {
          await revokeAllDevices(active.userId);
        } catch {
          // swallow
        }
      }
    }

    for (const entry of stash) {
      if (entry.jti) {
        const exp = new Date(Date.now() + 24 * 60 * 60_000);
        try {
          await revokeJti(entry.jti, exp);
        } catch {
          // swallow
        }
        deleteDEK(entry.jti);

        // If ?everywhere, revoke all devices for this user
        if (everywhere) {
          try {
            await revokeAllDevices(entry.userId);
          } catch {
            // swallow
          }
        }
      }
    }

    // Clear both cookies
    const response = NextResponse.json({ activeUserId: null });
    response.cookies.set(AUTH_COOKIE, "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 0,
      path: "/",
    });
    response.cookies.set("pf_accounts", "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/api/auth",
      maxAge: 0,
    });

    // If ?everywhere, also clear pf_device
    if (everywhere) {
      response.cookies.set("pf_device", "", {
        ...deviceCookieOptions(),
        maxAge: 0,
      });
    }

    return response;
  } else {
    // Default: revoke only the active session, promote next from stash
    if (active?.jti) {
      const exp = new Date(Date.now() + 24 * 60 * 60_000);
      try {
        await revokeJti(active.jti, exp);
      } catch {
        // swallow
      }
      deleteDEK(active.jti);

      // If ?everywhere, revoke this user's devices
      if (everywhere) {
        try {
          await revokeAllDevices(active.userId);
        } catch {
          // swallow
        }
      }
    }

    const response = NextResponse.json({ activeUserId });

    // Remove the active user from the bundle (promotes next stashed)
    await removeAccount(request, response, active?.userId || "");

    // If ?everywhere, clear pf_device
    if (everywhere) {
      response.cookies.set("pf_device", "", {
        ...deviceCookieOptions(),
        maxAge: 0,
      });
    }

    // Read the bundle again to get the new active user
    const { active: newActive } = await readBundle(request);
    if (newActive?.userId) {
      activeUserId = newActive.userId;
      // Update response body with new active user
      return NextResponse.json({ activeUserId });
    }

    return response;
  }
}
