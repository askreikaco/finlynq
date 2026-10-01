/**
 * Passkey PRF key-wrap (recovery plan B6). SERVER side.
 *
 * Trust model (plan 1.6)
 *  - The PRF output reaches the server only as a transient request field. It
 *    is NEVER proof of identity: every flow first verifies a WebAuthn assertion
 *    (verifyPasskeyAssertion: signature, origin/rpID, UV, counter, ownership)
 *    and only then uses the PRF output as KEY MATERIAL. A wrong value just
 *    fails AES-GCM authentication.
 *  - The output is never stored, logged or returned.
 *
 * Wrap format (user_passkeys.dek_wrapped_prf, user_passkeys.prf_salt_version)
 *   salt  = SHA-256("finlynq-passkey-prf-salt|v<ver>|" + credentialId)
 *           per credential, deterministic from (credentialId, version): public,
 *           not secret, not influenced by anything the user types. The browser
 *           evaluates PRF over it (eval.first).
 *   key   = HKDF-SHA256(ikm = prf(32), salt = salt,
 *                       info = "finlynq-prf-wrap-v1|<userId>|<credentialId>|<ver>", 32)
 *   wrap  = base64(iv(12) || AES-256-GCM(key, dek) || tag(16)),
 *           AAD = "<userId>|<credentialId>|<ver>"
 * Key (via info) and AAD both bind user + credential + version, so a wrap
 * copied to another credential/user/version never opens.
 */
import crypto from "crypto";
import {
  signChallengeToken,
  peekChallengeUserId,
  verifyPasskeyAssertion,
  getRpConfig,
  parseTransports,
  ANON_USER,
  CHALLENGE_TTL_SECONDS,
} from "@/lib/auth/webauthn";
import type { ChallengeBinding, WebAuthnChallengePurpose } from "@/lib/auth/webauthn";
import { generateAuthenticationOptions } from "@simplewebauthn/server";
import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialRequestOptionsJSON,
} from "@simplewebauthn/server";
import { getPasskey, advancePasskeyCounter } from "@/lib/auth/queries";
import { logSecurityEvent } from "@/lib/auth/security-events";

export const PRF_WRAP_VERSION = 1;
const SALT_PREFIX = "finlynq-passkey-prf-salt|v";
const INFO_PREFIX = "finlynq-prf-wrap-v1|";

export interface PrfWrapParams {
  userId: string;
  credentialId: string;
  version: number;
}

/** Per-credential PRF salt (32 bytes). Public; see header. */
export function prfSalt(credentialId: string, version: number = PRF_WRAP_VERSION): Buffer {
  return crypto.createHash("sha256").update(`${SALT_PREFIX}${version}|${credentialId}`).digest();
}
export const prfSaltB64url = (credentialId: string, version?: number): string =>
  prfSalt(credentialId, version).toString("base64url");

/** Strict decode of a client-supplied PRF output: base64url, exactly 32 bytes. */
export function parsePrfOutput(value: unknown): Buffer | null {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(value)) return null;
  const b = Buffer.from(value, "base64url");
  return b.length === 32 ? b : null;
}

/** Exported for tests only (raw-crypto assertions on the wrap format). */
export function derivePrfWrapKey(prf: Buffer, p: PrfWrapParams): Buffer {
  return Buffer.from(
    crypto.hkdfSync(
      "sha256",
      prf,
      prfSalt(p.credentialId, p.version),
      Buffer.from(`${INFO_PREFIX}${p.userId}|${p.credentialId}|${p.version}`),
      32
    )
  );
}

export function prfWrapAad(p: PrfWrapParams): Buffer {
  return Buffer.from(`${p.userId}|${p.credentialId}|${p.version}`);
}

export function wrapDekWithPrf(dek: Buffer, prf: Buffer, p: PrfWrapParams): string {
  if (dek.length !== 32) throw new Error("Invalid DEK");
  const key = derivePrfWrapKey(prf, p);
  try {
    const iv = crypto.randomBytes(12);
    const c = crypto.createCipheriv("aes-256-gcm", key, iv);
    c.setAAD(prfWrapAad(p));
    const ct = Buffer.concat([c.update(dek), c.final()]);
    return Buffer.concat([iv, ct, c.getAuthTag()]).toString("base64");
  } finally {
    key.fill(0);
  }
}

/** Throws on any mismatch (wrong PRF, wrong user/credential/version, tampering). */
export function unwrapDekWithPrf(wrapped: string, prf: Buffer, p: PrfWrapParams): Buffer {
  const buf = Buffer.from(wrapped, "base64");
  if (buf.length !== 12 + 32 + 16) throw new Error("Bad PRF wrap");
  const key = derivePrfWrapKey(prf, p);
  try {
    const d = crypto.createDecipheriv("aes-256-gcm", key, buf.subarray(0, 12));
    d.setAAD(prfWrapAad(p));
    d.setAuthTag(buf.subarray(buf.length - 16));
    const dek = Buffer.concat([d.update(buf.subarray(12, buf.length - 16)), d.final()]);
    if (dek.length !== 32) throw new Error("Bad PRF wrap");
    return dek;
  } finally {
    key.fill(0);
  }
}

// ─── Options + challenge tokens ─────────────────────────────────────────────

export interface PasskeyAssertionOptions {
  options: PublicKeyCredentialRequestOptionsJSON;
  token: string;
  /** base64url PRF salt for the credential named in allowCredentials (absent for discoverable options). */
  prfSalt?: string;
}

/**
 * Assertion options. `credential` given -> allowCredentials=[it] and its PRF
 * salt is returned for eval.first. Absent -> discoverable (empty allowList, no
 * salt: per-credential salts cannot be known before the user picks one, so
 * the verify route runs a second, credential-scoped step when needed).
 * UV is always required.
 */
export async function beginPasskeyAssertion(opts: {
  purpose: Extract<WebAuthnChallengePurpose, "passkey-login" | "passkey-recovery" | "passkey-prf">;
  bind: ChallengeBinding;
  credential?: { id: string; transports?: string | null; saltVersion?: number };
}): Promise<PasskeyAssertionOptions> {
  const { rpID } = getRpConfig();
  const options = await generateAuthenticationOptions({
    rpID,
    userVerification: "required",
    allowCredentials: opts.credential
      ? [{ id: opts.credential.id, transports: parseTransports(opts.credential.transports) }]
      : [],
    timeout: CHALLENGE_TTL_SECONDS * 1000,
  });
  const token = await signChallengeToken(opts.purpose, options.challenge, opts.bind);
  return {
    options,
    token,
    ...(opts.credential ? { prfSalt: prfSaltB64url(opts.credential.id, opts.credential.saltVersion) } : {}),
  };
}

// ─── Login / recovery proof (shared by passkey/login and recovery/passkey) ──

type ProofPurpose = Extract<WebAuthnChallengePurpose, "passkey-login" | "passkey-recovery">;

export type PasskeyProof =
  /** Anything wrong. Callers return ONE generic 400 (no oracle). */
  | { kind: "fail" }
  /** Assertion verified but this credential has no PRF wrap: password path only. No DEK. */
  | { kind: "prf_unavailable"; userId: string; credentialId: string }
  /** Anonymous step 1 verified: run a second, credential-scoped assertion that evaluates PRF. */
  | ({ kind: "needs_prf"; userId: string; credentialId: string } & Required<PasskeyAssertionOptions>)
  /** Assertion verified AND PRF output opened the wrap. `dek` is a private copy; caller zeroes it. */
  | { kind: "unlocked"; userId: string; credentialId: string; dek: Buffer };

/**
 * Verify a passkey assertion (ALWAYS, first) and, when a PRF output is given,
 * open the credential's DEK wrap with it.
 *
 * Token shapes: anonymous (userId ANON_USER; discoverable / hinted) or
 * credential-scoped (userId + cid; issued by step 1 below). A PRF output
 * without a verified assertion is never used.
 */
export async function proveWithPasskey(opts: {
  purpose: ProofPurpose;
  token: string;
  response: AuthenticationResponseJSON;
  prfOutput?: string;
  ip?: string;
  userAgent?: string;
}): Promise<PasskeyProof> {
  const { purpose, response } = opts;
  const bound = await peekChallengeUserId(opts.token, purpose);
  if (!bound) return { kind: "fail" };
  const anonymous = bound === ANON_USER;

  const passkey = await getPasskey(response.id);
  const verdict = await verifyPasskeyAssertion({
    token: opts.token,
    purpose,
    binding: { userId: bound, ...(anonymous ? {} : { credentialId: response.id }) },
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
  if (!verdict.ok) {
    if (passkey && verdict.reason === "counter_regression") {
      logSecurityEvent(passkey.userId, "passkey_counter_regression", {
        method: "passkey",
        ip: opts.ip,
        userAgent: opts.userAgent,
      }).catch(() => {});
    }
    return { kind: "fail" };
  }
  // verifyPasskeyAssertion returned ok, so `passkey` is non-null here.
  const pk = passkey!;
  if (!(await advancePasskeyCounter(pk.userId, pk.id, verdict.previousCounter, verdict.newCounter, verdict.backedUp))) {
    logSecurityEvent(pk.userId, "passkey_counter_regression", {
      method: "passkey",
      ip: opts.ip,
      userAgent: opts.userAgent,
    }).catch(() => {});
    return { kind: "fail" };
  }

  const wrapped = pk.dekWrappedPrf;
  const version = pk.prfSaltVersion ?? PRF_WRAP_VERSION;
  if (opts.prfOutput === undefined) {
    // Step 1 of the two-step (discoverable) flow only: a credential-scoped
    // token cannot be "re-identified" again.
    if (!anonymous) return { kind: "fail" };
    if (!wrapped) return { kind: "prf_unavailable", userId: pk.userId, credentialId: pk.id };
    const next = await beginPasskeyAssertion({
      purpose,
      bind: { userId: pk.userId, credentialId: pk.id },
      credential: { id: pk.id, transports: pk.transports, saltVersion: version },
    });
    return {
      kind: "needs_prf",
      userId: pk.userId,
      credentialId: pk.id,
      options: next.options,
      token: next.token,
      prfSalt: next.prfSalt!,
    };
  }

  const prf = parsePrfOutput(opts.prfOutput);
  if (!prf) return { kind: "fail" };
  try {
    if (!wrapped) return { kind: "prf_unavailable", userId: pk.userId, credentialId: pk.id };
    try {
      const dek = unwrapDekWithPrf(wrapped, prf, { userId: pk.userId, credentialId: pk.id, version });
      return { kind: "unlocked", userId: pk.userId, credentialId: pk.id, dek };
    } catch {
      // Wrong PRF / wrap of another credential / tampered: same as any failure.
      return { kind: "fail" };
    }
  } finally {
    prf.fill(0);
  }
}

export { ANON_USER };
