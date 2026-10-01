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
 * - If user has MFA (TOTP) enabled, proof is REQUIRED
 * - proof can be TOTP code (6 digits) or recovery code (24 chars)
 * - If proof is required but missing: 401 { code: "proof-required" }
 *   WITHOUT rotating the device (state must not change on auth failures)
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
import { peekDevice, redeemDeviceWithoutRotate, parseDeviceIdFromCookie } from "@/lib/auth/trusted-device";
import { getUserById } from "@/lib/auth/queries";
import { decryptField } from "@/lib/crypto/envelope";
import { verifyMfaCode } from "@/lib/auth/mfa";
import { normalizeRecoveryCode, hashRecoveryCode, unwrapDEKWithRecoveryCode } from "@/lib/auth/recovery-codes";
import { consumeRecoveryCode } from "@/lib/auth/queries";
import { finalizeRecoveryReset } from "@/lib/auth/recovery";
import { commitSession } from "@/lib/auth/session-bundle";
import { logSecurityEvent } from "@/lib/auth/security-events";
import crypto from "crypto";

const resetSchema = z.object({
  newPassword: z.string().min(1),
  proof: z
    .object({
      type: z.enum(["totp", "code"]),
      value: z.string().min(1),
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
    if (!deviceCookie) {
      return fail();
    }

    const deviceId = parseDeviceIdFromCookie(deviceCookie);
    if (!deviceId) {
      return fail();
    }

    // Rate limit per device
    const deviceRateLimit = checkRateLimit(`recovery-device-reset-device:${deviceId}`, 5, 60 * 60_000);
    if (!deviceRateLimit.allowed) {
      return NextResponse.json(
        { error: "Too many attempts. Please try again later." },
        { status: 429 }
      );
    }

    // Peek at the device to get userId without consuming/rotating yet
    const peeked = await peekDevice(deviceCookie);
    if (!peeked.valid) {
      return fail();
    }

    const userId = peeked.userId;
    const user = await getUserById(userId);
    if (!user) {
      return fail();
    }

    // Get the DEK without rotating yet (we need to verify proof first)
    const redeemNoRotate = await redeemDeviceWithoutRotate(deviceCookie, userId);
    if (!redeemNoRotate) {
      return fail();
    }

    const { dek: deviceDek } = redeemNoRotate;

    // Check if MFA is required
    let proofValid = false;
    if (user.mfaEnabled) {
      // MFA is required; verify the proof
      if (!proof) {
        // No proof provided but MFA is required
        logSecurityEvent(userId, "recovery_proof_failed", { method: "device", ip, userAgent }).catch(() => {});
        return NextResponse.json(
          { error: "MFA proof required", code: "proof-required" },
          { status: 401 }
        );
      }

      // Verify the proof
      if (proof.type === "totp") {
        // Decrypt TOTP secret and verify code
        if (!user.mfaSecret) {
          return fail();
        }

        let decryptedSecret: string | null;
        try {
          decryptedSecret = decryptField(deviceDek, user.mfaSecret);
        } catch {
          return fail();
        }

        if (!decryptedSecret || !verifyMfaCode(decryptedSecret, proof.value)) {
          logSecurityEvent(userId, "recovery_proof_failed", { method: "device", ip, userAgent }).catch(() => {});
          return fail();
        }

        proofValid = true;
      } else if (proof.type === "code") {
        // Verify recovery code
        let canonicalCode: string;
        try {
          canonicalCode = `pfrc1:${normalizeRecoveryCode(proof.value)}`;
        } catch {
          return fail();
        }

        const dekWrapped = await consumeRecoveryCode(userId, hashRecoveryCode(canonicalCode));
        if (!dekWrapped) {
          logSecurityEvent(userId, "recovery_proof_failed", { method: "device", ip, userAgent }).catch(() => {});
          return fail();
        }

        let recoveredDek: Buffer;
        try {
          recoveredDek = unwrapDEKWithRecoveryCode(dekWrapped, canonicalCode);
        } catch {
          return fail();
        }

        // Verify that recovered DEK matches device DEK
        if (
          recoveredDek.length !== deviceDek.length ||
          !crypto.timingSafeEqual(recoveredDek, deviceDek)
        ) {
          return fail();
        }

        proofValid = true;
      }
    } else {
      // No MFA required; proof is not needed
      proofValid = true;
    }

    if (!proofValid) {
      return fail();
    }

    // All checks passed; now finalize the reset
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

    // Set the new device cookie (from finalizeRecoveryReset's device rotation)
    if (result.deviceCookieValue) {
      response.cookies.set("pf_device", result.deviceCookieValue, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: result.maxAgeSeconds,
        path: "/api/auth",
      });
    }

    return response;
  } catch (error) {
    await logApiError("POST", "/api/auth/recovery/device/reset", error);
    return fail();
  }
}
