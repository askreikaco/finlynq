/**
 * Shared IndexedDB helpers for the local-first on-device stores (L2b). PROTOTYPE, unreviewed.
 *
 * Every database this package creates is named `finlynq-lf-...` and is also recorded in a tiny
 * registry database, so wipeAll() can find them on browsers without indexedDB.databases().
 * No localStorage, no network.
 */
export const LF_DB_PREFIX = "finlynq-lf-";
const REGISTRY_DB = "finlynq-lf-registry";
const REGISTRY_STORE = "names";

const enc = new TextEncoder();

export function idbSupported(): boolean {
  return typeof indexedDB !== "undefined" && typeof crypto !== "undefined" && !!crypto.subtle;
}

/** First 8 bytes of SHA-256(userId) as 16 lowercase hex chars. The raw userId never appears in a name. */
export async function userDbSuffix(userId: string): Promise<string> {
  if (userId.length === 0) throw new Error("userId must not be empty");
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(userId)));
  return [...digest.slice(0, 8)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error ?? new Error("indexedDB request failed"));
  });
}

export function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("indexedDB transaction failed"));
    tx.onabort = () => reject(tx.error ?? new Error("indexedDB transaction aborted"));
  });
}

/** Opens (creating or upgrading to version 1 when needed). Caller closes the returned handle. */
export function openDb(name: string, onUpgrade: (db: IDBDatabase) => void): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(name, 1);
    r.onupgradeneeded = () => onUpgrade(r.result);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error ?? new Error("indexedDB open failed"));
    r.onblocked = () => reject(new Error("indexedDB open blocked"));
  });
}

/** Deletes one database. Rejects on error or when blocked (a wipe must not be reported as done while a connection is open). */
export function deleteDb(name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.deleteDatabase(name);
    r.onsuccess = () => resolve();
    r.onerror = () => reject(r.error ?? new Error("indexedDB delete failed"));
    r.onblocked = () => reject(new Error("indexedDB delete blocked"));
  });
}

async function openRegistry(): Promise<IDBDatabase> {
  return openDb(REGISTRY_DB, (db) => db.createObjectStore(REGISTRY_STORE));
}

/** Records a database name so wipeAll() can delete it later. */
export async function registerDb(name: string): Promise<void> {
  const db = await openRegistry();
  try {
    const tx = db.transaction(REGISTRY_STORE, "readwrite");
    tx.objectStore(REGISTRY_STORE).put(true, name);
    await txDone(tx);
  } finally {
    db.close();
  }
}

export async function unregisterDb(name: string): Promise<void> {
  const db = await openRegistry();
  try {
    const tx = db.transaction(REGISTRY_STORE, "readwrite");
    tx.objectStore(REGISTRY_STORE).delete(name);
    await txDone(tx);
  } finally {
    db.close();
  }
}

/** Every name recorded in the registry. */
export async function registeredDbNames(): Promise<string[]> {
  const db = await openRegistry();
  try {
    const keys = await req(db.transaction(REGISTRY_STORE).objectStore(REGISTRY_STORE).getAllKeys());
    return keys.map((k) => String(k));
  } finally {
    db.close();
  }
}

/** Deletes the registry database itself (used last by wipeAll). */
export const deleteRegistry = (): Promise<void> => deleteDb(REGISTRY_DB);

/** Names of every existing database under the local-first prefix: the browser's list plus the registry. */
export async function allLfDbNames(): Promise<string[]> {
  const names = new Set<string>();
  if (typeof indexedDB.databases === "function") {
    for (const d of await indexedDB.databases()) {
      if (d.name?.startsWith(LF_DB_PREFIX)) names.add(d.name);
    }
  }
  for (const n of await registeredDbNames()) {
    if (n.startsWith(LF_DB_PREFIX)) names.add(n);
  }
  names.add(REGISTRY_DB);
  return [...names];
}
