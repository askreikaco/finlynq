/**
 * Append-only encrypted frame log. PROTOTYPE, unreviewed. Stores opaque frame bytes only.
 *
 * Each entry has a local arrival index (0-based, dense). readFrom() returns entries in arrival order.
 * An existing (deviceId, seq) key is never replaced: append() throws AppendOnlyViolation.
 *
 * IdbLogStore: database `finlynq-lf-proto-v0-<logId>`, object store `frames`, out-of-line key
 * [deviceId, seq], written with add() only.
 */
import { AppendOnlyViolation } from "./errors";

export interface StoredFrame {
  deviceId: string;
  seq: number;
  bytes: Uint8Array;
}

export interface LogStore {
  readonly backend: "memory" | "idb";
  /** Appends one frame. Returns its arrival index. Throws AppendOnlyViolation if the key exists. */
  append(deviceId: string, seq: number, bytes: Uint8Array): Promise<number>;
  get(deviceId: string, seq: number): Promise<Uint8Array | undefined>;
  count(): Promise<number>;
  /** Entries with arrival index >= offset, in arrival order. */
  readFrom(offset: number): Promise<StoredFrame[]>;
  close(): Promise<void>;
}

const DB_PREFIX = "finlynq-lf-proto-v0-";
const STORE = "frames";

function keyOf(deviceId: string, seq: number): string {
  return JSON.stringify([deviceId, seq]);
}

export class MemoryLogStore implements LogStore {
  readonly backend = "memory" as const;
  private readonly entries: Array<StoredFrame & { arrival: number }> = [];
  private readonly index = new Map<string, number>();

  async append(deviceId: string, seq: number, bytes: Uint8Array): Promise<number> {
    const key = keyOf(deviceId, seq);
    if (this.index.has(key)) throw new AppendOnlyViolation();
    const arrival = this.entries.length;
    this.entries.push({ deviceId, seq, bytes: new Uint8Array(bytes), arrival });
    this.index.set(key, arrival);
    return arrival;
  }

  async get(deviceId: string, seq: number): Promise<Uint8Array | undefined> {
    const at = this.index.get(keyOf(deviceId, seq));
    return at === undefined ? undefined : new Uint8Array(this.entries[at].bytes);
  }

  async count(): Promise<number> {
    return this.entries.length;
  }

  async readFrom(offset: number): Promise<StoredFrame[]> {
    return this.entries.slice(offset).map((e) => ({ deviceId: e.deviceId, seq: e.seq, bytes: new Uint8Array(e.bytes) }));
  }

  async close(): Promise<void> {
    // nothing to release
  }
}

interface IdbRecord {
  deviceId: string;
  seq: number;
  arrival: number;
  bytes: Uint8Array;
}

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error ?? new Error("indexedDB request failed"));
  });
}

export class IdbLogStore implements LogStore {
  readonly backend = "idb" as const;

  private constructor(private readonly db: IDBDatabase) {}

  static dbName(logId: string): string {
    return DB_PREFIX + logId;
  }

  static open(logId: string): Promise<IdbLogStore> {
    return new Promise((resolve, reject) => {
      const open = indexedDB.open(IdbLogStore.dbName(logId), 1);
      open.onupgradeneeded = () => {
        open.result.createObjectStore(STORE);
      };
      open.onsuccess = () => resolve(new IdbLogStore(open.result));
      open.onerror = () => reject(open.error ?? new Error("indexedDB open failed"));
      open.onblocked = () => reject(new Error("indexedDB open blocked"));
    });
  }

  static destroy(logId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const r = indexedDB.deleteDatabase(IdbLogStore.dbName(logId));
      r.onsuccess = () => resolve();
      r.onerror = () => reject(r.error ?? new Error("indexedDB delete failed"));
    });
  }

  append(deviceId: string, seq: number, bytes: Uint8Array): Promise<number> {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORE, "readwrite");
      const store = tx.objectStore(STORE);
      let arrival = -1;
      let violation = false;
      let failure: unknown = null;
      const countReq = store.count();
      countReq.onsuccess = () => {
        arrival = countReq.result;
        const rec: IdbRecord = { deviceId, seq, arrival, bytes: new Uint8Array(bytes) };
        try {
          const addReq = store.add(rec, [deviceId, seq]);
          addReq.onerror = (ev) => {
            // ConstraintError: the key exists. Keep the transaction alive; it commits nothing.
            ev.preventDefault();
            violation = true;
          };
        } catch (e) {
          failure = e;
          tx.abort();
        }
      };
      tx.oncomplete = () => {
        if (violation) reject(new AppendOnlyViolation());
        else resolve(arrival);
      };
      tx.onabort = () => {
        reject(failure ?? tx.error ?? new Error("indexedDB append aborted"));
      };
    });
  }

  async get(deviceId: string, seq: number): Promise<Uint8Array | undefined> {
    const tx = this.db.transaction(STORE, "readonly");
    const rec = (await req(tx.objectStore(STORE).get([deviceId, seq]) as IDBRequest<IdbRecord | undefined>)) ?? undefined;
    return rec === undefined ? undefined : new Uint8Array(rec.bytes);
  }

  async count(): Promise<number> {
    const tx = this.db.transaction(STORE, "readonly");
    return req(tx.objectStore(STORE).count());
  }

  async readFrom(offset: number): Promise<StoredFrame[]> {
    const tx = this.db.transaction(STORE, "readonly");
    const all = (await req(tx.objectStore(STORE).getAll() as IDBRequest<IdbRecord[]>)) ?? [];
    return all
      .filter((r) => r.arrival >= offset)
      .sort((a, b) => a.arrival - b.arrival)
      .map((r) => ({ deviceId: r.deviceId, seq: r.seq, bytes: new Uint8Array(r.bytes) }));
  }

  async close(): Promise<void> {
    this.db.close();
  }
}
