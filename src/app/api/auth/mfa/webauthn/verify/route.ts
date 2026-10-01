/**
 * POST /api/auth/mfa/webauthn/verify — passkey as 2FA, step 2.
 *
 * Body: { mfaPendingToken?, token, response, trustDevice? }.
 *  - pending JWT verified in-route (must be pending; revoked on success).
 *  - "passkey-2fa" token must be bound to the same user AND pending jti and is
 *    consumed atomically before the assertion is verified.
 *  - The credential must exist AND belong to the pending user.
 *  - UV required, origin/rpID from server config, counter regression rejected
 *    (+ security event) and the counter advanced by compare-and-set.
 * Success mirrors mfa/verify: full session (mfa=true) through commitSession,
 * DEK promoted from the pending jti, pending jti revoked, trusted-device
 * policy applied, pf_unlock cleared. Failure is a uniform 400.
 *
 * CSRF: NOT in middleware CSRF_BYPASS_PATHS (same as mfa/verify).
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createSessionToken, revokeJti } from "@/lib/auth";
import { SESSION_TTL_MS, verifyShortLived } from "@/lib/auth/jwt";
import {
  getUserById,
  getPasskey,
  recordSuccessfulLogin,
  advancePasskeyCounter,
  upsertIdentity,
} from "@/lib/auth/queries";
import { validateBody, logApiError } from "@/lib/validate";
import { checkRateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/client-ip";
import { getDEK, putDEK, deleteDEK } from "@/lib/crypto/dek-cache";
import { issueDevice, deviceCookieOptions } from "@/lib/auth/trusted-device";
import { commitSession } from "@/lib/auth/session-bundle";
import { applyTrustedDevicePolicy } from "@/lib/auth/login-device";
import { logSecurityEvent } from "@/lib/auth/security-events";
import { resolvePendingMfa } from "@/lib/auth/pending-mfa";
import { verifyPasskeyAssertion } from "@/lib/auth/webauthn";
import { authenticationResponseSchema, challengeTokenSchema } from "@/lib/auth/webauthn-schemas";
import { enqueueBackfillSecurities } from "@/lib/securities/backfill";
import { enqueueUpgradeStagingEncryption } from "@/lib/email-import/upgrade-staging-encryption";
import { enqueueProcessPendingInbox } from "@/lib/email-import/process-pending-inbox";
import { enqueueUpgradeUserFieldEncryption } from "@/lib/crypto/upgrade-user-fields";

export const dynamic = "force-dynamic";

const MAX_ATTEMPTS_PER_PENDING = 5;

const bodySchema = z.object({
  mfaPendingToken: z.string().min(1).max(4096).optional(),
  token: challengeTokenSchema,
  response: authenticationResponseSchema,
  trustDevice: z.boolean().optional().default(true),
});

const GENERIC_FAIL = { error: "Passkey verification failed." };
const fail = () => NextResponse.json(GENERIC_FAIL, { status: 400 });

export async function POST(request: NextRequest) {
  const ip = clientIp(request);
  const userAgent = request.headers.get("user-agent") ?? undefined;
  if (!checkRateLimit(`mfa-webauthn:${ip}`, 10, 15 * 60_000).allowed) {
    return NextResponse.json({ error: "Too many verification attempts. Please try again later." }, { status: 429 });
  }
  try {
    const parsed = validateBody(await request.json().catch(() => null), bodySchema);
    if (parsed.error) return fail();
    const { token, response, trustDevice } = parsed.data;

    const pending = await resolvePendingMfa(request, parsed.data.mfaPendingToken);
    if (!pending) {
      return NextResponse.json(
        { error: "Invalid or expired pending token. Please log in again." },
        { status: 401 }
      );
    }
    const pendingJti = pending.jti;
    const exp = pending.exp > 0 ? new Date(pending.exp * 1000) : new Date(Date.now() + 5 * 60_000);

    // Lifetime cap per password-correct login attempt; exhausted = token dead.
    if (!checkRateLimit(`mfa-webauthn-jti:${pendingJti}`, MAX_ATTEMPTS_PER_PENDING, 5 * 60_000).allowed) {
      await revokeJti(pendingJti, exp);
      deleteDEK(pendingJti);
      return NextResponse.json({ error: "Too many attempts. Please log in again." }, { status: 429 });
    }

    const user = await getUserById(pending.userId);
    if (!user) return fail();
    const pendingDek = getDEK(pendingJti, pending.userId);
    if (!pendingDek) {
      return NextResponse.json({ error: "Pending session has no DEK. Please sign in again." }, { status: 401 });
    }

    const passkey = await getPasskey(response.id);
    const result = await verifyPasskeyAssertion({
      token,
      purpose: "passkey-2fa",
      binding: { userId: user.id, pendingJti },
      response,
      passkey: passkey
        ? {
            id: passkey.id,
            userId: passkey.userId,
            publicKey: passkey.publicKey,
            counter: passkey.counter,
            transports: passkey.transports,
          }
        : null,
    });
    if (!result.ok) {
      const event = result.reason === "counter_regression" ? "passkey_counter_regression" : "passkey_2fa_failed";
      logSecurityEvent(user.id, event, { method: "passkey", ip, userAgent }).catch(() => {});
      return fail();
    }
    // Compare-and-set: a concurrent assertion with the same counter loses.
    if (
      !(await advancePasskeyCounter(user.id, passkey!.id, result.previousCounter, result.newCounter, result.backedUp))
    ) {
      logSecurityEvent(user.id, "passkey_counter_regression", { method: "passkey", ip, userAgent }).catch(() => {});
      return fail();
    }

    // Google link cookie (same semantics as mfa/verify): link only when bound to this user + pending jti.
    const googleLinkCookie = request.cookies.get("pf_google_link")?.value;
    let issuedDevice: Awaited<ReturnType<typeof issueDevice>> = null;
    if (googleLinkCookie) {
      try {
        const link = await verifyShortLived(googleLinkCookie, "google-link");
        if (link && link.userId === user.id && link.pendingJti === pendingJti) {
          await upsertIdentity({
            userId: user.id,
            provider: "google",
            subject: link.sub as string,
            email: link.email as string,
            emailVerified: link.emailVerified ? 1 : 0,
          });
          if (trustDevice !== false) {
            issuedDevice = await issueDevice(
              user.id,
              pendingDek,
              userAgent,
              undefined,
              request.cookies.get("pf_device")?.value
            );
          }
        }
      } catch (error) {
        await logApiError("POST", "/api/auth/mfa/webauthn/verify", error, user.id);
      }
    }

    // Promote pending -> full session (mfaVerified). The session gets its OWN
    // copy of the DEK: deleteDEK(pendingJti) zero-fills the buffer it holds, so
    // sharing the pending buffer would leave the new session (and the trusted
    // device wrap below) with an all-zero key.
    const sessionDek = Buffer.from(pendingDek);
    await recordSuccessfulLogin(user.id);
    const { token: sessionToken, jti } = await createSessionToken(user.id, true);
    putDEK(jti, sessionDek, SESSION_TTL_MS, user.id);
    deleteDEK(pendingJti);
    await revokeJti(pendingJti, exp);
    enqueueBackfillSecurities(user.id, sessionDek);
    enqueueUpgradeStagingEncryption(user.id, sessionDek);
    enqueueUpgradeUserFieldEncryption(user.id, sessionDek);
    enqueueProcessPendingInbox(user.id, sessionDek);
    logSecurityEvent(user.id, "passkey_2fa_success", { method: "passkey", ip, userAgent }).catch(() => {});

    const res = NextResponse.json({ success: true });
    await commitSession(request, res, { token: sessionToken, jti, userId: user.id });
    if (issuedDevice) {
      const o = deviceCookieOptions();
      res.cookies.set("pf_device", issuedDevice.cookieList, {
        httpOnly: o.httpOnly,
        secure: o.secure,
        sameSite: o.sameSite,
        maxAge: o.maxAge,
        path: o.path,
      });
    }
    await applyTrustedDevicePolicy({
      request,
      response: res,
      userId: user.id,
      dek: sessionDek,
      trustDevice,
      alreadyIssued: issuedDevice !== null,
      routeLabel: "/api/auth/mfa/webauthn/verify",
    });
    const clear = {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax" as const,
      maxAge: 0,
      path: "/",
    };
    res.cookies.set("pf_unlock", "", clear);
    if (googleLinkCookie) res.cookies.set("pf_google_link", "", clear);
    return res;
  } catch (e) {
    await logApiError("POST", "/api/auth/mfa/webauthn/verify", e);
    return fail();
  }
}
