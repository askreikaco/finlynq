/**
 * Passkey step-up for destructive / admin actions (B7 follow-up a, b).
 *
 * A user whose only second factor is a passkey must prove possession of one
 * (UV-required assertion) for delete-account, wipe-account, admin email
 * integration and admin user edits; a password alone is not enough.
 *
 * The challenge is a "passkey-stepup" token bound to {user, session, action}
 * and single use (consumeChallengeToken), so a token minted for one action or
 * session never satisfies another. Counter is advanced by compare-and-set.
 */
import { z } from "zod";
import { generateAuthenticationOptions } from "@simplewebauthn/server";
import type { PublicKeyCredentialRequestOptionsJSON } from "@simplewebauthn/server";
import {
  signChallengeToken,
  verifyPasskeyAssertion,
  getRpConfig,
  parseTransports,
  CHALLENGE_TTL_SECONDS,
} from "@/lib/auth/webauthn";
import { authenticationResponseSchema, challengeTokenSchema } from "@/lib/auth/webauthn-schemas";
import { getPasskey, listPasskeys, countPasskeys, advancePasskeyCounter } from "@/lib/auth/queries";
import { userHasSecondFactor } from "@/lib/auth/second-factor";
import { logSecurityEvent } from "@/lib/auth/security-events";

export const STEP_UP_ACTIONS = [
  "delete-account",
  "wipe-account",
  "admin-email-integration",
  "admin-user-update",
  "passkey-remove",
] as const;
export type StepUpAction = (typeof STEP_UP_ACTIONS)[number];

/** Request-body shape every step-up route accepts: { passkeyStepUp: { token, response } }. */
export const passkeyStepUpSchema = z.object({
  token: challengeTokenSchema,
  response: authenticationResponseSchema,
});
export type PasskeyStepUpInput = z.infer<typeof passkeyStepUpSchema>;

export type StepUpMethod = "totp" | "passkey" | "none";

/**
 * Which second factor an action must be proven with. TOTP wins when usable
 * (existing behaviour); otherwise a registered passkey; otherwise none.
 * userHasSecondFactor is the single "has a second factor" definition.
 */
export async function stepUpMethodFor(user: {
  id: string;
  mfaEnabled?: number | boolean | null;
  mfaSecret?: string | null;
}): Promise<StepUpMethod> {
  if (!(await userHasSecondFactor(user.id, user.mfaEnabled))) return "none";
  if (user.mfaEnabled && user.mfaSecret) return "totp";
  return (await countPasskeys(user.id)) > 0 ? "passkey" : "none";
}

export async function beginPasskeyStepUp(opts: {
  userId: string;
  sessionId: string;
  action: StepUpAction;
}): Promise<{ options: PublicKeyCredentialRequestOptionsJSON; token: string } | null> {
  const passkeys = await listPasskeys(opts.userId);
  if (passkeys.length === 0) return null;
  const { rpID } = getRpConfig();
  const options = await generateAuthenticationOptions({
    rpID,
    userVerification: "required",
    allowCredentials: passkeys.map((p) => ({ id: p.id, transports: parseTransports(p.transports) })),
    timeout: CHALLENGE_TTL_SECONDS * 1000,
  });
  const token = await signChallengeToken("passkey-stepup", options.challenge, {
    userId: opts.userId,
    sessionId: opts.sessionId,
    action: opts.action,
  });
  return { options, token };
}

/** True only for a fresh, UV-verified assertion by one of THIS user's passkeys, minted for `action` in THIS session. */
export async function verifyPasskeyStepUp(opts: {
  userId: string;
  sessionId: string | null;
  action: StepUpAction;
  input: PasskeyStepUpInput | undefined;
  ip?: string;
  userAgent?: string;
}): Promise<boolean> {
  if (!opts.input || !opts.sessionId) return false;
  const { token, response } = opts.input;
  // The browser PRF value (if any) is never read here.
  const clean = { ...response, clientExtensionResults: {} };
  const passkey = await getPasskey(clean.id);
  const verdict = await verifyPasskeyAssertion({
    token,
    purpose: "passkey-stepup",
    binding: { userId: opts.userId, sessionId: opts.sessionId, action: opts.action },
    response: clean,
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
  const log = (event: "passkey_2fa_failed" | "passkey_counter_regression") =>
    logSecurityEvent(opts.userId, event, {
      method: `passkey-stepup:${opts.action}`,
      ip: opts.ip,
      userAgent: opts.userAgent,
    }).catch(() => {});
  if (!verdict.ok) {
    log(verdict.reason === "counter_regression" ? "passkey_counter_regression" : "passkey_2fa_failed");
    return false;
  }
  if (!(await advancePasskeyCounter(opts.userId, passkey!.id, verdict.previousCounter, verdict.newCounter, verdict.backedUp))) {
    log("passkey_counter_regression");
    return false;
  }
  return true;
}
