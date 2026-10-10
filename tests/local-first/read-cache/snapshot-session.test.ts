// @vitest-environment node
// Session-level persistence (local-first L2b, WP4): snapshot-first seed, debounced save, gating. fake-indexeddb, synthetic data only.
import "fake-indexeddb/auto";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import {
  createMemoryStore,
  disposeReadCache,
  hydrateReadCache,
  readLocalBalances,
  READ_CACHE_SCHEMA_VER,
  SNAPSHOT_SAVE_DEBOUNCE_MS,
  TRUSTED_DEVICE_LIFETIME_MS,
  type ReadCacheDeps,
  type SnapshotPersistDeps,
} from "@/lib/local-first/read-cache/session";
import {
  readCacheDbName,
  saveSnapshot,
  snapshotAgeMs,
  wipeAll,
} from "@/lib/local-first/read-cache/persist-store";
import { fakeApi } from "./fixtures";

vi.mock("@/lib/local-first/read-cache/persist-store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/local-first/read-cache/persist-store")>();
  return { ...actual, saveSnapshot: vi.fn(actual.saveSnapshot) };
});

const saveMock = vi.mocked(saveSnapshot);
let allowed = true;

function persist(userId: string, over: Partial<SnapshotPersistDeps> = {}): SnapshotPersistDeps {
  return { userId, deviceId: "dev-1", build: "build-A", allowPersist: () => allowed, debounceMs: 20, ...over };
}
function deps(p: SnapshotPersistDeps | undefined, fetchImpl: ReadCacheDeps["fetchImpl"]): ReadCacheDeps {
  return { createStore: createMemoryStore, fetchImpl, persist: p };
}
const dbNames = async (): Promise<string[]> => (await indexedDB.databases()).map((d) => d.name ?? "");
const hasDb = async (userId: string) => (await dbNames()).includes(await readCacheDbName(userId));

async function until(cond: () => Promise<boolean> | boolean, ms = 5000): Promise<void> {
  const end = Date.now() + ms;
  while (!(await cond())) {
    if (Date.now() > end) throw new Error("condition not met in time");
    await new Promise((r) => setTimeout(r, 5));
  }
}

/** Hydrates as `userId` and waits until its snapshot is on disk. Leaves no session open. */
async function seed(userId: string, build = "build-A") {
  const api = fakeApi();
  await hydrateReadCache(deps(persist(userId, { build, debounceMs: 0 }), api.fetchImpl));
  await until(async () => (await snapshotAgeMs(userId)) !== null);
  await disposeReadCache();
}

beforeEach(async () => {
  allowed = true;
  saveMock.mockClear();
  await disposeReadCache();
  await wipeAll();
});
afterEach(async () => {
  await disposeReadCache();
});

describe("snapshot-first paint", () => {
  it("seeds from the snapshot before the network answers, then refreshes from the APIs", async () => {
    await seed("u-first");
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const api = fakeApi();
    const events: string[] = [];
    const gated: ReadCacheDeps["fetchImpl"] = async (url) => {
      await gate;
      events.push(`net:${url.split("?")[0]}`);
      return api.fetchImpl(url);
    };
    const d = deps(persist("u-first"), gated);
    const pending = hydrateReadCache(d, { onSnapshot: () => events.push("snapshot") });
    // The first read is served from the snapshot while the network request is still held.
    await until(() => events.includes("snapshot"));
    const rows = await readLocalBalances(d);
    expect(rows.map((r) => r.accountId)).toEqual(["1"]);
    expect(rows[0].balance).toBeCloseTo(950.5, 9);
    expect(events[0]).toBe("snapshot");
    release();
    const result = await pending;
    expect(result.loaded.accounts).toBe(4);
    expect(events.slice(1).some((e) => e.startsWith("net:"))).toBe(true);
  });

  it("with no snapshot, onSnapshot never fires and the APIs are the only source", async () => {
    const api = fakeApi();
    const onSnapshot = vi.fn();
    await hydrateReadCache(deps(persist("u-none", { debounceMs: 1000 }), api.fetchImpl), { onSnapshot });
    expect(onSnapshot).not.toHaveBeenCalled();
    expect(api.urls.some((u) => u.startsWith("/api/accounts"))).toBe(true);
  });
});

describe("save after a successful hydrate", () => {
  it("saves once per hydrate, never before the debounce elapses", async () => {
    const api = fakeApi();
    const d = deps(persist("u-save", { debounceMs: 60 }), api.fetchImpl);
    await hydrateReadCache(d);
    expect(saveMock).not.toHaveBeenCalled();
    await until(() => saveMock.mock.calls.length === 1);
    await new Promise((r) => setTimeout(r, 120));
    expect(saveMock.mock.calls.length).toBe(1);
    await hydrateReadCache(d, { force: true });
    await until(() => saveMock.mock.calls.length === 2);
    await new Promise((r) => setTimeout(r, 120));
    expect(saveMock.mock.calls.length).toBe(2);
    // The saved rows are the hydrated rows (accounts, categories and transactions).
    const [, , rows, ctx] = saveMock.mock.calls[1];
    expect(rows.accounts.map((a) => a.id).sort()).toEqual(["1", "2", "3", "4"]);
    expect(rows.transactions.length).toBeGreaterThan(0);
    expect(ctx).toMatchObject({ build: "build-A", schemaVer: READ_CACHE_SCHEMA_VER });
  });

  it("two hydrates inside one debounce window produce a single save", async () => {
    const api = fakeApi();
    const d = deps(persist("u-burst", { debounceMs: 1000 }), api.fetchImpl);
    await hydrateReadCache(d);
    await hydrateReadCache(d, { force: true });
    await new Promise((r) => setTimeout(r, 50));
    expect(saveMock.mock.calls.length).toBe(0);
    await until(() => saveMock.mock.calls.length === 1, 3000);
    await new Promise((r) => setTimeout(r, 100));
    expect(saveMock.mock.calls.length).toBe(1);
  });

  it("the default debounce is at least 5 s (the first save waits for it)", async () => {
    expect(SNAPSHOT_SAVE_DEBOUNCE_MS).toBeGreaterThanOrEqual(5000);
    const api = fakeApi();
    await hydrateReadCache(deps({ userId: "u-default", deviceId: "dev-1", build: "build-A", allowPersist: () => true }, api.fetchImpl));
    await new Promise((r) => setTimeout(r, 1000));
    expect(saveMock.mock.calls.length).toBe(0);
    await until(() => saveMock.mock.calls.length === 1, 6000);
  }, 20000);

  it("locked or opted out when the debounce fires: nothing is saved", async () => {
    const api = fakeApi();
    await hydrateReadCache(deps(persist("u-locked", { debounceMs: 20 }), api.fetchImpl));
    allowed = false;
    await new Promise((r) => setTimeout(r, 120));
    expect(saveMock).not.toHaveBeenCalled();
    expect(await hasDb("u-locked")).toBe(false);
  });
});

describe("gating: nothing is read or written unless allowed", () => {
  it("allowPersist false from the start: no IndexedDB open, no seed, no save", async () => {
    const openSpy = vi.spyOn(indexedDB, "open");
    try {
      await seed("u-gate-setup");
      openSpy.mockClear();
      saveMock.mockClear();
      allowed = false;
      const api = fakeApi();
      const onSnapshot = vi.fn();
      const r = await hydrateReadCache(deps(persist("u-gate-setup"), api.fetchImpl), { onSnapshot });
      await new Promise((res) => setTimeout(res, 60));
      expect(r.loaded.accounts).toBe(4);
      expect(onSnapshot).not.toHaveBeenCalled();
      expect(saveMock).not.toHaveBeenCalled();
      expect(openSpy).not.toHaveBeenCalled();
    } finally {
      openSpy.mockRestore();
    }
  });

  it("no persist deps (opt-in off or no session): no IndexedDB at all", async () => {
    const openSpy = vi.spyOn(indexedDB, "open");
    try {
      const api = fakeApi();
      await hydrateReadCache(deps(undefined, api.fetchImpl));
      await readLocalBalances(deps(undefined, api.fetchImpl));
      await new Promise((r) => setTimeout(r, 60));
      expect(openSpy).not.toHaveBeenCalled();
      expect(saveMock).not.toHaveBeenCalled();
      expect(await dbNames()).toEqual([]);
    } finally {
      openSpy.mockRestore();
    }
  });
});

describe("stale, tampered or mismatched snapshots fall back to the network", () => {
  it("a snapshot older than the trusted-device lifetime is wiped and not seeded", async () => {
    await seed("u-stale");
    expect(await hasDb("u-stale")).toBe(true);
    const onSnapshot = vi.fn();
    const future = Date.now() + TRUSTED_DEVICE_LIFETIME_MS + 60_000;
    const api = fakeApi();
    await hydrateReadCache(deps(persist("u-stale", { now: () => future, debounceMs: 100000 }), api.fetchImpl), { onSnapshot });
    expect(onSnapshot).not.toHaveBeenCalled();
    expect(await hasDb("u-stale")).toBe(false);
    await disposeReadCache();
  });

  it("a tampered snapshot blob loads as null: network only, and the snapshot is wiped", async () => {
    await seed("u-tamper");
    const name = await readCacheDbName("u-tamper");
    const db = await new Promise<IDBDatabase>((res, rej) => {
      const r = indexedDB.open(name);
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    const tx = db.transaction("blobs", "readwrite");
    const st = tx.objectStore("blobs");
    const keys = await new Promise<IDBValidKey[]>((res) => {
      const q = st.getAllKeys();
      q.onsuccess = () => res(q.result);
    });
    const lastKey = keys[keys.length - 1];
    const blob = await new Promise<Uint8Array>((res) => {
      const q = st.get(lastKey);
      q.onsuccess = () => res(q.result as Uint8Array);
    });
    const flipped = new Uint8Array(blob);
    flipped[flipped.length - 1] ^= 0xff;
    st.put(flipped, lastKey);
    await new Promise<void>((res) => {
      tx.oncomplete = () => res();
    });
    db.close();

    const onSnapshot = vi.fn();
    const api = fakeApi();
    const r = await hydrateReadCache(deps(persist("u-tamper", { debounceMs: 100000 }), api.fetchImpl), { onSnapshot });
    expect(onSnapshot).not.toHaveBeenCalled();
    expect(r.loaded.accounts).toBe(4);
    expect(await hasDb("u-tamper")).toBe(false);
    await disposeReadCache();
  });

  it("a snapshot from another build is wiped and not seeded", async () => {
    await seed("u-build", "build-OLD");
    const onSnapshot = vi.fn();
    const api = fakeApi();
    await hydrateReadCache(deps(persist("u-build", { build: "build-NEW", debounceMs: 100000 }), api.fetchImpl), { onSnapshot });
    expect(onSnapshot).not.toHaveBeenCalled();
    expect(await hasDb("u-build")).toBe(false);
    await disposeReadCache();
  });
});

describe("account switch", () => {
  it("the new owner gets only its own database; the previous owner's snapshot stays", async () => {
    await seed("u-A");
    const api = fakeApi();
    await hydrateReadCache(deps(persist("u-A", { debounceMs: 100000 }), api.fetchImpl));
    // Switching to user B disposes A's memory store; B has no snapshot, so B is network-only.
    const onSnapshot = vi.fn();
    const r = await hydrateReadCache(deps(persist("u-B", { debounceMs: 100000 }), api.fetchImpl), { onSnapshot });
    expect(onSnapshot).not.toHaveBeenCalled();
    expect(r.loaded.accounts).toBe(4);
    const names = await dbNames();
    expect(names).toContain(await readCacheDbName("u-A"));
    await disposeReadCache();
    expect(await hasDb("u-B")).toBe(false); // B's save is still pending (debounce not elapsed)
  });

  it("a session for the old owner is not reused for the new owner", async () => {
    await seed("u-own");
    const api = fakeApi();
    const onSnapshot = vi.fn();
    await hydrateReadCache(deps(persist("u-own", { debounceMs: 100000 }), api.fetchImpl));
    await hydrateReadCache(deps(persist("u-other", { debounceMs: 100000 }), api.fetchImpl), { onSnapshot });
    expect(onSnapshot).not.toHaveBeenCalled();
    await disposeReadCache();
  });
});

