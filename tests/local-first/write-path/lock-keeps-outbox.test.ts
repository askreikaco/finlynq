// @vitest-environment jsdom
// Offline mode is ON by default, so queued writes are the only copy of unsynced changes. A LOCK must keep the outbox;
// logout, untrusted device, account deletion and an explicit opt-out remove it. After unlock the kept entries drain.
import "fake-indexeddb/auto";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { wipeAll, saveSnapshot, readCacheDbName } from "@/lib/local-first/read-cache/persist-store";
import { outboxDbName, createOutboxStore } from "@/lib/local-first/write-path/outbox-store";
import { clearPerUserStorage } from "@/lib/client/hard-reload";
import { setLocalWriteQueueEnabled } from "@/lib/local-first/write-path/flag";
import {
  startLocalWriteQueue, stopLocalWriteQueue, queueOfflineCreate, listPendingSync, isLocalWriteQueueActive,
} from "@/lib/data/local-write-queue";
import { dropAllLocalCaches, dropLocalDisposableCaches, dropLocalUserCache, dropSignedOutDisposableCaches } from "@/lib/data/local-read-cache-wipe";

const flush = async () => { for (let i = 0; i < 30; i++) await new Promise((r) => setTimeout(r, 0)); };
const dbNames = async () => (await indexedDB.databases()).map((d) => d.name ?? "");
const setOnline = (on: boolean) => Object.defineProperty(window.navigator, "onLine", { configurable: true, value: on });
const FIELDS = { date: "2026-10-01", accountId: 1, categoryId: 2, enteredCurrency: "CAD", enteredAmount: -12.5, payee: "Cafe" };
let n = 0;

beforeEach(() => {
  window.localStorage.clear(); // both switches absent = ON by default
  setOnline(false);
});
afterEach(async () => {
  stopLocalWriteQueue();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  setOnline(true);
  window.localStorage.clear();
  await wipeAll();
});

/** Starts the queue for `uid` and queues one create while offline. Returns the outbox db name. */
async function queueOneOffline(uid: string): Promise<string> {
  vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
  expect(startLocalWriteQueue(uid, "dev1")).toBe(true);
  expect(await queueOfflineCreate(FIELDS)).toBe(true);
  await flush();
  expect((await listPendingSync()).map((i) => i.status)).toEqual(["pending"]);
  return outboxDbName(uid);
}

describe("lock keeps the outbox", () => {
  it("lock with queued entries keeps them (outbox database and entries survive)", async () => {
    const uid = `lock-${++n}-${Date.now()}`;
    const db = await queueOneOffline(uid);
    await dropLocalDisposableCaches(uid);
    expect(isLocalWriteQueueActive()).toBe(false); // scheduler stopped while locked
    expect(await dbNames()).toContain(db);
    // The entries are still there: read them straight from the store, not through the (stopped) facade.
    const { createOutboxStore } = await import("@/lib/local-first/write-path/outbox-store");
    const left = await createOutboxStore(uid, "dev1").list();
    expect(left.map((e) => e.opId)).toHaveLength(1);
  });

  it("after unlock the kept entries drain to the server", async () => {
    const uid = `lock-${++n}-${Date.now()}`;
    await queueOneOffline(uid);
    await dropLocalDisposableCaches(uid);

    const calls: Array<{ url: string; init?: RequestInit }> = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return { ok: true, status: 201, json: async () => ({ id: 99 }) };
    }));
    // Unlock: the page reloads and the provider starts the queue again for the trusted, unlocked device.
    setOnline(true);
    expect(startLocalWriteQueue(uid, "dev1")).toBe(true);
    await flush();
    expect(calls.filter((c) => c.url === "/api/transactions" && c.init?.method === "POST")).toHaveLength(1);
    expect(await listPendingSync()).toEqual([]);
  });
});

describe("logout, untrust, delete and opt-out remove the outbox", () => {
  it("logout (dropLocalUserCache) removes that user's outbox", async () => {
    const uid = `out-${++n}-${Date.now()}`;
    const db = await queueOneOffline(uid);
    expect(await dbNames()).toContain(db);
    await dropLocalUserCache(uid);
    expect(await dbNames()).not.toContain(db);
  });

  it("untrusted device (dropLocalUserCache) removes that user's outbox", async () => {
    const uid = `out-${++n}-${Date.now()}`;
    const db = await queueOneOffline(uid);
    await dropLocalUserCache(uid);
    expect(await dbNames()).not.toContain(db);
  });

  it("account deletion / signed-out boot (dropAllLocalCaches) removes every outbox", async () => {
    const uid = `out-${++n}-${Date.now()}`;
    const db = await queueOneOffline(uid);
    await dropAllLocalCaches();
    expect(await dbNames()).not.toContain(db);
  });

  it("explicit opt-out ('0') removes every outbox on this browser", async () => {
    const uid = `out-${++n}-${Date.now()}`;
    const db = await queueOneOffline(uid);
    setLocalWriteQueueEnabled(false);
    await vi.waitFor(async () => expect(await dbNames()).not.toContain(db));
    expect(window.localStorage.getItem("finlynq.lf.write")).toBe("0");
  });
});

describe("expired (signed-out) session keeps unsynced writes; explicit sign-out removes them", () => {
  const EMPTY = { accounts: [], categories: [], transactions: [] };

  it("expiry drops the snapshot but keeps the outbox; the same account drains after signing in again", async () => {
    const uid = `exp-${++n}-${Date.now()}`;
    const db = await queueOneOffline(uid);
    await saveSnapshot(uid, "dev1", EMPTY, { build: "dev", schemaVer: 1 });
    expect(await dbNames()).toContain(await readCacheDbName(uid));

    await dropSignedOutDisposableCaches();
    const names = await dbNames();
    expect(names).not.toContain(await readCacheDbName(uid)); // disposable: gone
    expect(names).toContain(db); // unsynced writes: kept
    expect((await createOutboxStore(uid, "dev1").list()).map((e) => e.opId)).toHaveLength(1);

    // Same account signs in again: the queue starts and drains the kept entries.
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return { ok: true, status: 201, json: async () => ({ id: 7 }) };
    }));
    setOnline(true);
    expect(startLocalWriteQueue(uid, "dev1")).toBe(true);
    await flush();
    expect(calls.filter((c) => c.url === "/api/transactions" && c.init?.method === "POST")).toHaveLength(1);
    expect(await listPendingSync()).toEqual([]);
  });

  it("explicit logout (clearPerUserStorage) wipes that user's outbox", async () => {
    const uid = `exp-${++n}-${Date.now()}`;
    const db = await queueOneOffline(uid);
    clearPerUserStorage(uid);
    await vi.waitFor(async () => expect(await dbNames()).not.toContain(db));
  });

  it("another user signing in never opens, reads or drains user A's outbox", async () => {
    const a = `usera-${++n}-${Date.now()}`;
    const b = `userb-${++n}-${Date.now()}`;
    const dbA = await queueOneOffline(a);
    await dropSignedOutDisposableCaches(); // A's session expired; A's outbox stays on this device

    const opened: string[] = [];
    const openSpy = vi.spyOn(indexedDB, "open");
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return { ok: true, status: 201, json: async () => ({ id: 1 }) };
    }));
    setOnline(true);
    expect(startLocalWriteQueue(b, "devB")).toBe(true); // B signs in on the same device
    await flush();
    for (const c of openSpy.mock.calls) opened.push(String(c[0]));
    openSpy.mockRestore();

    expect(opened).not.toContain(dbA);
    expect(calls.some((c) => String(c.init?.body ?? "").includes("Cafe"))).toBe(false); // nothing of A's was sent
    expect(calls.filter((c) => c.init?.method === "POST")).toHaveLength(0); // B's own outbox is empty
    // A's entries are untouched and still readable by A's own key and session.
    expect(await dbNames()).toContain(dbA);
    expect((await createOutboxStore(a, "dev1").list())).toHaveLength(1);
  });
});
