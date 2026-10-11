// @vitest-environment jsdom
// App facade for the offline write queue: inert while the flag is off; wired end to end when on.
import "fake-indexeddb/auto";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { LOCAL_WRITE_QUEUE_KEY } from "@/lib/local-first/write-path/flag";
import { LOCAL_READ_CACHE_KEY } from "@/lib/local-first/read-cache/optin";
import { wipeAll } from "@/lib/local-first/read-cache/persist-store";
import {
  startLocalWriteQueue, stopLocalWriteQueue, queueOfflineCreate, queueOfflineEdit, listPendingSync,
  retryPendingSync, discardPendingSync, isLocalWriteQueueActive,
} from "@/lib/data/local-write-queue";
import { dropLocalUserCache } from "@/lib/data/local-read-cache-wipe";

const flush = async () => { for (let i = 0; i < 30; i++) await new Promise((r) => setTimeout(r, 0)); };
const FIELDS = { date: "2026-10-01", accountId: 1, categoryId: 2, enteredCurrency: "CAD", enteredAmount: -12.5, payee: "Cafe" };
let n = 0;

beforeEach(() => { window.localStorage.clear(); });
afterEach(async () => {
  stopLocalWriteQueue();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.localStorage.clear();
  await wipeAll();
});

describe("flag off", () => {
  it("start is a no-op, nothing is queued, no IndexedDB is opened, fetch never called", async () => {
    const open = vi.spyOn(indexedDB, "open");
    const f = vi.fn(); vi.stubGlobal("fetch", f);
    expect(startLocalWriteQueue("u-off", "d1")).toBe(false);
    expect(isLocalWriteQueueActive()).toBe(false);
    expect(await queueOfflineCreate(FIELDS)).toBe(false);
    expect(await queueOfflineEdit(5, { note: "x" }, { note: null })).toBe(false);
    expect(await listPendingSync()).toEqual([]);
    expect(open).not.toHaveBeenCalled();
    expect(f).not.toHaveBeenCalled();
  });

  it("write key alone (no read-cache opt-in) is still off", async () => {
    window.localStorage.setItem(LOCAL_WRITE_QUEUE_KEY, "1");
    expect(startLocalWriteQueue("u-off2", "d1")).toBe(false);
    expect(await queueOfflineCreate(FIELDS)).toBe(false);
  });
});

describe("flag on", () => {
  beforeEach(() => {
    window.localStorage.setItem(LOCAL_READ_CACHE_KEY, "1");
    window.localStorage.setItem(LOCAL_WRITE_QUEUE_KEY, "1");
  });

  it("a queued create is sent by the scheduler (Idempotency-Key) once online, then leaves the outbox", async () => {
    const uid = `fac-${++n}-${Date.now()}`;
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return { ok: true, status: 201, json: async () => ({ id: 99 }) };
    }));
    // Offline first: enqueue, no send.
    Object.defineProperty(window.navigator, "onLine", { configurable: true, value: false });
    expect(startLocalWriteQueue(uid, "dev1")).toBe(true);
    expect(await queueOfflineCreate(FIELDS)).toBe(true);
    await flush();
    expect(calls).toEqual([]);
    expect((await listPendingSync()).map((i) => [i.kind, i.status])).toEqual([["create", "pending"]]);
    // Back online.
    Object.defineProperty(window.navigator, "onLine", { configurable: true, value: true });
    window.dispatchEvent(new Event("online"));
    await flush();
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("/api/transactions");
    expect(calls[0].init?.method).toBe("POST");
    expect((calls[0].init?.headers as Record<string, string>)["Idempotency-Key"]).toBeTruthy();
    expect(await listPendingSync()).toEqual([]);
  });

  it("lock/logout wipe trigger stops the scheduler: later events send nothing", async () => {
    const uid = `fac-${++n}-${Date.now()}`;
    const f = vi.fn(async () => ({ ok: true, status: 201, json: async () => ({ id: 1 }) }));
    vi.stubGlobal("fetch", f);
    Object.defineProperty(window.navigator, "onLine", { configurable: true, value: false });
    startLocalWriteQueue(uid, "dev1");
    await queueOfflineCreate(FIELDS);
    await dropLocalUserCache(uid);
    expect(isLocalWriteQueueActive()).toBe(false);
    Object.defineProperty(window.navigator, "onLine", { configurable: true, value: true });
    window.dispatchEvent(new Event("online"));
    await flush();
    expect(f).not.toHaveBeenCalled();
    expect(await queueOfflineCreate(FIELDS)).toBe(false);
  });

  it("a permanent 4xx marks the entry failed; Retry re-queues it, Discard removes it", async () => {
    const uid = `fac-${++n}-${Date.now()}`;
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 400, json: async () => ({}) })));
    startLocalWriteQueue(uid, "dev1");
    await queueOfflineCreate(FIELDS);
    await flush();
    const failed = await listPendingSync();
    expect(failed.map((i) => i.status)).toEqual(["failed"]);
    await retryPendingSync(failed[0].opId);
    await flush();
    expect((await listPendingSync()).map((i) => i.status)).toEqual(["failed"]); // 400 again
    await discardPendingSync(failed[0].opId);
    expect(await listPendingSync()).toEqual([]);
  });
});
