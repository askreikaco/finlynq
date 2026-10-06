/**
 * Encrypted on-device copy of the SWR data cache (performance plan, Phase 4a).
 *
 * - IndexedDB, one database per user (`finlynq-cache-v1-<hash(userId)>`), entries
 *   AES-GCM encrypted under a NON-EXTRACTABLE WebCrypto key kept in the same
 *   database (script can use it, nobody can read the raw key bytes out).
 * - Only on a trusted device (pf_device registered for this user) and only while
 *   the DEK is unlocked; never persists a locked session's placeholder data.
 * - Wiped on lock, logout, signed-out boot, untrusted device, and on a new build
 *   (response shapes may change).
 * - Bounded: at most MAX_ENTRIES keys, each serialised value <= MAX_BYTES.
 */
import { isSafeToPersist } from "./persist-policy";

const DB_PREFIX = "finlynq-cache-v1-";
const MAX_ENTRIES = 300;
const MAX_BYTES = 1_500_000;

type Entry = { iv: Uint8Array<ArrayBuffer>; ct: ArrayBuffer; at: number };

export function persistSupported(): boolean {
  return typeof indexedDB !== "undefined" && typeof crypto !== "undefined" && !!crypto.subtle;
}

async function dbName(userId: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(userId));
  const hex = [...new Uint8Array(digest)].slice(0, 8).map((b) => b.toString(16).padStart(2, "0")).join("");
  return DB_PREFIX + hex;
}

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

async function open(userId: string): Promise<IDBDatabase> {
  const name = await dbName(userId);
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(name, 1);
    r.onupgradeneeded = () => {
      r.result.createObjectStore("meta");
      r.result.createObjectStore("entries");
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

async function getKey(db: IDBDatabase, create: boolean): Promise<CryptoKey | null> {
  const existing = (await req(db.transaction("meta").objectStore("meta").get("key"))) as CryptoKey | undefined;
  if (existing) return existing;
  if (!create) return null;
  const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  const tx = db.transaction("meta", "readwrite");
  tx.objectStore("meta").put(key, "key");
  await txDone(tx);
  return key;
}

/** Load every stored entry for this user + build. Wrong build → wipe, empty.
 * Pass optional isSafe predicate to skip decrypting disallowed entries.
 */
export async function loadPersisted(
  userId: string,
  build: string,
  isSafe?: (key: string) => boolean,
): Promise<Map<string, unknown>> {
  const out = new Map<string, unknown>();
  if (!persistSupported()) return out;
  const db = await open(userId);
  try {
    const storedBuild = await req(db.transaction("meta").objectStore("meta").get("build"));
    if (storedBuild !== build) {
      db.close();
      await wipeUser(userId);
      return out;
    }
    const key = await getKey(db, false);
    if (!key) return out;
    const store = db.transaction("entries").objectStore("entries");
    const [keys, values] = await Promise.all([req(store.getAllKeys()), req(store.getAll())]);
    const dec = new TextDecoder();
    await Promise.all(
      (values as Entry[]).map(async (e, i) => {
        const keyStr = String(keys[i]);
        // Skip decryption if isSafe predicate is provided and key fails it
        if (isSafe && !isSafe(keyStr)) return;
        try {
          const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: e.iv }, key, e.ct);
          out.set(keyStr, JSON.parse(dec.decode(plain)));
        } catch {
          /* corrupt or foreign entry: skip */
        }
      }),
    );
    return out;
  } finally {
    db.close();
  }
}

/** Encrypt + store a batch of (key → data). Enforces size + entry caps. */
export async function savePersisted(userId: string, build: string, batch: Map<string, unknown>): Promise<void> {
  if (!persistSupported() || batch.size === 0) return;
  const db = await open(userId);
  try {
    const key = await getKey(db, true);
    if (!key) return;
    const enc = new TextEncoder();
    const rows: Array<[string, Entry | null]> = [];
    for (const [k, data] of batch) {
      if (data === undefined) {
        rows.push([k, null]);
        continue;
      }
      const bytes = enc.encode(JSON.stringify(data));
      if (bytes.byteLength > MAX_BYTES) continue;
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, bytes);
      rows.push([k, { iv, ct, at: Date.now() }]);
    }
    const tx = db.transaction(["entries", "meta"], "readwrite");
    const entries = tx.objectStore("entries");
    tx.objectStore("meta").put(build, "build");
    for (const [k, row] of rows) {
      if (row) entries.put(row, k);
      else entries.delete(k);
    }
    await txDone(tx);
    // cap: drop the oldest entries beyond MAX_ENTRIES
    const count = await req(db.transaction("entries").objectStore("entries").count());
    if (count > MAX_ENTRIES) {
      const store = db.transaction("entries").objectStore("entries");
      const [keys, values] = await Promise.all([req(store.getAllKeys()), req(store.getAll())]);
      const order = (values as Entry[]).map((v, i) => ({ k: keys[i], at: v.at })).sort((a, b) => a.at - b.at);
      const drop = order.slice(0, count - MAX_ENTRIES);
      const dtx = db.transaction("entries", "readwrite");
      for (const d of drop) dtx.objectStore("entries").delete(d.k);
      await txDone(dtx);
    }
  } finally {
    db.close();
  }
}

/**
 * Purge all disallowed keys from IndexedDB. Runs on hydration regardless of enabled() state
 * to clean up old encrypted entries that should never persist (auth, security, etc.).
 * Safe to run even on untrusted devices (read-only checks, no state changes).
 * Cleans ONLY this user's database (userId parameter); wipeAll() handles other users on signed-out boot.
 */
export async function purgeDisallowed(userId: string, build: string): Promise<void> {
  if (!persistSupported()) return;
  const db = await open(userId);
  try {
    const storedBuild = await req(db.transaction("meta").objectStore("meta").get("build"));
    // Only purge if build matches (same user, same schema)
    if (storedBuild !== build) return;

    const store = db.transaction("entries").objectStore("entries");
    const keys = await req(store.getAllKeys());

    const toPurge: string[] = [];
    for (const k of keys) {
      const key = String(k);
      if (!isSafeToPersist(key)) {
        toPurge.push(key);
      }
    }

    if (toPurge.length === 0) return;

    const tx = db.transaction("entries", "readwrite");
    for (const k of toPurge) {
      tx.objectStore("entries").delete(k);
    }
    await txDone(tx);
  } finally {
    db.close();
  }
}

/** Delete one user's database (best effort, resolves even if blocked). */
export async function wipeUser(userId: string): Promise<void> {
  if (!persistSupported()) return;
  const name = await dbName(userId);
  await new Promise<void>((resolve) => {
    const r = indexedDB.deleteDatabase(name);
    r.onsuccess = r.onerror = r.onblocked = () => resolve();
  });
}

/** Delete every user's cache database on this browser (signed-out boot). */
export async function wipeAll(): Promise<void> {
  if (!persistSupported() || typeof indexedDB.databases !== "function") return;
  const dbs = await indexedDB.databases();
  await Promise.all(
    dbs
      .filter((d) => d.name?.startsWith(DB_PREFIX))
      .map(
        (d) =>
          new Promise<void>((resolve) => {
            const r = indexedDB.deleteDatabase(d.name as string);
            r.onsuccess = r.onerror = r.onblocked = () => resolve();
          }),
      ),
  );
}
