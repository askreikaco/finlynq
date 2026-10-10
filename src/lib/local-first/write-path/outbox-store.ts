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

export interface OutboxStore {
  put(entry: OutboxEntry): Promise<void>;
  remove(opId: string): Promise<void>;
  /** All readable entries, oldest first (createdAt, then opId). */
  list(): Promise<OutboxEntry[]>;
}

/** Encrypted IndexedDB outbox for one (user, device). Throws when IndexedDB/WebCrypto is unavailable. */
export function createOutboxStore(userId: string, deviceId: string): OutboxStore {
  if (!idbSupported()) throw new Error("IndexedDB or WebCrypto is not available");
  return {
    async put(entry) {
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
    },
    async remove(opId) {
      const db = await openOutbox(userId);
      try {
        const tx = db.transaction(STORE, "readwrite");
        tx.objectStore(STORE).delete(opId);
        await txDone(tx);
      } finally {
        db.close();
      }
    },
    async list() {
      const key = await deviceKeys.findDeviceKey(userId);
      const db = await openOutbox(userId);
      const out: OutboxEntry[] = [];
      const bad: string[] = [];
      try {
        const store = db.transaction(STORE).objectStore(STORE);
        const [keys, values] = await Promise.all([req(store.getAllKeys()), req(store.getAll())]);
        for (let i = 0; i < keys.length; i++) {
          const opId = String(keys[i]);
          const v: unknown = values[i];
          try {
            if (!key || !ArrayBuffer.isView(v)) throw new AuthError();
            const bytes = await open(key, new Uint8Array(v.buffer, v.byteOffset, v.byteLength), aad(userId, deviceId, opId));
            const e = JSON.parse(dec.decode(bytes)) as OutboxEntry;
            if (e.opId !== opId) throw new AuthError();
            out.push(e);
          } catch {
            bad.push(opId);
          }
        }
        if (bad.length > 0) {
          const tx = db.transaction(STORE, "readwrite");
          for (const k of bad) tx.objectStore(STORE).delete(k);
          await txDone(tx).catch(() => undefined);
        }
      } finally {
        db.close();
      }
      return out.sort((a, b) => a.createdAt - b.createdAt || (a.opId < b.opId ? -1 : 1));
    },
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
