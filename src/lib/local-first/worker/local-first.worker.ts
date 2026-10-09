/**
 * Dedicated worker for the local-first dev panel (local-first P1, PKG-10). PROTOTYPE, unreviewed.
 * SYNTHETIC data only. Storage: PGlite on idb://finlynq-lf-proto-v0-dev (prefix from protocol.ts).
 */
import { PgliteStore } from "../store/pglite-store";
import type { LocalStore } from "../store/types";
import { ARGON2_SET_A, type LogKeys } from "../crypto/kdf";
import { DevPassphraseKeyProvider } from "../crypto/key-provider";
import { dispatch, type LfBackend } from "./handlers";
import { isLfDatabaseName, LF_LOG_ID, LF_STORE_NAME, type LfRequest, type LfResponse } from "./protocol";

/** Synthetic-only passphrase and salt. Not secrets: the data is generated fixture data. */
const DEV_PASSPHRASE = "synthetic-dev-only-passphrase";
const DEV_SALT = new Uint8Array(16).fill(0x2a);

let store: PgliteStore | null = null;
let keysPromise: Promise<LogKeys> | null = null;

const backend: LfBackend = {
  async getStore(): Promise<LocalStore> {
    if (!store) {
      const s = new PgliteStore({ backend: "idb", name: LF_STORE_NAME });
      await s.open();
      store = s;
    }
    return store;
  },
  getKeys(): Promise<LogKeys> {
    if (!keysPromise) {
      keysPromise = new DevPassphraseKeyProvider({ passphrase: DEV_PASSPHRASE, salt: DEV_SALT, params: ARGON2_SET_A }).getKeys(LF_LOG_ID);
    }
    return keysPromise;
  },
  async closeStore(): Promise<void> {
    const s = store;
    store = null;
    if (s) await s.close();
  },
  async listDatabases(): Promise<string[]> {
    const dbs = await indexedDB.databases();
    return dbs.map((d) => d.name ?? "").filter((n) => n.length > 0);
  },
  deleteDatabase(name: string): Promise<void> {
    if (!isLfDatabaseName(name)) throw new Error("refusing to delete a database outside the prototype prefix");
    return new Promise((resolve, reject) => {
      const req = indexedDB.deleteDatabase(name);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error ?? new Error("deleteDatabase failed"));
      req.onblocked = () => reject(new Error(`deleteDatabase blocked: ${name}`));
    });
  },
};

// Minimal typing for the dedicated worker global (the app tsconfig does not include the webworker lib).
const ctx = self as unknown as { postMessage(m: LfResponse): void; onmessage: ((e: MessageEvent<LfRequest>) => void) | null };

ctx.onmessage = (e: MessageEvent<LfRequest>) => {
  void dispatch(e.data, backend).then((res) => ctx.postMessage(res));
};
