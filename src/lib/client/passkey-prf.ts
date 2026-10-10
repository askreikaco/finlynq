/**
 * Browser-side passkey + WebAuthn PRF helper (recovery plan B6; B7's UI calls
 * this). Wraps @simplewebauthn/browser, which does NOT convert PRF inputs or
 * results: `extensions.prf.eval.first` must reach navigator.credentials.get as
 * a BufferSource and the output comes back as an ArrayBuffer.
 *
 * Contract
 *  - `salt` (base64url, 32 bytes) always comes from the SERVER (prfSalt in the
 *    options response); the client never derives or chooses it.
 *  - The returned `response` has clientExtensionResults emptied: the PRF value
 *    travels ONLY as `prfOutput` (base64url of 32 bytes) and is never stored,
 *    logged or put in the assertion JSON.
 *  - `prfOutput` is null when the authenticator/browser returned no PRF result
 *    (feature-detect at runtime; never sniff the UA).
 */
import { startAuthentication, startRegistration } from "@simplewebauthn/browser";
import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
} from "@simplewebauthn/browser";

export function b64urlToBytes(s: string): Uint8Array<ArrayBuffer> {
  const pad = "=".repeat((4 - (s.length % 4)) % 4);
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function bytesToB64url(buf: ArrayBuffer | ArrayBufferView): string {
  const u8 = buf instanceof ArrayBuffer ? new Uint8Array(buf) : new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  let bin = "";
  for (const b of u8) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** WebAuthn ceremonies currently running in this page (any caller). */
let webauthnPending = 0;

/** True while a passkey prompt (sign-in, registration or PRF) is open; auto-start paths must wait. */
export function isWebAuthnPending(): boolean {
  return webauthnPending > 0;
}

async function trackWebAuthn<T>(run: () => Promise<T>): Promise<T> {
  webauthnPending++;
  try {
    return await run();
  } finally {
    webauthnPending--;
  }
}

export interface PrfAssertion {
  /** Assertion JSON for the server (clientExtensionResults emptied). */
  response: AuthenticationResponseJSON;
  /** base64url of the 32-byte PRF output, or null when unavailable. */
  prfOutput: string | null;
}

/** Remembered (non-secret) id of the last passkey used here; lets the next login run in ONE prompt. */
const HINT_KEY = "finlynq_passkey_hint";
export function rememberPasskeyHint(credentialId: string): void {
  try { localStorage.setItem(HINT_KEY, credentialId); } catch { /* storage blocked */ }
}
export function getPasskeyHint(): string | undefined {
  try { return localStorage.getItem(HINT_KEY) ?? undefined; } catch { return undefined; }
}
export function forgetPasskeyHint(): void {
  try { localStorage.removeItem(HINT_KEY); } catch { /* ignore */ }
}

/**
 * Run a WebAuthn assertion and, when `salt` is given, evaluate PRF over it in
 * the same prompt. `options` is the server's request-options JSON.
 */
export async function getAssertionWithPrf(
  options: PublicKeyCredentialRequestOptionsJSON,
  salt?: string | null
): Promise<PrfAssertion> {
  const optionsJSON = (salt
    ? {
        ...options,
        extensions: {
          ...(options.extensions ?? {}),
          // BufferSource, not a string: the browser lib passes extensions through untouched.
          prf: { eval: { first: b64urlToBytes(salt) } },
        },
      }
    : options) as PublicKeyCredentialRequestOptionsJSON;
  const raw = await trackWebAuthn(() => startAuthentication({ optionsJSON }));
  const results = (raw.clientExtensionResults as { prf?: { results?: { first?: ArrayBuffer | ArrayBufferView } } } | undefined)?.prf
    ?.results?.first;
  let prfOutput: string | null = null;
  if (results) {
    const out = bytesToB64url(results);
    // WebAuthn PRF outputs are 32 bytes (43 base64url chars).
    prfOutput = out.length === 43 ? out : null;
  }
  return { response: { ...raw, clientExtensionResults: {} }, prfOutput };
}

/**
 * Registration: asks the authenticator to enable PRF (prf: {}) and reports what
 * it said. `prfEnabled === false` means "known unsupported" (skip the PRF step);
 * true/undefined means try getAssertionWithPrf next (many authenticators only
 * return PRF results at get()).
 */
export async function registerPasskey(
  options: PublicKeyCredentialCreationOptionsJSON
): Promise<{ response: RegistrationResponseJSON; prfEnabled: boolean | undefined }> {
  const raw = await trackWebAuthn(() =>
    startRegistration({
      optionsJSON: { ...options, extensions: { ...(options.extensions ?? {}), prf: {} } } as PublicKeyCredentialCreationOptionsJSON,
    })
  );
  const enabled = (raw.clientExtensionResults as { prf?: { enabled?: boolean } } | undefined)?.prf?.enabled;
  return { response: raw, prfEnabled: enabled };
}

// ─── Flow drivers (server contract; see B6 report) ──────────────────────────

type Json = Record<string, unknown>;
async function post(url: string, body: Json): Promise<{ ok: boolean; status: number; json: Json }> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify(body),
  });
  return { ok: res.ok, status: res.status, json: (await res.json().catch(() => ({}))) as Json };
}

export type PasskeyFlowResult =
  | { ok: true; json: Json }
  | { ok: false; code: "prf_unavailable" | "failed" | "cancelled"; status: number };

/**
 * Passkey sign-in or recovery. `base` = "/api/auth/passkey/login" or
 * "/api/auth/recovery/passkey"; `finalPath` = "verify" | "reset".
 * Handles the one-prompt (remembered hint) and two-prompt (discoverable) flows.
 */
async function runAnonymousFlow(
  base: string,
  finalPath: "verify" | "reset",
  extra: Json,
  useHint: boolean
): Promise<PasskeyFlowResult> {
  try {
    const hint = useHint ? getPasskeyHint() : undefined;
    const o = await post(`${base}/options`, hint ? { credentialId: hint } : {});
    if (!o.ok) return { ok: false, code: "failed", status: o.status };
    let step = await getAssertionWithPrf(o.json.options as PublicKeyCredentialRequestOptionsJSON, (o.json.prfSalt as string) ?? null);
    let r = await post(`${base}/${finalPath}`, {
      token: o.json.token,
      response: step.response,
      ...(step.prfOutput ? { prfOutput: step.prfOutput } : {}),
      ...extra,
    });
    if (r.ok && r.json.step === "prf") {
      step = await getAssertionWithPrf(r.json.options as PublicKeyCredentialRequestOptionsJSON, r.json.prfSalt as string);
      if (!step.prfOutput) return { ok: false, code: "prf_unavailable", status: 400 };
      r = await post(`${base}/${finalPath}`, { token: r.json.token, response: step.response, prfOutput: step.prfOutput, ...extra });
    }
    if (r.ok) {
      // Remember the credential this browser just used, so the next sign-in here
      // is ONE prompt (credential-scoped, PRF evaluated in the same ceremony)
      // instead of the two-prompt discoverable flow. Non-secret: just an id.
      rememberPasskeyHint(step.response.id);
      return { ok: true, json: r.json };
    }
    if (hint && r.json.code !== "prf_unavailable") forgetPasskeyHint(); // stale hint: next try is discoverable
    return { ok: false, code: r.json.code === "prf_unavailable" ? "prf_unavailable" : "failed", status: r.status };
  } catch (e) {
    const name = (e as { name?: string })?.name;
    // A cancelled hinted prompt usually means the remembered passkey isn't on this
    // device (the browser offered a phone / QR instead): drop the hint so the next
    // try lets the user pick any passkey.
    if (useHint) forgetPasskeyHint();
    return { ok: false, code: name === "NotAllowedError" || name === "AbortError" ? "cancelled" : "failed", status: 0 };
  }
}

/** Sign in with a passkey (no password). On success the server has set the session cookies. */
export function passkeyLogin(opts: { trustDevice?: boolean } = {}): Promise<PasskeyFlowResult> {
  return runAnonymousFlow("/api/auth/passkey/login", "verify", { trustDevice: opts.trustDevice !== false }, true);
}

/** Reset the password with a passkey (no data wipe). */
export function passkeyRecovery(newPassword: string, opts: { trustDevice?: boolean } = {}): Promise<PasskeyFlowResult> {
  return runAnonymousFlow("/api/auth/recovery/passkey", "reset", { newPassword, trustDevice: opts.trustDevice !== false }, true);
}

/**
 * Enable "unlock without password" for an existing passkey of the signed-in
 * user (right after registration, or later). Requires a live DEK session; the
 * server asks for `currentPassword` when the session is older than 10 minutes.
 */
export async function enablePasskeyPrf(
  credentialId: string,
  currentPassword?: string
): Promise<{ ok: true } | { ok: false; code: "password_required" | "prf_unavailable" | "failed" | "cancelled" }> {
  try {
    const o = await post("/api/settings/passkeys/register/prf-options", { credentialId, ...(currentPassword ? { currentPassword } : {}) });
    if (o.status === 401) return { ok: false, code: "password_required" };
    if (!o.ok) return { ok: false, code: "failed" };
    const step = await getAssertionWithPrf(o.json.options as PublicKeyCredentialRequestOptionsJSON, o.json.prfSalt as string);
    if (!step.prfOutput) return { ok: false, code: "prf_unavailable" };
    const f = await post("/api/settings/passkeys/register/finish-prf", {
      token: o.json.token,
      response: step.response,
      prfOutput: step.prfOutput,
    });
    if (f.ok) rememberPasskeyHint(credentialId);
    return f.ok ? { ok: true } : { ok: false, code: "failed" };
  } catch (e) {
    const name = (e as { name?: string })?.name;
    return { ok: false, code: name === "NotAllowedError" || name === "AbortError" ? "cancelled" : "failed" };
  }
}
