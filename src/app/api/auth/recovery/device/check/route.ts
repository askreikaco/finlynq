/**
 * POST /api/auth/recovery/device/check — Check if a trusted device can reset the password.
 *
 * Pre-auth check: returns whether the pf_device cookie holds a valid trusted device,
 * and if so, what additional proof is required (TOTP or recovery code).
 *
 * Rate limits: per-IP 20/15min
 *
 * Generic response: no enumeration of device/email validity. Invalid device
 * returns { available: false }. With valid device entries it also returns
 * accounts: [{ deviceId, account (masked), label, available, needs, reason? }]
 * for VALID entries only (secret verified), so a browser with several accounts
 * can pick one; the pick is sent to device/reset as `deviceId`.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { validateBody, logApiError } from "@/lib/validate";
import { checkRateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/client-ip";
import { listValidDevices } from "@/lib/auth/trusted-device";
import { maskIdentity } from "@/lib/auth/mask-identity";
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

    // Every VALID entry (secret verified) is a candidate account; an entry
    // that fails verification contributes nothing, so the response reveals
    // nothing without a valid device secret.
    const valid = await listValidDevices(deviceCookie);
    if (valid.length === 0) {
      return NextResponse.json({ available: false });
    }

    const { getUserById } = await import("@/lib/auth/queries");
    const accounts: Array<{
      deviceId: string;
      account: string;
      label: string | null;
      available: boolean;
      needs: "totp" | "code" | null;
      reason?: "setup_required";
    }> = [];
    for (const d of valid) {
      const user = await getUserById(d.userId);
      if (!user) continue;
      // Proof needed: TOTP when enabled, else an unused recovery code; neither = setup_required.
      let needs: "totp" | "code" | null = null;
      if (user.mfaEnabled && user.mfaSecret) needs = "totp";
      else if ((await countUnusedRecoveryCodes(d.userId)) > 0) needs = "code";
      accounts.push({
        deviceId: d.deviceId,
        account: maskIdentity(user.email as string | null, user.username as string | null),
        label: d.label,
        available: needs !== null,
        needs,
        ...(needs === null ? { reason: "setup_required" as const } : {}),
      });
    }
    if (accounts.length === 0) return NextResponse.json({ available: false });

    // Top-level fields describe the first entry (single-account callers).
    const first = accounts[0];
    if (!first.available) {
      return NextResponse.json({ available: false, reason: "setup_required", accounts });
    }
    return NextResponse.json({ available: true, label: first.label, needs: first.needs, accounts });
  } catch (error) {
    await logApiError("POST", "/api/auth/recovery/device/check", error);
    return fail();
  }
}
