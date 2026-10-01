/**
 * WebAuthn core (recovery plan B5): RP config, signed single-use challenge
 * tokens, registration + authentication verification.
 *
 * Trust model
 *  - rpID / origins come ONLY from server config (APP_URL, optional
 *    PF_WEBAUTHN_RP_ID / PF_WEBAUTHN_ORIGINS). Never from request headers.
 *    Wildcards, non-https (except localhost), and paths are refused.
 *  - A challenge lives inside a purpose-bound, HS256-signed short-lived token
 *    (verifyShortLived rejects any other purpose). The token binds
 *    {userId, optional sessionId/pendingJti}. Single use is enforced in the
 *    DB (revoked_jtis INSERT ... ON CONFLICT DO NOTHING RETURNING): atomic and
 *    multi-process safe. The token is consumed BEFORE the response is
 *    verified so a failed attempt still burns the challenge. DB failure =
 *    fail closed (throws).
 *  - userVerification is ALWAYS required (registration and authentication);
 *    attestation "none".
 *  - Counter / clone detection: the library verifies signature, origin, rpID,
 *    flags and challenge. The stored counter is deliberately NOT handed to it;
 *    we compare ourselves AFTER the signature is proven (so an unauthenticated
 *    caller can never raise a clone alarm) and report a typed result.
 *    Semantics identical to the spec: stored>0 or new>0 requires new>stored.
 *
 * PRF is NOT handled here and is never read from `response`: the wrap/unwrap
 * lives in passkey-prf.ts, which receives the PRF output as a separate field
 * and only ever uses it as key material (never as proof of anything).
 */

import crypto from "crypto";
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from "@simplewebauthn/server";
import type {
  AuthenticationResponseJSON,
  AuthenticatorTransport,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { signShortLived, verifyShortLived } from "@/lib/auth/jwt";
import type { ShortLivedPurpose } from "@/lib/auth/jwt";

export const RP_NAME = "Finlynq";
/** Challenge-token lifetime. */
export const CHALLENGE_TTL_SECONDS = 5 * 60;
/** Hard cap on passkeys per account. */
export const MAX_PASSKEYS_PER_USER = 20;

export type WebAuthnChallengePurpose = Extract<
  ShortLivedPurpose,
  "passkey-register" | "passkey-2fa" | "passkey-login" | "passkey-recovery" | "passkey-prf"
>;

/**
 * Binding userId of an ANONYMOUS challenge (discoverable login / recovery:
 * the user is unknown until the assertion names a credential). Never a valid
 * user id (users.id is a uuid). Only passkey-login / passkey-recovery
 * issue it; every other flow binds a real user, so an anonymous token can never
 * satisfy a user-bound expectation and vice versa (equality check).
 */
export const ANON_USER = "-";

// ─── RP config ──────────────────────────────────────────────────────────────

export interface RpConfig {
  rpID: string;
  origins: string[];
}

function isLocalHost(h: string): boolean {
  return h === "localhost" || h === "127.0.0.1" || h === "[::1]";
}

function parseOrigin(raw: string): string {
  if (/[*\s]/.test(raw)) throw new Error("webauthn: wildcard/space in origin refused");
  const u = new URL(raw);
  if (u.protocol !== "https:" && !(u.protocol === "http:" && isLocalHost(u.hostname))) {
    throw new Error("webauthn: origin must be https (or http://localhost)");
  }
  if (u.username || u.password) throw new Error("webauthn: origin must not embed credentials");
  return u.origin;
}

/** Resolve RP config from env on every call (cheap; keeps tests and env changes honest). */
export function getRpConfig(): RpConfig {
  const appUrl = process.env.APP_URL || (process.env.NODE_ENV === "production" ? "" : "http://localhost:3000");
  if (!appUrl) throw new Error("webauthn: APP_URL is not configured");
  const appOrigin = parseOrigin(appUrl);
  const rpID = (process.env.PF_WEBAUTHN_RP_ID || new URL(appOrigin).hostname).toLowerCase();
  const extra = (process.env.PF_WEBAUTHN_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map(parseOrigin);
  const origins = Array.from(new Set([appOrigin, ...extra]));
  // Every allowed origin must be the rpID or a subdomain of it.
  for (const o of origins) {
    const h = new URL(o).hostname.toLowerCase();
    if (h !== rpID && !h.endsWith("." + rpID)) {
      throw new Error("webauthn: origin host is outside rpID");
    }
  }
  return { rpID, origins };
}

// ─── Encoding helpers ───────────────────────────────────────────────────────

const b64url = (buf: Uint8Array | Buffer): string => Buffer.from(buf).toString("base64url");

/** Stored public keys are standard base64 of the COSE key bytes. */
export function encodePublicKey(pk: Uint8Array): string {
  return Buffer.from(pk).toString("base64");
}
export function decodePublicKey(stored: string): Uint8Array<ArrayBuffer> {
  const b = Buffer.from(stored, "base64");
  const out = new Uint8Array(new ArrayBuffer(b.length));
  out.set(b);
  return out;
}

const VALID_TRANSPORTS = new Set(["ble", "cable", "hybrid", "internal", "nfc", "smart-card", "usb"]);
export function parseTransports(stored: string | null | undefined): AuthenticatorTransport[] | undefined {
  if (!stored) return undefined;
  try {
    const arr = JSON.parse(stored);
    if (!Array.isArray(arr)) return undefined;
    const ok = arr.filter((t): t is AuthenticatorTransport => typeof t === "string" && VALID_TRANSPORTS.has(t));
    return ok.length ? ok : undefined;
  } catch {
    return undefined;
  }
}

// ─── Challenge tokens ───────────────────────────────────────────────────────

export interface ChallengeBinding {
  userId: string;
  /** Session jti the token was minted in (settings flows). */
  sessionId?: string;
  /** Pending-MFA jti the token was minted for (2FA flow). */
  pendingJti?: string;
  /** Credential id the token was minted for (PRF second step / enrolment). */
  credentialId?: string;
}

export async function signChallengeToken(
  purpose: WebAuthnChallengePurpose,
  challenge: string,
  bind: ChallengeBinding
): Promise<string> {
  return signShortLived(
    {
      challenge,
      userId: bind.userId,
      ...(bind.sessionId ? { sid: bind.sessionId } : {}),
      ...(bind.pendingJti ? { pjti: bind.pendingJti } : {}),
      ...(bind.credentialId ? { cid: bind.credentialId } : {}),
      jti: crypto.randomUUID(),
    },
    CHALLENGE_TTL_SECONDS,
    purpose
  );
}

/**
 * Read the signed userId binding of a challenge token WITHOUT consuming it
 * (null if invalid / wrong purpose / expired). Lets a route that serves both
 * an anonymous first step and a user-bound second step pick the right
 * expectation; the real consume + verification still happens afterwards.
 */
export async function peekChallengeUserId(
  token: string,
  purpose: WebAuthnChallengePurpose
): Promise<string | null> {
  const payload = await verifyShortLived(token, purpose);
  const userId = payload?.userId;
  return typeof userId === "string" && userId ? userId : null;
}

/**
 * Verify purpose/signature/expiry/bindings, then atomically consume the
 * token's jti. Returns the challenge, or null on ANY failure. Throws only on
 * DB failure (callers must treat as failure).
 */
export async function consumeChallengeToken(
  token: string,
  purpose: WebAuthnChallengePurpose,
  expect: ChallengeBinding
): Promise<string | null> {
  const payload = await verifyShortLived(token, purpose);
  if (!payload) return null;
  const { challenge, userId, sid, pjti, cid, jti, exp } = payload as Record<string, unknown>;
  if (typeof challenge !== "string" || !challenge || typeof jti !== "string" || !jti) return null;
  if (typeof exp !== "number") return null;
  if (userId !== expect.userId) return null;
  if ((expect.sessionId ?? null) !== ((sid as string | undefined) ?? null)) return null;
  if ((expect.pendingJti ?? null) !== ((pjti as string | undefined) ?? null)) return null;
  if ((expect.credentialId ?? null) !== ((cid as string | undefined) ?? null)) return null;

  const { db } = await import("@/db");
  const { revokedJtis } = await import("@/db/schema-pg");
  const rows = await db
    .insert(revokedJtis)
    .values({ jti: `wach:${jti}`, expiresAt: new Date(exp * 1000) })
    .onConflictDoNothing({ target: revokedJtis.jti })
    .returning({ jti: revokedJtis.jti });
  if (rows.length !== 1) return null; // replay
  return challenge;
}

// ─── Registration ───────────────────────────────────────────────────────────

export async function beginRegistration(opts: {
  userId: string;
  userName: string;
  sessionId: string;
  existing: Array<{ id: string; transports?: string | null }>;
}): Promise<{ options: PublicKeyCredentialCreationOptionsJSON; token: string }> {
  const { rpID } = getRpConfig();
  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID,
    userName: opts.userName,
    userID: new TextEncoder().encode(opts.userId),
    attestationType: "none",
    excludeCredentials: opts.existing.map((c) => ({ id: c.id, transports: parseTransports(c.transports) })),
    authenticatorSelection: { residentKey: "preferred", userVerification: "required" },
    timeout: CHALLENGE_TTL_SECONDS * 1000,
  });
  const token = await signChallengeToken("passkey-register", options.challenge, {
    userId: opts.userId,
    sessionId: opts.sessionId,
  });
  return { options, token };
}

export interface VerifiedRegistration {
  credentialId: string;
  publicKey: string;
  counter: number;
  transports: string | null;
  aaguid: string;
  backedUp: number;
}

export type RegistrationResult =
  | { ok: true; credential: VerifiedRegistration }
  | { ok: false; reason: "bad_token" | "bad_response" };

export async function finishRegistration(opts: {
  userId: string;
  sessionId: string;
  token: string;
  response: RegistrationResponseJSON;
}): Promise<RegistrationResult> {
  const challenge = await consumeChallengeToken(opts.token, "passkey-register", {
    userId: opts.userId,
    sessionId: opts.sessionId,
  });
  if (!challenge) return { ok: false, reason: "bad_token" };
  const { rpID, origins } = getRpConfig();
  try {
    const v = await verifyRegistrationResponse({
      response: opts.response,
      expectedChallenge: challenge,
      expectedOrigin: origins,
      expectedRPID: rpID,
      requireUserPresence: true,
      requireUserVerification: true,
    });
    if (!v.verified || !v.registrationInfo) return { ok: false, reason: "bad_response" };
    const info = v.registrationInfo;
    const transports = info.credential.transports ?? opts.response.response.transports ?? [];
    return {
      ok: true,
      credential: {
        credentialId: info.credential.id,
        publicKey: encodePublicKey(info.credential.publicKey),
        counter: info.credential.counter,
        transports: transports.length ? JSON.stringify(transports) : null,
        aaguid: info.aaguid,
        backedUp: info.credentialBackedUp ? 1 : 0,
      },
    };
  } catch {
    return { ok: false, reason: "bad_response" };
  }
}

// ─── Authentication (passkey as 2FA) ────────────────────────────────────────

export async function beginAuthentication2fa(opts: {
  userId: string;
  pendingJti: string;
  credentials: Array<{ id: string; transports?: string | null }>;
}): Promise<{ options: PublicKeyCredentialRequestOptionsJSON; token: string }> {
  const { rpID } = getRpConfig();
  const options = await generateAuthenticationOptions({
    rpID,
    userVerification: "required",
    allowCredentials: opts.credentials.map((c) => ({ id: c.id, transports: parseTransports(c.transports) })),
    timeout: CHALLENGE_TTL_SECONDS * 1000,
  });
  const token = await signChallengeToken("passkey-2fa", options.challenge, {
    userId: opts.userId,
    pendingJti: opts.pendingJti,
  });
  return { options, token };
}

export interface StoredPasskey {
  id: string;
  userId: string;
  publicKey: string;
  counter: number;
  transports?: string | null;
}

export type AuthenticationResult =
  | { ok: true; newCounter: number; previousCounter: number; backedUp: boolean }
  | { ok: false; reason: "bad_token" | "bad_response" | "wrong_owner" | "counter_regression" };

/**
 * Verify an assertion for `passkey` (already loaded by the caller by
 * response.id) on behalf of `expect.userId`. Does NOT persist the counter;
 * the caller advances it atomically via advancePasskeyCounter.
 */
export async function verifyPasskeyAssertion(opts: {
  token: string;
  purpose: WebAuthnChallengePurpose;
  binding: ChallengeBinding;
  response: AuthenticationResponseJSON;
  passkey: StoredPasskey | null;
}): Promise<AuthenticationResult> {
  const challenge = await consumeChallengeToken(opts.token, opts.purpose, opts.binding);
  if (!challenge) return { ok: false, reason: "bad_token" };

  const { passkey, response } = opts;
  // ANON binding (discoverable flows): the credential names the user; every
  // other binding must match the credential's owner exactly.
  const anonymous = opts.binding.userId === ANON_USER;
  if (!passkey || passkey.id !== response.id || (!anonymous && passkey.userId !== opts.binding.userId)) {
    return { ok: false, reason: "wrong_owner" };
  }
  // userHandle (when the authenticator returns one) must be this user's id.
  const handle = response.response.userHandle;
  if (handle && handle !== b64url(new TextEncoder().encode(passkey.userId))) {
    return { ok: false, reason: "wrong_owner" };
  }

  const { rpID, origins } = getRpConfig();
  let newCounter: number;
  let backedUp: boolean;
  try {
    const v = await verifyAuthenticationResponse({
      response,
      expectedChallenge: challenge,
      expectedOrigin: origins,
      expectedRPID: rpID,
      // Counter is compared by us after the signature is proven (see header).
      credential: {
        id: passkey.id,
        publicKey: decodePublicKey(passkey.publicKey),
        counter: 0,
        transports: parseTransports(passkey.transports),
      },
      requireUserVerification: true,
    });
    if (!v.verified) return { ok: false, reason: "bad_response" };
    newCounter = v.authenticationInfo.newCounter;
    backedUp = v.authenticationInfo.credentialBackedUp;
  } catch {
    return { ok: false, reason: "bad_response" };
  }

  const stored = passkey.counter;
  if ((newCounter > 0 || stored > 0) && newCounter <= stored) {
    return { ok: false, reason: "counter_regression" };
  }
  return { ok: true, newCounter, previousCounter: stored, backedUp };
}
