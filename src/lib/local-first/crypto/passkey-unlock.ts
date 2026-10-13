/**
 * Passkey unlock for the ON-DEVICE offline data (local-first). PROTOTYPE, unreviewed. Flag: localStorage
 * "finlynq.lf.passkey" === "1" (off by default, per browser). The flag gates the Settings card; the sealing gate below
 * keys off the stored passkey RECORD, so a browser that has enrolled stays locked whatever the flag says.
 *
 * What it is:
 *  - A LOCAL-ONLY WebAuthn credential (platform authenticator, PRF extension). Never registered with the server,
 *    never sent anywhere, no fetch. It does not replace server auth and does NOT unlock the server DEK.
 *  - A random 32-byte "unlock secret", AES-GCM-wrapped under a key derived (HKDF-SHA-256) from the PRF output.
 *    Stored in its own IndexedDB database (one per user) as the wrapped bytes + credential id + PRF salt + rp id.
 *  - Unlock = a passkey assertion with user verification; PRF output -> wrap key -> unwrap. On success the unlock
 *    secret is kept in memory only (per user, this page session) until a lock, a wipe or a page reload.
 *  - While the record exists the unlock secret seals a second layer over the offline outbox and snapshot
 *    (see passkey-seal.ts). Enrolment, re-seal and disable live in passkey-lifecycle.ts.
 *
 * Never stored: the PRF output, the password, the DEK, the unlock secret in plaintext.
 * Credential: residentKey "discouraged". Unlock always passes allowCredentials, so no discoverable key is needed.
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
  | "unsynced_blocked"
  | "already_enabled"
  | "untrusted"
  | "offline_off";

export type PasskeyResult =
  | { ok: true; rewritten?: number }
  | { ok: false; code: Exclude<PasskeyCode, "ok">; /** Records that could not be re-sealed (enrolment aborted). */ failed?: number };

export interface PasskeyUnlockRecord {
  v: 1;
  rpId: string;
  credentialId: Uint8Array;
  userHandle: Uint8Array;
  prfSalt: Uint8Array;
  /** seal() output: nonce || ciphertext || tag, of the 32-byte unlock secret. */
  wrapped: Uint8Array;
  createdAt: number;
  /** The trusted device the offline copy belongs to (AAD of its records). Stored so unlock needs no network. */
  deviceId?: string;
  /**
   * false while the outbox may still hold single-sealed records (enrolment in progress, or interrupted). Absent = true.
   * Reads still work for both forms; unlock finishes the re-seal when this is false.
   */
  sealed?: boolean;
}

export interface PasskeyDeps {
  /** Defaults to navigator.credentials. Tests inject a fake. */
  credentials?: Pick<CredentialsContainer, "create" | "get">;
  /** Defaults to location.hostname. Must match the origin the page runs on. */
  rpId?: string;
}

/**
 * Thrown by every on-device offline operation (outbox, snapshot) while a passkey record exists and this page holds no
 * unlock secret. Callers treat it as "locked": nothing is read, deleted or written.
 */
export class PasskeyLockedError extends Error {
  constructor() {
    super("offline data is locked: unlock with passkey");
    this.name = "PasskeyLockedError";
  }
}

export function isPasskeyLockedError(e: unknown): boolean {
  return e instanceof PasskeyLockedError || (typeof e === "object" && e !== null && (e as { name?: unknown }).name === "PasskeyLockedError");
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
    /* storage blocked: the wipe may then miss a leftover database; the record still gates unlock */
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
/**
 * Last known "does a passkey record exist" per user (true/false). A hint for UI and for the page-side persist gates:
 * the authoritative check is the read inside each on-device operation. Absent = not read yet on this page.
 */
const enrolledHint = new Map<string, boolean>();
const lockListeners = new Set<() => void>();
const unlockListeners = new Set<() => void>();

function emitLock(userId?: string, enrolled?: boolean): void {
  if (userId !== undefined && enrolled !== undefined) enrolledHint.set(userId, enrolled);
  for (const l of lockListeners) l();
}

/** Called after every change of the lock state (enrol, unlock, lock, disable, wipe). */
export function onPasskeyLockChange(listener: () => void): () => void {
  lockListeners.add(listener);
  return () => {
    lockListeners.delete(listener);
  };
}

/** Called only after a successful passkey unlock on this page (not after enrolment or a refresh). */
export function onPasskeyUnlocked(listener: () => void): () => void {
  unlockListeners.add(listener);
  return () => {
    unlockListeners.delete(listener);
  };
}

export function hasPasskeyUnlockedSession(userId: string): boolean {
  return sessionUnlocked.has(userId);
}

/** The in-memory unlock secret for this user, or null. For the local-first crypto layer only. */
export function unlockSecretFor(userId: string): Uint8Array | null {
  return sessionUnlocked.get(userId) ?? null;
}

/** Enrolled (true), not enrolled (false), or undefined when not read yet on this page. */
export function passkeyEnrolledHint(userId: string): boolean | undefined {
  return enrolledHint.get(userId);
}

/** True when a passkey record exists for this user and this page holds no unlock secret (hint-based, sync). */
export function passkeyLockedNow(userId: string): boolean {
  return enrolledHint.get(userId) === true && !sessionUnlocked.has(userId);
}

/**
 * True unless the user is known to have no passkey record. Persist gates (the SWR cache) use it: until the first
 * refresh on this page, nothing is written to disk for an unknown user.
 */
export function passkeyPersistBlocked(userId: string): boolean {
  return enrolledHint.get(userId) !== false;
}

/** Reads the record and updates the hint. A malformed record counts as enrolled (fail closed). */
export async function refreshPasskeyLock(userId: string): Promise<boolean> {
  let enrolled: boolean;
  try {
    enrolled = (await readPasskeyUnlockRecord(userId)) !== null;
  } catch {
    enrolled = true;
  }
  emitLock(userId, enrolled);
  return enrolled;
}

function setUnlocked(userId: string, secret: Uint8Array): void {
  sessionUnlocked.set(userId, secret);
  emitLock(userId, true);
}

export function clearPasskeyUnlockedSession(userId?: string): void {
  if (userId === undefined) sessionUnlocked.clear();
  else sessionUnlocked.delete(userId);
  emitLock();
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
  const rec: PasskeyUnlockRecord = { v: 1, rpId: r.rpId, credentialId, userHandle, prfSalt, wrapped, createdAt: r.createdAt };
  if (typeof r.sealed === "boolean") rec.sealed = r.sealed;
  if (typeof r.deviceId === "string" && r.deviceId !== "") rec.deviceId = r.deviceId;
  return rec;
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
 * Sets the record's `sealed` flag. Used as the commit step of a re-seal (passkey-lifecycle.ts), never on its own.
 */
export async function setRecordSealed(userId: string, sealed: boolean): Promise<void> {
  const rec = await readPasskeyUnlockRecord(userId);
  if (!rec) throw new Error("no passkey record to update");
  await putRecord(userId, { ...rec, sealed });
}

/**
 * Creates the local credential, derives the PRF output, wraps a fresh unlock secret and stores the wrapped record,
 * with sealed = false. This is the RECORD step only: it does not touch the outbox or the snapshot. Callers use
 * enrollPasskeySeal (passkey-lifecycle.ts), which re-seals the data and then sets sealed = true.
 * Refused when a record already exists. Nothing is stored unless the wrap round-trips with the same PRF output.
 */
export async function enablePasskeyUnlock(userId: string, deps?: PasskeyDeps, deviceId?: string): Promise<PasskeyResult> {
  const { credentials, rpId } = resolveDeps(deps);
  if (!credentials || !rpId || !idbSupported() || (await passkeyPrfKnownUnsupported())) return { ok: false, code: "unsupported" };
  let existing: PasskeyUnlockRecord | null;
  try {
    existing = await readPasskeyUnlockRecord(userId);
  } catch {
    return { ok: false, code: "already_enabled" };
  }
  if (existing) return { ok: false, code: "already_enabled" };

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
        // discouraged: unlock always passes allowCredentials, so a discoverable key would only add a passkey-picker entry.
        authenticatorSelection: { residentKey: "discouraged", userVerification: "required", authenticatorAttachment: "platform" },
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

  await putRecord(userId, {
    v: 1,
    rpId,
    credentialId,
    userHandle,
    prfSalt,
    wrapped,
    createdAt: Date.now(),
    sealed: false,
    ...(deviceId ? { deviceId } : {}),
  });
  markEnrolled();
  setUnlocked(userId, secret);
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
    setUnlocked(userId, secret);
    for (const l of unlockListeners) l();
    return { ok: true };
  } catch (e) {
    if (e instanceof AuthError) return { ok: false, code: "wrong_passkey" };
    return { ok: false, code: "failed" };
  }
}

/**
 * RECORD step of turning passkey unlock off: deletes the wrap record and clears the in-memory secret. It does NOT re-seal
 * the outbox. Callers must re-seal first (passkey-lifecycle.ts disablePasskeySeal). Refused while queued writes exist
 * unless the caller passes confirmed = true (the UI asks first).
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
  enrolledHint.set(userId, false);
  emitLock();
  if (!idbSupported() || !passkeyMayExist()) return; // browsers that never enrolled do no IndexedDB work
  // The enrolled marker is kept: other accounts on this browser may still have a database.
  const name = await passkeyDbName(userId);
  await deleteDb(name);
  await unregisterDb(name);
}

/** Deletes every passkey wrap database on this browser (signed-out boot, password reset, offline mode off). */
export async function wipeAllPasskeyUnlocks(): Promise<void> {
  clearPasskeyUnlockedSession();
  for (const k of [...enrolledHint.keys()]) enrolledHint.set(k, false);
  emitLock();
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
