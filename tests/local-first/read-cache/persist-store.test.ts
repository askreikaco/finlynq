// On-device snapshot store (L2b) over fake-indexeddb. Synthetic rows only.
import "fake-indexeddb/auto";
import { describe, it, expect, vi, afterEach } from "vitest";
import { NONCE_BYTES } from "@/lib/local-first/crypto/aead";
import { deviceKeyDbName } from "@/lib/local-first/crypto/device-key-provider";
import {
  loadSnapshot,
  readCacheDbName,
  saveSnapshot,
  snapshotAgeMs,
  wipeAll,
  wipeUser,
} from "@/lib/local-first/read-cache/persist-store";
import type { SnapshotRows } from "@/lib/local-first/read-cache/snapshot-codec";

const SECRET_PAYEE = "PAYEE-SECRET-ZETA";
const SECRET_NOTE = "NOTE-SECRET-OMEGA";
const SECRET_ACCOUNT = "ACCT-SECRET-ALPHA";
const SECRET_AMOUNT = "48213.77";

const fixture = (tag = "a"): SnapshotRows => ({
  accounts: [
    { id: "1", serverId: 1, type: "A", group: "Bank", currency: "CAD", name: SECRET_ACCOUNT, archived: false, isInvestment: false, invisible: false },
  ],
  categories: [{ id: "10", serverId: 10, type: "E", group: "Living", name: `cat-${tag}` }],
  transactions: [
    {
      id: "100", serverId: 100, date: "2026-03-04", accountId: "1", categoryId: "10", currency: "CAD",
      amount: -48213.77, enteredCurrency: "CAD", enteredAmount: -48213.77, enteredFxRate: 1,
      payee: SECRET_PAYEE, note: SECRET_NOTE, tags: "", linkId: null,
    },
  ],
});

const CTX = { build: "build-A", schemaVer: 1 };
let n = 0;
const uid = () => `persist-user-${++n}-${Date.now()}`;

const dbNames = async (): Promise<string[]> => (await indexedDB.databases()).map((d) => d.name ?? "");

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

async function openRaw(name: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(name);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

/** Every value of every object store of every finlynq-lf database, as bytes (Uint8Array raw, others as JSON). */
async function dumpEverything(): Promise<Buffer> {
  const parts: Buffer[] = [];
  for (const name of (await dbNames()).filter((x) => x.startsWith("finlynq-")).sort()) {
    const db = await openRaw(name);
    parts.push(Buffer.from(`\n[db ${name}]\n`));
    for (const store of Array.from(db.objectStoreNames)) {
      const s = db.transaction(store).objectStore(store);
      const keys = await req(s.getAllKeys());
      const vals = await req(s.getAll());
      parts.push(Buffer.from(`\n[store ${store}]\n`));
      keys.forEach((k, i) => {
        parts.push(Buffer.from(`${JSON.stringify(k)}=`));
        const v = vals[i];
        if (v instanceof Uint8Array) parts.push(Buffer.from(v));
        else if (typeof CryptoKey !== "undefined" && v instanceof CryptoKey) parts.push(Buffer.from(`[CryptoKey ${v.type} extractable=${v.extractable}]`));
        else parts.push(Buffer.from(JSON.stringify(v) ?? ""));
        parts.push(Buffer.from("\n"));
      });
    }
    db.close();
  }
  return Buffer.concat(parts);
}

/** Lists the object stores and raw blob keys of one user's snapshot database. */
async function blobKeys(name: string): Promise<string[]> {
  const db = await openRaw(name);
  try {
    return (await req(db.transaction("blobs").objectStore("blobs").getAllKeys())).map((k) => String(k));
  } finally {
    db.close();
  }
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("persist store", () => {
  it("(1) a full dump of every store and value contains none of the fixture payee, note, account or amount", async () => {
    const userId = uid();
    await saveSnapshot(userId, "dev-1", fixture(), { ...CTX, now: () => 1_780_000_000_000 });
    // Positive control: the same fixture, as plaintext JSON, does contain the strings the scan looks for.
    const plain = Buffer.from(JSON.stringify(fixture()));
    for (const s of [SECRET_PAYEE, SECRET_NOTE, SECRET_ACCOUNT, SECRET_AMOUNT]) expect(plain.includes(Buffer.from(s))).toBe(true);

    const dump = await dumpEverything();
    expect(dump.length).toBeGreaterThan(500);
    expect(dump.includes(Buffer.from(`[db ${await readCacheDbName(userId)}]`))).toBe(true);
    for (const s of [SECRET_PAYEE, SECRET_NOTE, SECRET_ACCOUNT, SECRET_AMOUNT]) {
      expect(dump.includes(Buffer.from(s)), `dump leaks ${s}`).toBe(false);
    }
    // The decrypted fixture still comes back.
    expect(await loadSnapshot(userId, "dev-1", CTX)).toEqual(fixture());
  });

  it("(2) crash after chunk writes but before the pointer switch: the previous snapshot still loads", async () => {
    const userId = uid();
    const name = await readCacheDbName(userId);
    await saveSnapshot(userId, "dev-1", fixture("first"), CTX);

    const realPut = IDBObjectStore.prototype.put;
    vi.spyOn(IDBObjectStore.prototype, "put").mockImplementation(function (this: IDBObjectStore, value: unknown, key?: IDBValidKey) {
      if (key === "current") throw new Error("simulated crash before pointer switch");
      return realPut.call(this, value as never, key as never);
    });
    await expect(saveSnapshot(userId, "dev-1", fixture("second"), CTX)).rejects.toThrow("simulated crash");
    vi.restoreAllMocks();

    // The failed generation's blobs are on disk, but the pointer still names the first snapshot.
    expect((await blobKeys(name)).length).toBeGreaterThan(4);
    expect(await loadSnapshot(userId, "dev-1", CTX)).toEqual(fixture("first"));
    expect(await dbNames()).toContain(name);

    // The next successful save makes its snapshot current and prunes the orphans.
    await saveSnapshot(userId, "dev-1", fixture("third"), CTX);
    expect((await blobKeys(name)).length).toBe(4);
    expect(await loadSnapshot(userId, "dev-1", CTX)).toEqual(fixture("third"));
  });

  it("(3) a bit flip in a stored chunk: load returns null and the user's database is gone", async () => {
    const userId = uid();
    const name = await readCacheDbName(userId);
    await saveSnapshot(userId, "dev-1", fixture(), CTX);

    const keys = await blobKeys(name);
    const target = keys[keys.length - 1];
    const db = await openRaw(name);
    const tx = db.transaction("blobs", "readwrite");
    const val = (await req(tx.objectStore("blobs").get(target))) as Uint8Array;
    const bad = val.slice();
    bad[NONCE_BYTES + 2] ^= 0x01;
    tx.objectStore("blobs").put(bad, target);
    await new Promise<void>((r) => {
      tx.oncomplete = () => r();
    });
    db.close();

    expect(await loadSnapshot(userId, "dev-1", CTX)).toBeNull();
    expect(await dbNames()).not.toContain(name);
  });

  it("(3b) a bit flip in the manifest also returns null and wipes the database", async () => {
    const userId = uid();
    const name = await readCacheDbName(userId);
    await saveSnapshot(userId, "dev-1", fixture(), CTX);
    const keys = await blobKeys(name);
    const db = await openRaw(name);
    const tx = db.transaction("blobs", "readwrite");
    const store = tx.objectStore("blobs");
    const manifestKey = keys.find((k) => k.endsWith("|00000000"))!;
    const val = (await req(store.get(manifestKey))) as Uint8Array;
    const bad = val.slice();
    bad[bad.length - 1] ^= 0x80;
    store.put(bad, manifestKey);
    await new Promise<void>((r) => {
      tx.oncomplete = () => r();
    });
    db.close();
    expect(await loadSnapshot(userId, "dev-1", CTX)).toBeNull();
    expect(await dbNames()).not.toContain(name);
  });

  it("(4) wipeUser removes the user's data and device key; wipeAll removes every finlynq-lf database", async () => {
    const a = uid();
    const b = uid();
    await saveSnapshot(a, "dev-1", fixture("a"), CTX);
    await saveSnapshot(b, "dev-1", fixture("b"), CTX);
    const aName = await readCacheDbName(a);
    const aKey = await deviceKeyDbName(a);
    const bName = await readCacheDbName(b);
    const bKey = await deviceKeyDbName(b);
    expect(await dbNames()).toEqual(expect.arrayContaining([aName, aKey, bName, bKey]));

    await wipeUser(a);
    let names = await dbNames();
    expect(names).not.toContain(aName);
    expect(names).not.toContain(aKey);
    expect(names).toEqual(expect.arrayContaining([bName, bKey]));
    expect(await loadSnapshot(a, "dev-1", CTX)).toBeNull();

    await wipeAll();
    names = await dbNames();
    expect(names.filter((x) => x.startsWith("finlynq-lf-"))).toEqual([]);
    expect(await loadSnapshot(b, "dev-1", CTX)).toBeNull();
  });

  it("(4b) wipeAll still finds every database when indexedDB.databases() is unavailable (registry fallback)", async () => {
    const a = uid();
    await saveSnapshot(a, "dev-1", fixture(), CTX);
    const aName = await readCacheDbName(a);
    const aKey = await deviceKeyDbName(a);
    const real = indexedDB.databases.bind(indexedDB);
    Object.defineProperty(indexedDB, "databases", { value: undefined, configurable: true });
    try {
      await wipeAll();
    } finally {
      Object.defineProperty(indexedDB, "databases", { value: real, configurable: true, writable: true });
    }
    const names = await dbNames();
    expect(names).not.toContain(aName);
    expect(names).not.toContain(aKey);
    expect(names.filter((x) => x.startsWith("finlynq-lf-"))).toEqual([]);
  });

  it("(5) cross-user: user B cannot open user A's blobs, even when they are copied into B's database", async () => {
    const a = uid();
    const b = uid();
    await saveSnapshot(a, "dev-1", fixture("a"), CTX);
    await saveSnapshot(b, "dev-1", fixture("b"), CTX);
    const aName = await readCacheDbName(a);
    const bName = await readCacheDbName(b);

    // Copy A's whole snapshot database over B's (a mix-up or a tampered profile).
    type Rec = [store: string, key: IDBValidKey, value: unknown];
    const src = await openRaw(aName);
    const records: Rec[] = await new Promise((resolve, reject) => {
      const out: Rec[] = [];
      const tx = src.transaction(["meta", "blobs"]);
      for (const store of ["meta", "blobs"]) {
        const cur = tx.objectStore(store).openCursor();
        cur.onsuccess = () => {
          const c = cur.result;
          if (c) {
            out.push([store, c.key, c.value]);
            c.continue();
          }
        };
      }
      tx.oncomplete = () => resolve(out);
      tx.onerror = () => reject(tx.error);
    });
    src.close();
    const dst = await openRaw(bName);
    const wtx = dst.transaction(["meta", "blobs"], "readwrite");
    for (const [store, key, value] of records) wtx.objectStore(store).put(value, key);
    await new Promise<void>((resolve) => {
      wtx.oncomplete = () => resolve();
    });
    dst.close();

    expect(await loadSnapshot(b, "dev-1", CTX)).toBeNull();
    expect(await dbNames()).not.toContain(bName);
    // A's own data is untouched.
    expect(await loadSnapshot(a, "dev-1", CTX)).toEqual(fixture("a"));
  });

  it("(5b) a user with no snapshot gets null, and nothing from another user is returned", async () => {
    const a = uid();
    const b = uid();
    await saveSnapshot(a, "dev-1", fixture("a"), CTX);
    expect(await loadSnapshot(b, "dev-1", CTX)).toBeNull();
  });

  it("(6) a schemaVer or build mismatch wipes the database and returns null", async () => {
    const a = uid();
    const name = await readCacheDbName(a);
    await saveSnapshot(a, "dev-1", fixture(), { build: "build-A", schemaVer: 1 });
    expect(await loadSnapshot(a, "dev-1", { build: "build-B", schemaVer: 1 })).toBeNull();
    expect(await dbNames()).not.toContain(name);

    await saveSnapshot(a, "dev-1", fixture(), { build: "build-A", schemaVer: 1 });
    expect(await loadSnapshot(a, "dev-1", { build: "build-A", schemaVer: 2 })).toBeNull();
    expect(await dbNames()).not.toContain(name);
  });

  it("a wrong device id also wipes and returns null", async () => {
    const a = uid();
    const name = await readCacheDbName(a);
    await saveSnapshot(a, "dev-1", fixture(), CTX);
    expect(await loadSnapshot(a, "dev-2", CTX)).toBeNull();
    expect(await dbNames()).not.toContain(name);
  });

  it("a valid load returns the rows and keeps the database", async () => {
    const a = uid();
    const name = await readCacheDbName(a);
    await saveSnapshot(a, "dev-1", fixture(), CTX);
    expect(await loadSnapshot(a, "dev-1", CTX)).toEqual(fixture());
    expect(await dbNames()).toContain(name);
  });

  it("snapshotAgeMs reports the age of the current snapshot, or null when there is none", async () => {
    const a = uid();
    expect(await snapshotAgeMs(a, 5000)).toBeNull();
    await saveSnapshot(a, "dev-1", fixture(), { ...CTX, now: () => 1000 });
    expect(await snapshotAgeMs(a, 4000)).toBe(3000);
    expect(await snapshotAgeMs(a, 500)).toBe(0);
  });
});
