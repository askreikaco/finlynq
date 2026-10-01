/**
 * POST /api/auth/recovery/device/check — Check if a trusted device can reset the password.
 *
 * Pre-auth check: returns whether the pf_device cookie holds a valid trusted device,
 * and if so, what additional proof is required (TOTP or recovery code).
 *
 * Rate limits: per-IP 20/15min
 *
 * Generic response: no enumeration of device/email validity. Invalid device
 * returns { available: false, reason?: "setup_required" | "device_unavailable" }.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { validateBody, logApiError } from "@/lib/validate";
import { checkRateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/client-ip";
import { peekDevice } from "@/lib/auth/trusted-device";
import { countUnusedRecoveryCodes } from "@/lib/auth/queries";

const checkSchema = z.object({});

const GENERIC_FAIL = "Recovery failed. Check your details and try again.";
const fail = () => NextResponse.json({ error: GENERIC_FAIL }, { status: 400 });

export async function POST(request: NextRequest) {
  const ip = clientIp(request);
  const rateLimit = checkRateLimit(`recovery-device-check:${ip}`, 20, 15 * 60_000);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many attempts. Please try again later." },
      { status: 429 }
    );
  }

  try {
    const parsed = validateBody(await request.json(), checkSchema);
    if (parsed.error) return fail();

    const deviceCookie = request.cookies.get("pf_device")?.value;
    if (!deviceCookie) {
      return NextResponse.json({ available: false });
    }

    const peeked = await peekDevice(deviceCookie);
    if (!peeked.valid) {
      return NextResponse.json({ available: false });
    }

    const { userId, label } = peeked;

    // Check what proof is needed: TOTP or recovery code
    // (User must have at least one to use device recovery)
    const user = await import("@/lib/auth/queries").then(m =>
      m.getUserById(userId)
    );
    if (!user) {
      return NextResponse.json({ available: false });
    }

    let proofNeeded: "totp" | "code" | null = null;

    // Check if user has TOTP enabled
    if (user.mfaEnabled && user.mfaSecret) {
      proofNeeded = "totp";
    } else {
      // Check if user has recovery codes
      const unusedCodes = await countUnusedRecoveryCodes(userId);
      if (unusedCodes > 0) {
        proofNeeded = "code";
      }
    }

    if (proofNeeded === null) {
      // User has neither TOTP nor recovery codes
      return NextResponse.json({
        available: false,
        reason: "setup_required",
      });
    }

    return NextResponse.json({
      available: true,
      label,
      needs: proofNeeded,
    });
  } catch (error) {
    await logApiError("POST", "/api/auth/recovery/device/check", error);
    return fail();
  }
}
