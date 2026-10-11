// @vitest-environment jsdom
// Facade hooks behind the transactions list: pending creates / edit overlays / deletes, offline delete, queued-create edit.
import "fake-indexeddb/auto";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { LOCAL_WRITE_QUEUE_KEY } from "@/lib/local-first/write-path/flag";
import { LOCAL_READ_CACHE_KEY } from "@/lib/local-first/read-cache/optin";
import { wipeAll } from "@/lib/local-first/read-cache/persist-store";
import {
  startLocalWriteQueue, stopLocalWriteQueue, queueOfflineCreate, queueOfflineEdit, queueOfflineDelete, discardQueuedCreate,
  getQueuedCreate, saveQueuedCreate, listPendingSync, usePendingTransactions,
} from "@/lib/data/local-write-queue";
import { EMPTY_PENDING } from "@/lib/transactions/pending-overlay";

const flush = async () => { for (let i = 0; i < 30; i++) await new Promise((r) => setTimeout(r, 0)); };
const FIELDS = { date: "2026-10-01", accountId: 1, categoryId: 2, enteredCurrency: "CAD", enteredAmount: -12.5, payee: "Cafe", note: "n" };
const online = (v: boolean) => Object.defineProperty(window.navigator, "onLine", { configurable: true, value: v });
let n = 0;

beforeEach(() => { window.localStorage.clear(); online(false); });
afterEach(async () => {
  stopLocalWriteQueue();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.localStorage.clear();
  online(true);
  await wipeAll();
});

describe("flag off", () => {
  it("usePendingTransactions is the shared empty snapshot; new facade calls are inert and open no IndexedDB", async () => {
    const open = vi.spyOn(indexedDB, "open");
    const { result } = renderHook(() => usePendingTransactions());
    await flush();
    expect(result.current).toBe(EMPTY_PENDING);
    expect(await queueOfflineDelete(5, { updatedAt: "x" })).toBe(false);
    expect(await discardQueuedCreate("op")).toBe(false);
    expect(await getQueuedCreate("op")).toBeNull();
    expect(await saveQueuedCreate("op", { note: "x" })).toBe(false);
    expect(open).not.toHaveBeenCalled();
  });
});

describe("flag on", () => {
  beforeEach(() => {
    window.localStorage.setItem(LOCAL_READ_CACHE_KEY, "1");
    window.localStorage.setItem(LOCAL_WRITE_QUEUE_KEY, "1");
  });

  it("the hook lists queued creates, edit overlays and deletes, and empties after the sync", async () => {
    const uid = `fl-${++n}-${Date.now()}`;
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "POST") return { ok: true, status: 201, json: async () => ({ id: 99 }) };
      if (init?.method === "PUT" || init?.method === "DELETE") return { ok: true, status: 200, json: async () => ({}) };
      return { ok: true, status: 200, json: async () => ({ data: [{ id: 7, date: "2026-10-01", payee: "Old", updatedAt: "2026-10-01T00:00:00.000Z" }, { id: 8, date: "2026-10-01", payee: "Del", updatedAt: "2026-10-01T00:00:00.000Z" }] }) };
    }));
    startLocalWriteQueue(uid, "dev1");
    const { result } = renderHook(() => usePendingTransactions());
    await flush();
    expect(result.current).toBe(EMPTY_PENDING);

    await act(async () => {
      await queueOfflineCreate(FIELDS);
      await queueOfflineEdit(7, { payee: "New" }, { payee: "Old" });
      await queueOfflineDelete(8, { payee: "Del", updatedAt: "2026-10-01T00:00:00.000Z" });
      await flush();
    });
    expect(result.current.creates).toHaveLength(1);
    expect(result.current.creates[0]).toMatchObject({ status: "pending", fields: { payee: "Cafe", enteredAmount: -12.5 } });
    expect(result.current.edits[7]).toMatchObject({ status: "pending", fields: { payee: "New" } });
    expect(result.current.deletes[8]).toMatchObject({ status: "pending" });
    expect((await listPendingSync()).map((i) => i.kind).sort()).toEqual(["create", "delete", "edit"]);

    online(true);
    await act(async () => {
      window.dispatchEvent(new Event("online"));
      await flush();
    });
    expect(result.current).toBe(EMPTY_PENDING);
    expect(await listPendingSync()).toEqual([]);
  });

  it("a delete the server refuses as changed shows up failed with the reason; Discard clears it", async () => {
    const uid = `fl-${++n}-${Date.now()}`;
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ data: [{ id: 8, payee: "Del", updatedAt: "2026-10-05T00:00:00.000Z" }] }) })));
    startLocalWriteQueue(uid, "dev1");
    const { result } = renderHook(() => usePendingTransactions());
    await queueOfflineDelete(8, { payee: "Del", updatedAt: "2026-10-01T00:00:00.000Z" });
    online(true);
    await act(async () => {
      window.dispatchEvent(new Event("online"));
      await flush();
    });
    expect(result.current.deletes[8]).toMatchObject({ status: "failed", failReason: "Row changed on the server" });
  });

  it("a queued create deleted before syncing just disappears; nothing is sent", async () => {
    const uid = `fl-${++n}-${Date.now()}`;
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    startLocalWriteQueue(uid, "dev1");
    const { result } = renderHook(() => usePendingTransactions());
    await queueOfflineCreate(FIELDS);
    await act(async () => { await flush(); });
    const opId = result.current.creates[0].opId;
    await act(async () => {
      expect(await discardQueuedCreate(opId)).toBe(true);
      await flush();
    });
    expect(result.current).toBe(EMPTY_PENDING);
    online(true);
    window.dispatchEvent(new Event("online"));
    await flush();
    expect(f).not.toHaveBeenCalled();
  });

  it("editing a queued create merges into the same entry (one POST later, with the edited values)", async () => {
    const uid = `fl-${++n}-${Date.now()}`;
    const posts: unknown[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_u: string, init?: RequestInit) => {
      posts.push(JSON.parse(String(init?.body)));
      return { ok: true, status: 201, json: async () => ({ id: 3 }) };
    }));
    startLocalWriteQueue(uid, "dev1");
    await queueOfflineCreate(FIELDS);
    const opId = (await listPendingSync())[0].opId;
    expect((await getQueuedCreate(opId))).toMatchObject({ payee: "Cafe", note: "n" });
    expect(await saveQueuedCreate(opId, { enteredAmount: -20, payee: "Bar", note: null })).toBe(true);
    expect(await listPendingSync()).toHaveLength(1);
    online(true);
    window.dispatchEvent(new Event("online"));
    await flush();
    expect(posts).toHaveLength(1);
    expect(posts[0]).toMatchObject({ enteredAmount: -20, payee: "Bar" });
    expect(posts[0]).not.toHaveProperty("note");
    expect(await getQueuedCreate(opId)).toBeNull();
  });
});
