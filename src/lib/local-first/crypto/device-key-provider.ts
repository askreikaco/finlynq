/**
 * Per-device, per-user snapshot key for the on-device read cache (L2b). PROTOTYPE, unreviewed.
 *
 * One NON-EXTRACTABLE AES-GCM-256 CryptoKey per (device, user), stored in its own IndexedDB database
 * `finlynq-lf-key-v1-<sha256(userId) first 8 bytes hex>`. Separate from the key in src/lib/data/persist.ts.
 *
 * Why a sibling of KeyProvider and not an implementation of it: KeyProvider.getKeys(logId) returns the
 * LogKeys pair (oplog + snapshot keys derived from a passphrase). The device key is one key per user,
 * with no passphrase and no logId, so the LogKeys shape does not fit.
 */
import { deleteDb, idbSupported, openDb, registerDb, req, txDone, unregisterDb, userDbSuffix, LF_DB_PREFIX } from "../storage/db-registry";

export const DEVICE_KEY_DB_PREFIX = `${LF_DB_PREFIX}key-v1-`;
const KEY_STORE = "keys";
const KEY_ID = "device";
/** The key replaced by the last rotation. Kept (readable, never used to seal) until every record is re-sealed under KEY_ID. */
const PREV_ID = "device-prev";
const META_ID = "meta";

export interface DeviceKeyMeta {
  createdAt: number;
  rotatedAt: number | null;
  /** 1 for the first key, +1 per rotation. */
  generation: number;
}

export interface DeviceKeyring {
  current: CryptoKey | null;
  /** Present only between a rotation and the end of its re-seal sweep. */
  previous: CryptoKey | null;
}

/** A rotation was asked for while an earlier one has not finished its sweep. Finish (sweep) first. */
export class RotationPendingError extends Error {
  constructor() {
    super("an earlier key rotation is still pending");
    this.name = "RotationPendingError";
  }
}

export interface DeviceKeyProvider {
  /** Returns the device key for this user, generating and storing it on first use. */
  getOrCreateDeviceKey(userId: string): Promise<CryptoKey>;
  /** Returns the stored device key, or null. Never generates one. */
  findDeviceKey(userId: string): Promise<CryptoKey | null>;
  /** Removes the device key database for this user. Resolves once it is gone. */
  deleteDeviceKey(userId: string): Promise<void>;
  /** Current key plus the previous one while a rotation sweep is pending. Never generates. */
  findKeyring(userId: string): Promise<DeviceKeyring>;
  /**
   * Atomically makes a fresh key current and keeps the old one as `previous`. Returns null when there is no key yet
   * (nothing to rotate). Throws RotationPendingError when a previous key is still held.
   */
  rotateDeviceKey(userId: string): Promise<DeviceKeyring | null>;
  /** Forgets the previous key. Call only after every record sealed under it has been re-sealed. */
  dropPreviousKey(userId: string): Promise<void>;
  getKeyMeta(userId: string): Promise<DeviceKeyMeta | null>;
}

export async function deviceKeyDbName(userId: string): Promise<string> {
  return DEVICE_KEY_DB_PREFIX + (await userDbSuffix(userId));
}

function isDeviceKey(v: unknown): v is CryptoKey {
  if (typeof CryptoKey === "undefined" || !(v instanceof CryptoKey)) return false;
  const alg = v.algorithm as AesKeyAlgorithm;
  return v.type === "secret" && v.extractable === false && alg.name === "AES-GCM" && alg.length === 256 &&
    v.usages.includes("encrypt") && v.usages.includes("decrypt");
}

function openKeyDb(name: string): Promise<IDBDatabase> {
  return openDb(name, (db) => db.createObjectStore(KEY_STORE));
}

async function readStoredKey(name: string): Promise<CryptoKey | null> {
  await registerDb(name); // registered before the open, which creates the database if it is missing
  const db = await openKeyDb(name);
  try {
    const stored: unknown = await req(db.transaction(KEY_STORE).objectStore(KEY_STORE).get(KEY_ID));
    if (stored === undefined) return null;
    if (!isDeviceKey(stored)) throw new Error("stored device key has unexpected properties");
    return stored;
  } finally {
    db.close();
  }
}

/** Writes `fresh` unless a key was stored meanwhile. Returns whichever key is stored. */
async function storeIfAbsent(name: string, fresh: CryptoKey): Promise<CryptoKey> {
  const db = await openKeyDb(name);
  try {
    const tx = db.transaction(KEY_STORE, "readwrite");
    const store = tx.objectStore(KEY_STORE);
    const existing: unknown = await req(store.get(KEY_ID));
    let result: CryptoKey = fresh;
    if (existing !== undefined) {
      if (!isDeviceKey(existing)) throw new Error("stored device key has unexpected properties");
      result = existing;
    } else {
      store.put(fresh, KEY_ID);
      store.put({ createdAt: Date.now(), rotatedAt: null, generation: 1 } satisfies DeviceKeyMeta, META_ID);
    }
    await txDone(tx);
    return result;
  } finally {
    db.close();
  }
}

function isMeta(v: unknown): v is DeviceKeyMeta {
  if (typeof v !== "object" || v === null) return false;
  const m = v as Record<string, unknown>;
  return typeof m.createdAt === "number" && typeof m.generation === "number" && (m.rotatedAt === null || typeof m.rotatedAt === "number");
}

export class IdbDeviceKeyProvider implements DeviceKeyProvider {
  async findKeyring(userId: string): Promise<DeviceKeyring> {
    if (!idbSupported()) return { current: null, previous: null };
    const name = await deviceKeyDbName(userId);
    await registerDb(name);
    const db = await openKeyDb(name);
    try {
      const store = db.transaction(KEY_STORE).objectStore(KEY_STORE);
      const [cur, prev]: unknown[] = await Promise.all([req(store.get(KEY_ID)), req(store.get(PREV_ID))]);
      if (cur !== undefined && !isDeviceKey(cur)) throw new Error("stored device key has unexpected properties");
      if (prev !== undefined && !isDeviceKey(prev)) throw new Error("stored previous device key has unexpected properties");
      return { current: (cur as CryptoKey | undefined) ?? null, previous: (prev as CryptoKey | undefined) ?? null };
    } finally {
      db.close();
    }
  }

  async rotateDeviceKey(userId: string): Promise<DeviceKeyring | null> {
    if (!idbSupported()) return null;
    const name = await deviceKeyDbName(userId);
    await registerDb(name);
    // Generated before the transaction opens: awaiting a non-IndexedDB promise inside one would let it auto-commit.
    const fresh = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
    const db = await openKeyDb(name);
    try {
      const tx = db.transaction(KEY_STORE, "readwrite");
      const store = tx.objectStore(KEY_STORE);
      const [cur, prev, meta]: unknown[] = await Promise.all([req(store.get(KEY_ID)), req(store.get(PREV_ID)), req(store.get(META_ID))]);
      if (cur === undefined) {
        tx.abort();
        await txDone(tx).catch(() => undefined);
        return null;
      }
      if (!isDeviceKey(cur)) throw new Error("stored device key has unexpected properties");
      if (prev !== undefined) {
        tx.abort();
        await txDone(tx).catch(() => undefined);
        throw new RotationPendingError();
      }
      const generation = isMeta(meta) ? meta.generation + 1 : 2;
      const createdAt = isMeta(meta) ? meta.createdAt : Date.now();
      store.put(cur, PREV_ID);
      store.put(fresh, KEY_ID);
      store.put({ createdAt, rotatedAt: Date.now(), generation } satisfies DeviceKeyMeta, META_ID);
      await txDone(tx);
      return { current: fresh, previous: cur };
    } finally {
      db.close();
    }
  }

  async dropPreviousKey(userId: string): Promise<void> {
    if (!idbSupported()) return;
    const name = await deviceKeyDbName(userId);
    await registerDb(name);
    const db = await openKeyDb(name);
    try {
      const tx = db.transaction(KEY_STORE, "readwrite");
      tx.objectStore(KEY_STORE).delete(PREV_ID);
      await txDone(tx);
    } finally {
      db.close();
    }
  }

  async getKeyMeta(userId: string): Promise<DeviceKeyMeta | null> {
    if (!idbSupported()) return null;
    const name = await deviceKeyDbName(userId);
    await registerDb(name);
    const db = await openKeyDb(name);
    try {
      const meta: unknown = await req(db.transaction(KEY_STORE).objectStore(KEY_STORE).get(META_ID));
      return isMeta(meta) ? meta : null;
    } finally {
      db.close();
    }
  }

  async getOrCreateDeviceKey(userId: string): Promise<CryptoKey> {
    if (!idbSupported()) throw new Error("IndexedDB or WebCrypto is not available");
    const name = await deviceKeyDbName(userId);
    const existing = await readStoredKey(name);
    if (existing) return existing;
    const fresh = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
    return storeIfAbsent(name, fresh);
  }

  async findDeviceKey(userId: string): Promise<CryptoKey | null> {
    if (!idbSupported()) return null;
    return readStoredKey(await deviceKeyDbName(userId));
  }

  async deleteDeviceKey(userId: string): Promise<void> {
    if (!idbSupported()) return;
    const name = await deviceKeyDbName(userId);
    await deleteDb(name);
    await unregisterDb(name);
  }
}

/** Shared instance used by the on-device snapshot store. */
export const deviceKeys: DeviceKeyProvider = new IdbDeviceKeyProvider();
