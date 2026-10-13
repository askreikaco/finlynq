/**
 * Passkey unlock for the ON-DEVICE offline data (local-first). PROTOTYPE, unreviewed. Flag: localStorage
 * "finlynq.lf.passkey" === "1" (off by default, per browser). Off = every export here is inert until called.
 *
 * What it is:
 *  - A LOCAL-ONLY WebAuthn credential (platform authenticator, PRF extension). Never registered with the server,
 *    never sent anywhere, no fetch. It does not replace server auth and does NOT unlock the server DEK.
 *  - A random 32-byte "unlock secret", AES-GCM-wrapped under a key derived (HKDF-SHA-256) from the PRF output.
 *    Stored in its own IndexedDB database (one per user) as the wrapped bytes + credential id + PRF salt + rp id.
 *  - Unlock = a passkey assertion with user verification; PRF output -> wrap key -> unwrap. On success the unlock
 *    secret is kept in memory only (per user) until clearPasskeyUnlockedSession / a wipe.
 *
 * What it does NOT do: the unlock secret is not yet used to seal or open any data. The on-device device key
 * (device-key-provider.ts) stays non-extractable and usable without a passkey, so today this is a presence check plus
 * a verified unlock path, not a cryptographic gate. See the report for the decision this needs.
 *
 * Never stored: the PRF output, the password, the DEK, the unlock secret in plaintext.
 */
import { seal, open, AuthError } from "./aead";
import { deleteDb, idbSupported, openDb, registerDb, req, txDone, unregisterDb, userDbSuffix, allLfDbNames, LF_DB_PREFIX } from "../storage/db-registry";

export const PASSKEY_UNLOCK_KEY = "finlynq.lf.passkey";
/** Set once this browser has enrolled a passkey (any user). Lets wipes skip IndexedDB entirely on browsers that never did. */
export const PASSKEY_ENROLLED_KEY = "finlynq.lf.passkeyEnrolled";
export const PASSKEY_DB_PREFIX = `${LF_DB_PREFIX}passkey-v1-`;
export const WRAP_INFO_PREFIX = "finlynq-lf-passkey-wrap-v1";
const RECORD_AAD_PREFIX = "finlynq-lf-passkey-record|v1|";
const STORE = "records";
const RECORD_ID = "unlock";
const CEREMONY_TIMEOUT_MS = 60_000;
const RP_NAME = "Finlynq";

const enc = new TextEncoder();

export type PasskeyCode =
  | "ok"
  | "unsupported"
  | "cancelled"
  | "failed"
  | "not_enabled"
  | "wrong_passkey"
  | "unsynced_blocked";

export type PasskeyResult = { ok: true } | { ok: false; code: Exclude<PasskeyCode, "ok"> };

export interface PasskeyUnlockRecord {
  v: 1;
  rpId: string;
  credentialId: Uint8Array;
  userHandle: Uint8Array;
  prfSalt: Uint8Array;
  /** seal() output: nonce || ciphertext || tag, of the 32-byte unlock secret. */
  wrapped: Uint8Array;
  createdAt: number;
}

export interface PasskeyDeps {
  /** Defaults to navigator.credentials. Tests inject a fake. */
  credentials?: Pick<CredentialsContainer, "create" | "get">;
  /** Defaults to location.hostname. Must match the origin the page runs on. */
  rpId?: string;
}

/** Reads the flag. Any storage failure means OFF. */
export function isPasskeyUnlockFlagOn(): boolean {
  try {
    return typeof window !== "undefined" && window.localStorage.getItem(PASSKEY_UNLOCK_KEY) === "1";
  } catch {
    return false;
  }
}

function storageFlag(key: string): boolean {
  try {
    return typeof window !== "undefined" && window.localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

/** True when a passkey database may exist on this browser: the flag is on, or a passkey was ever enrolled here. */
export function passkeyMayExist(): boolean {
  return isPasskeyUnlockFlagOn() || storageFlag(PASSKEY_ENROLLED_KEY);
}

function markEnrolled(): void {
  try {
    window.localStorage.setItem(PASSKEY_ENROLLED_KEY, "1");
  } catch {
    /* storage blocked: the wipe may then miss a leftover database; the flag still gates unlock */
  }
}

export function passkeyDbName(userId: string): Promise<string> {
  return userDbSuffix(userId).then((s) => PASSKEY_DB_PREFIX + s);
}

function rand(n: number): Uint8Array {
  const out = new Uint8Array(n);
  globalThis.crypto.getRandomValues(out);
  return out;
}

function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

/** AAD binds a wrapped secret to one user and one credential: a record moved to another slot will not open. */
export function recordAad(userId: string, credentialId: Uint8Array): Uint8Array {
  const head = enc.encode(RECORD_AAD_PREFIX + userId + "|");
  const out = new Uint8Array(head.length + credentialId.length);
  out.set(head, 0);
  out.set(credentialId, head.length);
  return out;
}

/**
 * HKDF-SHA-256 from the PRF output to a non-extractable AES-GCM-256 wrap key.
 * salt = empty; info = "finlynq-lf-passkey-wrap-v1" + userId (UTF-8).
 */
export async function deriveWrapKey(prfOutput: Uint8Array, userId: string): Promise<CryptoKey> {
  const subtle = globalThis.crypto.subtle;
  const ikm = await subtle.importKey("raw", prfOutput as BufferSource, "HKDF", false, ["deriveKey"]);
  return subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(0) as BufferSource, info: enc.encode(WRAP_INFO_PREFIX + userId) as BufferSource },
    ikm,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

/** Unlock secrets held in memory after a successful passkey unlock. Never persisted. */
const sessionUnlocked = new Map<string, Uint8Array>();

export function hasPasskeyUnlockedSession(userId: string): boolean {
  return sessionUnlocked.has(userId);
}

export function clearPasskeyUnlockedSession(userId?: string): void {
  if (userId === undefined) sessionUnlocked.clear();
  else sessionUnlocked.delete(userId);
}

function resolveDeps(deps?: PasskeyDeps): { credentials: Pick<CredentialsContainer, "create" | "get"> | undefined; rpId: string } {
  const credentials = deps?.credentials ?? (typeof navigator !== "undefined" ? navigator.credentials : undefined);
  const rpId = deps?.rpId ?? (typeof location !== "undefined" ? location.hostname : "");
  return { credentials: credentials ?? undefined, rpId };
}

/** The PRF "first" output, or null when absent or not 32 bytes. */
function prfFirst(cred: PublicKeyCredential): Uint8Array | null {
  const ext = cred.getClientExtensionResults() as { prf?: { results?: { first?: ArrayBuffer | ArrayBufferView } } };
  const first = ext.prf?.results?.first;
  if (!first) return null;
  const bytes = ArrayBuffer.isView(first) ? new Uint8Array(first.buffer, first.byteOffset, first.byteLength) : new Uint8Array(first as ArrayBuffer);
  return bytes.length === 32 ? new Uint8Array(bytes) : null;
}

function ceremonyCode(e: unknown): "cancelled" | "failed" {
  const name = (e as { name?: string } | null)?.name;
  return name === "NotAllowedError" || name === "AbortError" ? "cancelled" : "failed";
}

/**
 * Feature check only (no prompt). Browsers that expose getClientCapabilities answer "extension:prf" directly;
 * otherwise the enable ceremony itself decides.
 */
export async function passkeyPrfKnownUnsupported(): Promise<boolean> {
  try {
    const pk = (globalThis as { PublicKeyCredential?: { getClientCapabilities?: () => Promise<Record<string, boolean>> } }).PublicKeyCredential;
    if (!pk?.getClientCapabilities) return false;
    const caps = await pk.getClientCapabilities();
    return caps["extension:prf"] === false;
  } catch {
    return false;
  }
}

async function putRecord(userId: string, rec: PasskeyUnlockRecord): Promise<void> {
  const name = await passkeyDbName(userId);
  await registerDb(name);
  const db = await openDb(name, (d) => d.createObjectStore(STORE));
  try {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(rec, RECORD_ID);
    await txDone(tx);
  } finally {
    db.close();
  }
}

/** Structured-clone bytes arrive as Uint8Array of the page realm; ArrayBuffer.isView is realm-safe. */
function bytesOf(v: unknown): Uint8Array | null {
  return ArrayBuffer.isView(v) ? new Uint8Array(v.buffer, v.byteOffset, v.byteLength) : null;
}

/** Validates a stored value and returns it with plain Uint8Array fields. Null when malformed. */
function asRecord(v: unknown): PasskeyUnlockRecord | null {
  if (typeof v !== "object" || v === null) return null;
  const r = v as Record<string, unknown>;
  const credentialId = bytesOf(r.credentialId);
  const userHandle = bytesOf(r.userHandle);
  const prfSalt = bytesOf(r.prfSalt);
  const wrapped = bytesOf(r.wrapped);
  if (r.v !== 1 || typeof r.rpId !== "string" || !credentialId || !userHandle || !prfSalt || !wrapped || typeof r.createdAt !== "number") return null;
  return { v: 1, rpId: r.rpId, credentialId, userHandle, prfSalt, wrapped, createdAt: r.createdAt };
}

/** True when the user's passkey database exists (checked without creating it). */
async function passkeyDbExists(name: string): Promise<boolean> {
  if (typeof indexedDB.databases !== "function") return true; // cannot tell: open (and create) below
  return (await indexedDB.databases()).some((d) => d.name === name);
}

/** The stored record, or null. Throws when the stored value is malformed. Never creates the database. */
export async function readPasskeyUnlockRecord(userId: string): Promise<PasskeyUnlockRecord | null> {
  if (!idbSupported()) return null;
  const name = await passkeyDbName(userId);
  if (!(await passkeyDbExists(name))) return null;
  await registerDb(name);
  const db = await openDb(name, (d) => d.createObjectStore(STORE));
  try {
    const stored: unknown = await req(db.transaction(STORE).objectStore(STORE).get(RECORD_ID));
    if (stored === undefined) return null;
    const rec = asRecord(stored);
    if (!rec) throw new Error("stored passkey record has unexpected properties");
    return rec;
  } finally {
    db.close();
  }
}

/**
 * Creates the local credential, derives the PRF output, wraps a fresh unlock secret and stores the wrapped record.
 * Re-enabling replaces the record; the earlier platform credential is not removable from the page (see report).
 * Nothing is stored unless the wrap round-trips with the same PRF output.
 */
export async function enablePasskeyUnlock(userId: string, deps?: PasskeyDeps): Promise<PasskeyResult> {
  const { credentials, rpId } = resolveDeps(deps);
  if (!credentials || !rpId || !idbSupported() || (await passkeyPrfKnownUnsupported())) return { ok: false, code: "unsupported" };

  const userHandle = rand(16);
  const prfSalt = rand(32);
  let created: PublicKeyCredential | null;
  try {
    created = (await credentials.create({
      publicKey: {
        challenge: rand(32),
        rp: { id: rpId, name: RP_NAME },
        user: { id: userHandle, name: "finlynq-on-device", displayName: "Finlynq on-device unlock" },
        pubKeyCredParams: [{ type: "public-key", alg: -7 }, { type: "public-key", alg: -257 }],
        authenticatorSelection: { residentKey: "preferred", userVerification: "required", authenticatorAttachment: "platform" },
        attestation: "none",
        timeout: CEREMONY_TIMEOUT_MS,
        extensions: { prf: {} } as AuthenticationExtensionsClientInputs,
      } as PublicKeyCredentialCreationOptions,
    })) as PublicKeyCredential | null;
  } catch (e) {
    return { ok: false, code: ceremonyCode(e) };
  }
  if (!created) return { ok: false, code: "failed" };
  const createdPrf = (created.getClientExtensionResults() as { prf?: { enabled?: boolean } }).prf;
  if (createdPrf?.enabled === false) return { ok: false, code: "unsupported" };
  const credentialId = new Uint8Array(created.rawId);

  // Many authenticators return PRF results only at get(): one assertion over the new credential, with the salt.
  let prf: Uint8Array | null;
  try {
    const asserted = (await credentials.get({
      publicKey: {
        challenge: rand(32),
        rpId,
        allowCredentials: [{ type: "public-key", id: credentialId as BufferSource }],
        userVerification: "required",
        timeout: CEREMONY_TIMEOUT_MS,
        extensions: { prf: { eval: { first: prfSalt as BufferSource } } } as AuthenticationExtensionsClientInputs,
      } as PublicKeyCredentialRequestOptions,
    })) as PublicKeyCredential | null;
    prf = asserted ? prfFirst(asserted) : null;
  } catch (e) {
    return { ok: false, code: ceremonyCode(e) };
  }
  if (!prf) return { ok: false, code: "unsupported" };

  const wrapKey = await deriveWrapKey(prf, userId);
  const secret = rand(32);
  const aad = recordAad(userId, credentialId);
  const wrapped = await seal(wrapKey, secret, aad);
  const check = await open(wrapKey, wrapped, aad).catch(() => null);
  if (!check || !equalBytes(check, secret)) return { ok: false, code: "failed" };

  await putRecord(userId, { v: 1, rpId, credentialId, userHandle, prfSalt, wrapped, createdAt: Date.now() });
  markEnrolled();
  return { ok: true };
}

/**
 * Passkey assertion (user verification required) over the stored credential, PRF over the stored salt, unwrap.
 * Success keeps the unlock secret in memory for this user. Failure never changes the stored record.
 */
export async function unlockWithPasskey(userId: string, deps?: PasskeyDeps): Promise<PasskeyResult> {
  const { credentials } = resolveDeps(deps);
  if (!credentials || !idbSupported()) return { ok: false, code: "unsupported" };
  let rec: PasskeyUnlockRecord | null;
  try {
    rec = await readPasskeyUnlockRecord(userId);
  } catch {
    return { ok: false, code: "failed" };
  }
  if (!rec) return { ok: false, code: "not_enabled" };

  let prf: Uint8Array | null;
  try {
    const asserted = (await credentials.get({
      publicKey: {
        challenge: rand(32),
        rpId: rec.rpId,
        allowCredentials: [{ type: "public-key", id: rec.credentialId as BufferSource }],
        userVerification: "required",
        timeout: CEREMONY_TIMEOUT_MS,
        extensions: { prf: { eval: { first: rec.prfSalt as BufferSource } } } as AuthenticationExtensionsClientInputs,
      } as PublicKeyCredentialRequestOptions,
    })) as PublicKeyCredential | null;
    prf = asserted ? prfFirst(asserted) : null;
  } catch (e) {
    return { ok: false, code: ceremonyCode(e) };
  }
  if (!prf) return { ok: false, code: "unsupported" };

  try {
    const wrapKey = await deriveWrapKey(prf, userId);
    const secret = await open(wrapKey, rec.wrapped, recordAad(userId, rec.credentialId));
    sessionUnlocked.set(userId, secret);
    return { ok: true };
  } catch (e) {
    if (e instanceof AuthError) return { ok: false, code: "wrong_passkey" };
    return { ok: false, code: "failed" };
  }
}

/**
 * Turns passkey unlock off for this user: deletes the wrap record and clears the in-memory secret.
 * Refused while queued writes exist unless the caller passes confirmed = true (the UI asks first).
 */
export async function disablePasskeyUnlock(userId: string, opts: { unsyncedCount: number; confirmed: boolean }): Promise<PasskeyResult> {
  if (opts.unsyncedCount > 0 && !opts.confirmed) return { ok: false, code: "unsynced_blocked" };
  try {
    await wipePasskeyUnlock(userId);
    return { ok: true };
  } catch {
    return { ok: false, code: "failed" };
  }
}

/** Deletes one user's passkey wrap database and forgets the in-memory secret. Resolves once the database is gone. */
export async function wipePasskeyUnlock(userId: string): Promise<void> {
  clearPasskeyUnlockedSession(userId);
  if (!idbSupported() || !passkeyMayExist()) return; // browsers that never enrolled do no IndexedDB work
  // The enrolled marker is kept: other accounts on this browser may still have a database.
  const name = await passkeyDbName(userId);
  await deleteDb(name);
  await unregisterDb(name);
}

/** Deletes every passkey wrap database on this browser (signed-out boot, password reset). */
export async function wipeAllPasskeyUnlocks(): Promise<void> {
  clearPasskeyUnlockedSession();
  if (!idbSupported() || !passkeyMayExist()) return;
  for (const name of (await allLfDbNames()).filter((n) => n.startsWith(PASSKEY_DB_PREFIX))) {
    await deleteDb(name);
    await unregisterDb(name);
  }
  try {
    window.localStorage.removeItem(PASSKEY_ENROLLED_KEY);
  } catch {
    /* ignore */
  }
}

export interface PasskeyUnlockStatus {
  supported: boolean;
  enabled: boolean;
  createdAt: number | null;
}

export async function getPasskeyUnlockStatus(userId: string, deps?: PasskeyDeps): Promise<PasskeyUnlockStatus> {
  const { credentials, rpId } = resolveDeps(deps);
  const supported = !!credentials && !!rpId && idbSupported() && !(await passkeyPrfKnownUnsupported());
  let rec: PasskeyUnlockRecord | null = null;
  try {
    rec = await readPasskeyUnlockRecord(userId);
  } catch {
    rec = null;
  }
  return { supported, enabled: rec !== null, createdAt: rec?.createdAt ?? null };
}
