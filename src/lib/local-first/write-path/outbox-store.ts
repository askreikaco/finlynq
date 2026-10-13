/**
 * On-device encrypted outbox for offline transaction writes (local-first L3). PROTOTYPE, flag off by default.
 *
 * One database per user: `finlynq-lf-outbox-v1-<sha256(userId) first 8 bytes hex>`, store `entries`:
 *   "<opId>" -> one of
 *     Uint8Array                  single seal:  seal(deviceKey, JSON(entry), aad)
 *     { f: 2, c: Uint8Array }     double seal:  seal(deviceKey, seal(innerKey, JSON(entry), aad), aad)   (passkey on)
 * The layers are described in ../crypto/passkey-seal.ts. AAD binds each record to user, device and opId.
 *
 * Passkey gate: while a passkey record exists, every operation here needs the unlock secret held in this page.
 * Without it each call throws PasskeyLockedError before touching a record: nothing is read, written or deleted.
 * resealLayers is the one exception: it takes its keys explicitly (enrolment, disable, rollback) and is never called
 * from the drain or the UI.
 *
 * An unreadable single record (tamper, wrong key) is skipped and removed, as before. An unreadable double record is
 * skipped and KEPT: it may open again once the passkey is presented.
 * Wiped with the read cache (lock, logout, untrusted device, opt-out): see wipeOutboxUser and wipeAll.
 */
import { open, seal } from "../crypto/aead";
import { deviceKeys } from "../crypto/device-key-provider";
import { innerKeyFor, sealLayers } from "../crypto/passkey-seal";
import { allLfDbNames, deleteDb, idbSupported, LF_DB_PREFIX, openDb, registerDb, req, txDone, unregisterDb, userDbSuffix } from "../storage/db-registry";
import { withUserLock } from "../storage/user-lock";
import type { OutboxEntry } from "./types";

export const OUTBOX_DB_PREFIX = `${LF_DB_PREFIX}outbox-v1-`;
const STORE = "entries";
const AAD_PREFIX = "finlynq-lf-outbox|v1";
const enc = new TextEncoder();
const dec = new TextDecoder();

export async function outboxDbName(userId: string): Promise<string> {
  return OUTBOX_DB_PREFIX + (await userDbSuffix(userId));
}

const aad = (userId: string, deviceId: string, opId: string): Uint8Array => enc.encode(`${AAD_PREFIX}|${userId}|${deviceId}|${opId}`);

async function openOutbox(userId: string): Promise<IDBDatabase> {
  const name = await outboxDbName(userId);
  await registerDb(name);
  return openDb(name, (db) => db.createObjectStore(STORE));
}

/** Records that could not be re-sealed. Thrown before any write: the store is unchanged. */
export class ResealError extends Error {
  constructor(readonly failed: number) {
    super(`${failed} offline record(s) could not be re-sealed`);
    this.name = "ResealError";
  }
}

export interface RotateOutboxResult {
  /** Whether a key rotation happened now (false when there was no key yet, so nothing to rotate). */
  rotated: boolean;
  /** Records re-sealed from the previous key to the current one. */
  resealed: number;
  /** Records no key could open (damaged); removed, as a normal list() does. */
  dropped: number;
}

export interface ResealOptions {
  /** Inner key that opens double records. Required when any record is double. */
  fromInner: CryptoKey | null;
  /** Inner key to seal with. null = single seal (disable). */
  toInner: CryptoKey | null;
  /** Runs inside the outbox lock after every record has been written. Used as the flip (flag, record deletion). */
  commit?: () => Promise<void>;
}

export interface ResealReport {
  rewritten: number;
  unchanged: number;
}

export interface OutboxStore {
  put(entry: OutboxEntry): Promise<void>;
  remove(opId: string): Promise<void>;
  /** All readable entries, oldest first (createdAt, then opId). */
  list(): Promise<OutboxEntry[]>;
  /**
   * Rotates the on-device key and re-seals every queued entry under it, all under the outbox lock so no write can
   * interleave. The old key is dropped only after every entry opens under the new one. A crash at any point leaves
   * every entry readable (current + previous key); the next call finishes the sweep. Returns rotated:false when
   * the device has no key yet. Double records get their OUTER layer re-sealed only; the inner ciphertext is untouched.
   */
  rotateKeys(): Promise<RotateOutboxResult>;
  /** Finishes an interrupted rotation sweep (no-op when none is pending). */
  finishPendingSweep(): Promise<RotateOutboxResult>;
  /**
   * Re-seals every record to the target layer count in ONE transaction (all or nothing), then runs `commit`. Throws
   * ResealError (nothing written) when a record cannot be opened. Used by passkey enrolment, disable and rollback.
   */
  resealLayers(opts: ResealOptions): Promise<ResealReport>;
}

const lockName = (userId: string) => `finlynq-lf-outbox-lock|${userId}`;

/** Stored value: a bare outer-sealed Uint8Array (single) or { f: 2, c } (double). */
type Stored = Uint8Array | { f: 2; c: Uint8Array };

function viewBytes(v: unknown): Uint8Array | null {
  return ArrayBuffer.isView(v) ? new Uint8Array(v.buffer, v.byteOffset, v.byteLength) : null;
}

/** Layer form of a stored value. body = the bytes under the device key (single: the entry; double: the inner ciphertext). */
function parseStored(v: unknown): { double: boolean; body: Uint8Array } | null {
  const single = viewBytes(v);
  if (single) return { double: false, body: single };
  if (typeof v === "object" && v !== null && (v as { f?: unknown }).f === 2) {
    const c = viewBytes((v as { c?: unknown }).c);
    if (c) return { double: true, body: c };
  }
  return null;
}

function encodeStored(double: boolean, sealed: Uint8Array): Stored {
  return double ? { f: 2, c: sealed } : sealed;
}

/** Opens the device-key layer with the current key first, then the previous one. keyIndex 0 = current. */
async function unsealOuter(keys: CryptoKey[], body: Uint8Array, a: Uint8Array): Promise<{ body: Uint8Array; keyIndex: number } | null> {
  for (let i = 0; i < keys.length; i++) {
    try {
      return { body: await open(keys[i], body, a), keyIndex: i };
    } catch {
      // try the next key
    }
  }
  return null;
}

/** Entry plaintext bytes, or null. Single: the outer body. Double: needs the inner key. */
async function plainOf(parsed: { double: boolean }, body: Uint8Array, inner: CryptoKey | null, a: Uint8Array): Promise<Uint8Array | null> {
  if (!parsed.double) return body;
  if (!inner) return null;
  try {
    return await open(inner, body, a);
  } catch {
    return null;
  }
}

/** The entry if the plaintext is JSON whose opId matches the record key. */
function entryOf(plain: Uint8Array, opId: string): OutboxEntry | null {
  try {
    const e = JSON.parse(dec.decode(plain)) as OutboxEntry;
    return e.opId === opId ? e : null;
  } catch {
    return null;
  }
}

export async function countOutboxRecords(userId: string): Promise<number> {
  if (!idbSupported()) return 0;
  const db = await openOutbox(userId);
  try {
    return await req(db.transaction(STORE).objectStore(STORE).count());
  } finally {
    db.close();
  }
}

/** Encrypted IndexedDB outbox for one (user, device). Throws when IndexedDB/WebCrypto is unavailable. */
export function createOutboxStore(userId: string, deviceId: string): OutboxStore {
  if (!idbSupported()) throw new Error("IndexedDB or WebCrypto is not available");
  const locked = <T>(fn: () => Promise<T>) => withUserLock(lockName(userId), fn);
  const a = (opId: string) => aad(userId, deviceId, opId);
  /** Inside the lock. Throws PasskeyLockedError while locked; null when no passkey record exists. */
  const gate = () => innerKeyFor(userId, "outbox");

  /** Reads and decrypts everything; re-seals records only the previous key opens; removes records no key opens. */
  async function sweep(inner: CryptoKey | null): Promise<{ resealed: number; dropped: number; entries: OutboxEntry[]; hadPrevious: boolean }> {
    const ring = await deviceKeys.findKeyring(userId);
    const keys = [ring.current, ring.previous].filter((k): k is CryptoKey => k !== null);
    const db = await openOutbox(userId);
    const entries: OutboxEntry[] = [];
    const reseal = new Map<string, Stored>();
    const bad: string[] = [];
    try {
      const store = db.transaction(STORE).objectStore(STORE);
      const [recKeys, recValues] = await Promise.all([req(store.getAllKeys()), req(store.getAll())]);
      for (let i = 0; i < recKeys.length; i++) {
        const opId = String(recKeys[i]);
        const parsed = parseStored(recValues[i]);
        const opened = parsed && keys.length > 0 ? await unsealOuter(keys, parsed.body, a(opId)) : null;
        if (!parsed || !opened) {
          if (!parsed || !parsed.double) bad.push(opId); // a double record is kept
          continue;
        }
        const plain = await plainOf(parsed, opened.body, inner, a(opId));
        const entry = plain ? entryOf(plain, opId) : null;
        if (!entry && !parsed.double) {
          bad.push(opId);
          continue;
        }
        if (entry) entries.push(entry);
        // keyIndex 0 is the current key. Index 1 (previous) must move to the current key: outer layer only.
        if (opened.keyIndex > 0 && ring.current) {
          reseal.set(opId, encodeStored(parsed.double, await seal(ring.current, opened.body, a(opId))));
        }
      }
      if (reseal.size > 0 || bad.length > 0) {
        const tx = db.transaction(STORE, "readwrite");
        for (const [opId, v] of reseal) tx.objectStore(STORE).put(v, opId);
        for (const k of bad) tx.objectStore(STORE).delete(k);
        await txDone(tx);
      }
    } finally {
      db.close();
    }
    return { resealed: reseal.size, dropped: bad.length, entries, hadPrevious: ring.previous !== null };
  }

  /** The previous key is dropped only after a sweep that wrote everything it needed to. */
  async function sweepAndSettle(inner: CryptoKey | null): Promise<{ resealed: number; dropped: number; entries: OutboxEntry[] }> {
    const r = await sweep(inner);
    if (r.hadPrevious) await deviceKeys.dropPreviousKey(userId);
    return r;
  }

  return {
    put: (entry) =>
      locked(async () => {
        const inner = await gate();
        const key = await deviceKeys.getOrCreateDeviceKey(userId);
        const sealed = await sealLayers(key, inner, enc.encode(JSON.stringify(entry)), a(entry.opId));
        const db = await openOutbox(userId);
        try {
          const tx = db.transaction(STORE, "readwrite");
          tx.objectStore(STORE).put(encodeStored(inner !== null, sealed), entry.opId);
          await txDone(tx);
        } finally {
          db.close();
        }
      }),
    remove: (opId) =>
      locked(async () => {
        await gate();
        const db = await openOutbox(userId);
        try {
          const tx = db.transaction(STORE, "readwrite");
          tx.objectStore(STORE).delete(opId);
          await txDone(tx);
        } finally {
          db.close();
        }
      }),
    list: () =>
      locked(async () => {
        const inner = await gate();
        // A finished-but-unsettled rotation (previous key still held) is completed here, so the previous key never lingers.
        const { entries } = await sweepAndSettle(inner);
        return entries.sort((x, y) => x.createdAt - y.createdAt || (x.opId < y.opId ? -1 : 1));
      }),
    rotateKeys: () =>
      locked(async () => {
        const inner = await gate();
        const pending = await deviceKeys.findKeyring(userId);
        if (pending.previous) await sweepAndSettle(inner); // finish an earlier interrupted rotation first
        const ring = await deviceKeys.rotateDeviceKey(userId);
        if (!ring) return { rotated: false, resealed: 0, dropped: 0 };
        const r = await sweepAndSettle(inner);
        return { rotated: true, resealed: r.resealed, dropped: r.dropped };
      }),
    finishPendingSweep: () =>
      locked(async () => {
        const inner = await gate();
        const ring = await deviceKeys.findKeyring(userId);
        if (!ring.previous) return { rotated: false, resealed: 0, dropped: 0 };
        const r = await sweepAndSettle(inner);
        return { rotated: false, resealed: r.resealed, dropped: r.dropped };
      }),
    resealLayers: (opts) =>
      locked(async () => {
        const ring = await deviceKeys.findKeyring(userId);
        const keys = [ring.current, ring.previous].filter((k): k is CryptoKey => k !== null);
        const db = await openOutbox(userId);
        const writes = new Map<string, Stored>();
        let failed = 0;
        let unchanged = 0;
        try {
          const store = db.transaction(STORE).objectStore(STORE);
          const [recKeys, recValues] = await Promise.all([req(store.getAllKeys()), req(store.getAll())]);
          for (let i = 0; i < recKeys.length; i++) {
            const opId = String(recKeys[i]);
            const parsed = parseStored(recValues[i]);
            const opened = parsed && keys.length > 0 ? await unsealOuter(keys, parsed.body, a(opId)) : null;
            if (!parsed || !opened || !ring.current) {
              failed++;
              continue;
            }
            const plain = await plainOf(parsed, opened.body, opts.fromInner, a(opId));
            if (!plain || !entryOf(plain, opId)) {
              failed++;
              continue;
            }
            const inTarget = opts.toInner !== null ? parsed.double : !parsed.double;
            if (inTarget && opened.keyIndex === 0) {
              unchanged++;
              continue;
            }
            writes.set(opId, encodeStored(opts.toInner !== null, await sealLayers(ring.current, opts.toInner, plain, a(opId))));
          }
          if (failed > 0) throw new ResealError(failed);
          if (writes.size > 0) {
            const tx = db.transaction(STORE, "readwrite");
            for (const [opId, v] of writes) tx.objectStore(STORE).put(v, opId);
            await txDone(tx);
          }
        } finally {
          db.close();
        }
        if (opts.commit) await opts.commit();
        return { rewritten: writes.size, unchanged };
      }),
  };
}

/** Deletes this user's outbox database (queued, unsent writes are lost). Rejects if blocked. */
export async function wipeOutboxUser(userId: string): Promise<void> {
  if (!idbSupported()) return;
  const name = await outboxDbName(userId);
  await deleteDb(name);
  await unregisterDb(name);
}

/** Deletes every outbox database on this browser (write opt-out, sign-out). Rejects if any delete fails. */
export async function wipeAllOutboxes(): Promise<void> {
  if (!idbSupported()) return;
  const failed: string[] = [];
  for (const n of (await allLfDbNames()).filter((x) => x.startsWith(OUTBOX_DB_PREFIX))) {
    try {
      await deleteDb(n);
      await unregisterDb(n);
    } catch {
      failed.push(n);
    }
  }
  if (failed.length > 0) throw new Error(`wipeAllOutboxes incomplete (${failed.length} failed)`);
}

