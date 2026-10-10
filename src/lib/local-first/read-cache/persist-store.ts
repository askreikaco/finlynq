/**
 * On-device, encrypted store for the read-cache snapshot (local-first L2b). PROTOTYPE, unreviewed.
 * Not wired into any page, session or hook yet.
 *
 * Layout, one database per user: `finlynq-lf-v1-<sha256(userId) first 8 bytes hex>`
 *   meta  : "current" -> { snapshotId, createdAt }   (the only pointer; plaintext metadata)
 *   blobs : "<snapshotId>|<seq 8 digits>" -> sealed bytes (seq 0 = manifest, 1..n = chunks)
 * The device key lives in its own database (device-key-provider.ts).
 *
 * Crash safety: save writes the new blobs (tx 1), switches the pointer (tx 2), then deletes every
 * blob outside the new snapshot (tx 3, best effort). A crash before tx 2 leaves the previous snapshot
 * current and readable. Blobs left behind are removed by the next successful save.
 *
 * Any failure while loading (missing blob, bit flip, wrong user, device, build or schemaVer) wipes
 * that user's database and returns null. The caller then has no snapshot and re-hydrates from the APIs.
 */
import { deviceKeys, type DeviceKeyProvider } from "../crypto/device-key-provider";
import {
  allLfDbNames,
  deleteDb,
  deleteRegistry,
  idbSupported,
  LF_DB_PREFIX,
  openDb,
  registerDb,
  req,
  txDone,
  unregisterDb,
  userDbSuffix,
} from "../storage/db-registry";
import { decodeSnapshot, encodeSnapshot, type SnapshotRows } from "./snapshot-codec";

export const READ_CACHE_DB_PREFIX = `${LF_DB_PREFIX}v1-`;
const META = "meta";
const BLOBS = "blobs";
const CURRENT = "current";

export interface SnapshotStoreContext {
  build: string;
  schemaVer: number;
}

export interface SaveSnapshotContext extends SnapshotStoreContext {
  serverWatermark?: string | null;
  now?: () => number;
}

interface Pointer {
  snapshotId: string;
  createdAt: number;
}

export async function readCacheDbName(userId: string): Promise<string> {
  return READ_CACHE_DB_PREFIX + (await userDbSuffix(userId));
}

function blobKey(snapshotId: string, seq: number): string {
  return `${snapshotId}|${String(seq).padStart(8, "0")}`;
}

function isPointer(v: unknown): v is Pointer {
  if (typeof v !== "object" || v === null) return false;
  const p = v as Record<string, unknown>;
  return typeof p.snapshotId === "string" && p.snapshotId.length > 0 && typeof p.createdAt === "number" && Number.isFinite(p.createdAt);
}

async function openUserDb(name: string): Promise<IDBDatabase> {
  await registerDb(name);
  return openDb(name, (db) => {
    db.createObjectStore(META);
    db.createObjectStore(BLOBS);
  });
}

async function readPointer(db: IDBDatabase): Promise<Pointer | null> {
  const v: unknown = await req(db.transaction(META).objectStore(META).get(CURRENT));
  if (v === undefined) return null;
  if (!isPointer(v)) throw new Error("malformed snapshot pointer");
  return v;
}

/** The snapshot's blobs in seq order. Rejects if the stored keys are not exactly seq 0..n-1 (a gap is a tamper signal). */
async function readBlobs(db: IDBDatabase, snapshotId: string): Promise<Uint8Array[]> {
  const store = db.transaction(BLOBS).objectStore(BLOBS);
  const range = IDBKeyRange.bound(`${snapshotId}|`, `${snapshotId}|￿`);
  const [keys, values] = await Promise.all([req(store.getAllKeys(range)), req(store.getAll(range))]);
  return values.map((v, i) => {
    // ArrayBuffer.isView, not instanceof: bytes from IndexedDB or TextEncoder can come from another realm (jsdom).
    if (keys[i] !== blobKey(snapshotId, i) || !ArrayBuffer.isView(v)) throw new Error("snapshot blob missing or out of place");
    return new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
  });
}

/** Writes the new generation, then switches the pointer in one transaction. Aborts the pointer tx on failure. */
async function switchPointer(db: IDBDatabase, pointer: Pointer): Promise<void> {
  const tx = db.transaction(META, "readwrite");
  try {
    tx.objectStore(META).put(pointer, CURRENT);
  } catch (e) {
    try {
      tx.abort();
    } catch {
      // already finished
    }
    throw e;
  }
  await txDone(tx);
}

/** Deletes every blob that does not belong to `keep`. Two transactions: list, then delete. */
async function pruneOthers(db: IDBDatabase, keep: string): Promise<void> {
  const prefix = `${keep}|`;
  const keys = await req(db.transaction(BLOBS).objectStore(BLOBS).getAllKeys());
  const doomed = keys.filter((k) => !String(k).startsWith(prefix));
  if (doomed.length === 0) return;
  const tx = db.transaction(BLOBS, "readwrite");
  const store = tx.objectStore(BLOBS);
  for (const k of doomed) store.delete(k);
  await txDone(tx);
}

/** Seals `rows` under the device key and makes them the current snapshot for this user. */
export async function saveSnapshot(
  userId: string,
  deviceId: string,
  rows: SnapshotRows,
  ctx: SaveSnapshotContext,
): Promise<void> {
  if (!idbSupported()) return;
  const key = await deviceKeys.getOrCreateDeviceKey(userId);
  const sealed = await encodeSnapshot(rows, {
    key,
    userId,
    deviceId,
    build: ctx.build,
    schemaVer: ctx.schemaVer,
    serverWatermark: ctx.serverWatermark,
    now: ctx.now,
  });
  const name = await readCacheDbName(userId);
  const db = await openUserDb(name);
  try {
    const tx = db.transaction(BLOBS, "readwrite");
    const store = tx.objectStore(BLOBS);
    [sealed.manifestBlob, ...sealed.chunkBlobs].forEach((blob, seq) => store.put(blob, blobKey(sealed.snapshotId, seq)));
    await txDone(tx);

    await switchPointer(db, { snapshotId: sealed.snapshotId, createdAt: sealed.createdAt });

    await pruneOthers(db, sealed.snapshotId).catch(() => {
      // Best effort: the new snapshot is already current. The next save prunes again.
    });
  } finally {
    db.close();
  }
}

async function loadInner(userId: string, deviceId: string, ctx: SnapshotStoreContext, keys: DeviceKeyProvider): Promise<SnapshotRows | null> {
  const key = await keys.findDeviceKey(userId);
  if (!key) {
    // No key means no snapshot can be read: drop the (empty) key database as well.
    await keys.deleteDeviceKey(userId);
    throw new Error("no device key for this user");
  }
  const db = await openUserDb(await readCacheDbName(userId));
  try {
    const pointer = await readPointer(db);
    if (!pointer) return null;
    const blobs = await readBlobs(db, pointer.snapshotId);
    return await decodeSnapshot(blobs, {
      key,
      userId,
      deviceId,
      build: ctx.build,
      schemaVer: ctx.schemaVer,
      snapshotId: pointer.snapshotId,
    });
  } finally {
    db.close();
  }
}

/** Returns the current snapshot's rows, or null when there is none. Any failure wipes this user's data and returns null. */
export async function loadSnapshot(userId: string, deviceId: string, ctx: SnapshotStoreContext): Promise<SnapshotRows | null> {
  if (!idbSupported()) return null;
  try {
    return await loadInner(userId, deviceId, ctx, deviceKeys);
  } catch {
    await wipeData(userId).catch(() => {});
    return null;
  }
}

/** Deletes this user's snapshot database only (the device key stays). Rejects if the delete fails or is blocked. */
async function wipeData(userId: string): Promise<void> {
  const name = await readCacheDbName(userId);
  await deleteDb(name);
  await unregisterDb(name);
}

/** Deletes this user's snapshot database and device key. Rejects if either delete fails or is blocked. */
export async function wipeUser(userId: string): Promise<void> {
  if (!idbSupported()) return;
  const failures: unknown[] = [];
  try {
    await wipeData(userId);
  } catch (e) {
    failures.push(e);
  }
  try {
    await deviceKeys.deleteDeviceKey(userId);
  } catch (e) {
    failures.push(e);
  }
  if (failures.length > 0) throw new Error(`wipeUser incomplete (${failures.length} failed)`);
}

/** Deletes every `finlynq-lf-` database on this browser: snapshots, device keys and the registry. */
export async function wipeAll(): Promise<void> {
  if (!idbSupported()) return;
  const names = (await allLfDbNames()).filter((n) => n !== "finlynq-lf-registry");
  const failed: string[] = [];
  for (const n of names) {
    try {
      await deleteDb(n);
    } catch {
      failed.push(n);
    }
  }
  if (failed.length > 0) throw new Error(`wipeAll incomplete (${failed.length} failed)`);
  await deleteRegistry();
}

/** Milliseconds since the current snapshot was written, or null when there is none. */
export async function snapshotAgeMs(userId: string, now: number = Date.now()): Promise<number | null> {
  if (!idbSupported()) return null;
  try {
    if (!(await deviceKeys.findDeviceKey(userId))) return null;
    const db = await openUserDb(await readCacheDbName(userId));
    try {
      const pointer = await readPointer(db);
      return pointer ? Math.max(0, now - pointer.createdAt) : null;
    } finally {
      db.close();
    }
  } catch {
    return null;
  }
}
