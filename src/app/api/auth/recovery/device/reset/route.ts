/**
 * POST /api/auth/recovery/device/reset — Reset password using a trusted device + proof.
 *
 * Pre-auth recovery flow. Accepts:
 * - pf_device cookie: trusted device with wrapped DEK
 * - proof: { type: "totp" | "code", value: string } or undefined
 * - newPassword: new password (must pass validatePasswordStrength)
 *
 * Gates:
 * - Device must be valid (not expired, not revoked, secret matches)
 * - Proof is ALWAYS required (plan 1.4): TOTP (only if the user has TOTP) or an
 *   unused recovery code (burned). User with neither -> generic 400.
 * - Missing proof: 401 { code: "proof-required" }. Only reachable AFTER the
 *   device secret verified (peekDevice), so it is not an oracle without possession.
 *   No state change on any failure.
 *
 * Rate limits: per-IP 5/15min; per-device 5/h
 *
 * Success:
 * - Calls finalizeRecoveryReset with unwrapped DEK
 * - Rotates the device (new secret, extended expiry)
 * - Sets session via commitSession
 * - Returns { success: true }
 *
 * Generic 400 on any other failure.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { validateBody, logApiError } from "@/lib/validate";
import { checkRateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/client-ip";
import { peekDevice, redeemDeviceWithoutRotate, deviceCookieOptions } from "@/lib/auth/trusted-device";
import { getUserById } from "@/lib/auth/queries";
import { decryptField } from "@/lib/crypto/envelope";
import { verifyMfaCode } from "@/lib/auth/mfa";
import { normalizeRecoveryCode, hashRecoveryCode, unwrapDEKWithRecoveryCode } from "@/lib/auth/recovery-codes";
import { consumeRecoveryCode, countUnusedRecoveryCodes } from "@/lib/auth/queries";
import { validatePasswordStrength } from "@/lib/auth/password-policy";
import { finalizeRecoveryReset } from "@/lib/auth/recovery";
import { commitSession } from "@/lib/auth/session-bundle";
import { logSecurityEvent } from "@/lib/auth/security-events";
import crypto from "crypto";

const resetSchema = z.object({
  newPassword: z.string().min(1).max(256),
  proof: z
    .object({
      type: z.enum(["totp", "code"]),
      value: z.string().min(1).max(100),
    })
    .optional(),
});

const GENERIC_FAIL = "Recovery failed. Check your details and try again.";
const fail = () => NextResponse.json({ error: GENERIC_FAIL }, { status: 400 });

export async function POST(request: NextRequest) {
  const ip = clientIp(request);
  const rateLimit = checkRateLimit(`recovery-device-reset:${ip}`, 5, 15 * 60_000);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many attempts. Please try again later." },
      { status: 429 }
    );
  }

  const userAgent = request.headers.get("user-agent") ?? undefined;

  try {
    const parsed = validateBody(await request.json(), resetSchema);
    if (parsed.error) return fail();

    const { newPassword, proof } = parsed.data;
    const deviceCookie = request.cookies.get("pf_device")?.value;
    if (!deviceCookie) return fail();

    // Possession check FIRST (id + secret hash, read-only). Everything below,
    // including the 401 proof-required and the per-device limiter, is only
    // reachable with a valid device secret, so none of it is an oracle.
    const peeked = await peekDevice(deviceCookie);
    if (!peeked.valid) return fail();

    const deviceRateLimit = checkRateLimit(`recovery-device-reset-device:${peeked.deviceId}`, 5, 60 * 60_000);
    if (!deviceRateLimit.allowed) {
      return NextResponse.json(
        { error: "Too many attempts. Please try again later." },
        { status: 429 }
      );
    }

    const userId = peeked.userId;
    const user = await getUserById(userId);
    if (!user) return fail();

    // Must not burn a code on a password that will be rejected.
    if (validatePasswordStrength(newPassword)) return fail();

    const hasTotp = !!(user.mfaEnabled && user.mfaSecret);
    const hasCodes = (await countUnusedRecoveryCodes(userId)) > 0;
    if (!hasTotp && !hasCodes) {
      // Device alone is never enough and there is nothing to prove with.
      return fail();
    }

    if (!proof) {
      return NextResponse.json(
        { error: "Additional proof required", code: "proof-required" },
        { status: 401 }
      );
    }

    const redeemed = await redeemDeviceWithoutRotate(deviceCookie, userId);
    if (!redeemed) return fail();
    const deviceDek = redeemed.dek;

    const proofFailed = () => {
      logSecurityEvent(userId, "recovery_proof_failed", { method: "device", ip, userAgent }).catch(() => {});
      return fail();
    };

    if (proof.type === "totp") {
      if (!hasTotp || !user.mfaSecret) return proofFailed();
      let decryptedSecret: string | null;
      try {
        decryptedSecret = decryptField(deviceDek, user.mfaSecret);
      } catch {
        return fail();
      }
      if (!decryptedSecret || !verifyMfaCode(decryptedSecret, proof.value)) return proofFailed();
    } else {
      let canonicalCode: string;
      try {
        canonicalCode = `pfrc1:${normalizeRecoveryCode(proof.value)}`;
      } catch {
        return proofFailed();
      }
      // Burns the code atomically (single use).
      const dekWrapped = await consumeRecoveryCode(userId, hashRecoveryCode(canonicalCode));
      if (!dekWrapped) return proofFailed();
      let recoveredDek: Buffer;
      try {
        recoveredDek = unwrapDEKWithRecoveryCode(dekWrapped, canonicalCode);
      } catch {
        return proofFailed();
      }
      if (
        recoveredDek.length !== deviceDek.length ||
        !crypto.timingSafeEqual(recoveredDek, deviceDek)
      ) {
        return proofFailed();
      }
    }

    const result = await finalizeRecoveryReset({
      userId,
      newPassword,
      dek: deviceDek,
      keepDeviceId: peeked.deviceId,
      trustDevice: true,
      userAgent,
      ip,
      method: "device",
    });

    const response = NextResponse.json({ success: true });
    await commitSession(request, response, { token: result.token, jti: result.jti, userId });

    if (result.deviceCookieValue) {
      response.cookies.set("pf_device", result.deviceCookieValue, {
        ...deviceCookieOptions(),
        maxAge: result.maxAgeSeconds ?? deviceCookieOptions().maxAge,
      });
    }

    return response;
  } catch (error) {
    await logApiError("POST", "/api/auth/recovery/device/reset", error);
    return fail();
  }
}
