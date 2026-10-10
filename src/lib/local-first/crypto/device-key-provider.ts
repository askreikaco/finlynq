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

export interface DeviceKeyProvider {
  /** Returns the device key for this user, generating and storing it on first use. */
  getOrCreateDeviceKey(userId: string): Promise<CryptoKey>;
  /** Returns the stored device key, or null. Never generates one. */
  findDeviceKey(userId: string): Promise<CryptoKey | null>;
  /** Removes the device key database for this user. Resolves once it is gone. */
  deleteDeviceKey(userId: string): Promise<void>;
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
    }
    await txDone(tx);
    return result;
  } finally {
    db.close();
  }
}

export class IdbDeviceKeyProvider implements DeviceKeyProvider {
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
