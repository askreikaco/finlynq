/**
 * On-device encrypted outbox for offline transaction writes (local-first L3). PROTOTYPE, flag off by default.
 *
 * One database per user: `finlynq-lf-outbox-v1-<sha256(userId) first 8 bytes hex>`, store `entries`:
 *   "<opId>" -> AES-GCM sealed JSON of the OutboxEntry (device key from device-key-provider.ts, non-extractable).
 * AAD binds each record to user, device and opId, so a record cannot be moved between users, devices or keys.
 * An unreadable record (tamper, wrong key) is skipped and removed; the rest of the outbox stays usable.
 * Wiped with the read cache (lock, logout, untrusted device, opt-out): see wipeOutboxUser and wipeAll.
 */
import { AuthError, open, seal } from "../crypto/aead";
import { deviceKeys } from "../crypto/device-key-provider";
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

export interface RotateOutboxResult {
  /** Whether a key rotation happened now (false when there was no key yet, so nothing to rotate). */
  rotated: boolean;
  /** Records re-sealed from the previous key to the current one. */
  resealed: number;
  /** Records no key could open (damaged); removed, as a normal list() does. */
  dropped: number;
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
   * the device has no key yet.
   */
  rotateKeys(): Promise<RotateOutboxResult>;
  /** Finishes an interrupted rotation sweep (no-op when none is pending). */
  finishPendingSweep(): Promise<RotateOutboxResult>;
}

const lockName = (userId: string) => `finlynq-lf-outbox-lock|${userId}`;

async function openEntry(keys: CryptoKey[], v: unknown, userId: string, deviceId: string, opId: string): Promise<{ entry: OutboxEntry; keyIndex: number } | null> {
  if (!ArrayBuffer.isView(v)) return null;
  const bytes = new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
  for (let i = 0; i < keys.length; i++) {
    try {
      const plain = await open(keys[i], bytes, aad(userId, deviceId, opId));
      const e = JSON.parse(dec.decode(plain)) as OutboxEntry;
      if (e.opId !== opId) return null;
      return { entry: e, keyIndex: i };
    } catch {
      // try the next key
    }
  }
  return null;
}

/** Encrypted IndexedDB outbox for one (user, device). Throws when IndexedDB/WebCrypto is unavailable. */
export function createOutboxStore(userId: string, deviceId: string): OutboxStore {
  if (!idbSupported()) throw new Error("IndexedDB or WebCrypto is not available");
  const locked = <T>(fn: () => Promise<T>) => withUserLock(lockName(userId), fn);

  /** Reads and decrypts everything; re-seals records only the previous key opens; removes records no key opens. */
  async function sweep(): Promise<{ resealed: number; dropped: number; entries: OutboxEntry[]; hadPrevious: boolean }> {
    const ring = await deviceKeys.findKeyring(userId);
    const keys = [ring.current, ring.previous].filter((k): k is CryptoKey => k !== null);
    const db = await openOutbox(userId);
    const entries: OutboxEntry[] = [];
    const reseal = new Map<string, Uint8Array>();
    const bad: string[] = [];
    try {
      const store = db.transaction(STORE).objectStore(STORE);
      const [recKeys, recValues] = await Promise.all([req(store.getAllKeys()), req(store.getAll())]);
      for (let i = 0; i < recKeys.length; i++) {
        const opId = String(recKeys[i]);
        const found = keys.length > 0 ? await openEntry(keys, recValues[i], userId, deviceId, opId) : null;
        if (!found) {
          bad.push(opId);
          continue;
        }
        entries.push(found.entry);
        // keyIndex 0 is the current key. Index 1 (previous) must move to the current key.
        if (found.keyIndex > 0 && ring.current) reseal.set(opId, await seal(ring.current, enc.encode(JSON.stringify(found.entry)), aad(userId, deviceId, opId)));
      }
      if (reseal.size > 0 || bad.length > 0) {
        const tx = db.transaction(STORE, "readwrite");
        for (const [opId, sealed] of reseal) tx.objectStore(STORE).put(sealed, opId);
        for (const k of bad) tx.objectStore(STORE).delete(k);
        await txDone(tx);
      }
    } finally {
      db.close();
    }
    return { resealed: reseal.size, dropped: bad.length, entries, hadPrevious: ring.previous !== null };
  }

  /** The previous key is dropped only after a sweep that wrote everything it needed to. */
  async function sweepAndSettle(): Promise<{ resealed: number; dropped: number; entries: OutboxEntry[] }> {
    const r = await sweep();
    if (r.hadPrevious) await deviceKeys.dropPreviousKey(userId);
    return r;
  }

  return {
    put: (entry) =>
      locked(async () => {
        const key = await deviceKeys.getOrCreateDeviceKey(userId);
        const sealed = await seal(key, enc.encode(JSON.stringify(entry)), aad(userId, deviceId, entry.opId));
        const db = await openOutbox(userId);
        try {
          const tx = db.transaction(STORE, "readwrite");
          tx.objectStore(STORE).put(sealed, entry.opId);
          await txDone(tx);
        } finally {
          db.close();
        }
      }),
    remove: (opId) =>
      locked(async () => {
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
        // A finished-but-unsettled rotation (previous key still held) is completed here, so the previous key never lingers.
        const { entries } = await sweepAndSettle();
        return entries.sort((a, b) => a.createdAt - b.createdAt || (a.opId < b.opId ? -1 : 1));
      }),
    rotateKeys: () =>
      locked(async () => {
        const pending = await deviceKeys.findKeyring(userId);
        if (pending.previous) await sweepAndSettle(); // finish an earlier interrupted rotation first
        const ring = await deviceKeys.rotateDeviceKey(userId);
        if (!ring) return { rotated: false, resealed: 0, dropped: 0 };
        const r = await sweepAndSettle();
        return { rotated: true, resealed: r.resealed, dropped: r.dropped };
      }),
    finishPendingSweep: () =>
      locked(async () => {
        const ring = await deviceKeys.findKeyring(userId);
        if (!ring.previous) return { rotated: false, resealed: 0, dropped: 0 };
        const r = await sweepAndSettle();
        return { rotated: false, resealed: r.resealed, dropped: r.dropped };
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
