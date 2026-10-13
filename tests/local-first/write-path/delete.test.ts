// @vitest-environment jsdom
// Offline delete (local-first L3): outbox op kind 'delete', idempotent drain, never a silent delete over a newer edit.
import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createWriteQueue } from "@/lib/local-first/write-path/queue";
import { createDrain, ROW_CHANGED_REASON } from "@/lib/local-first/write-path/drain";
import { LOCAL_WRITE_QUEUE_KEY } from "@/lib/local-first/write-path/flag";
import { LOCAL_READ_CACHE_KEY } from "@/lib/local-first/read-cache/optin";
import { wipeAll } from "@/lib/local-first/read-cache/persist-store";
import type { LocalRow, TransactionRow } from "@/lib/local-first/store/types";
import { FakeServer } from "./fake-server";

class FakeCache {
  tx = new Map<string, TransactionRow>();
  async upsertRows(_t: string, rows: LocalRow[]) { for (const r of rows) this.tx.set(r.id, r as TransactionRow); }
  async deleteRows(_t: string, ids: string[]) { for (const i of ids) this.tx.delete(i); }
}

let n = 0;
let uid = "";
const T0 = 5_000_000;
let t = T0;
const now = () => t;
const rowOf = (id: number, updatedAt: string | null): TransactionRow & { updatedAt: string | null } =>
  ({ id: String(id), serverId: id, date: "2026-10-01", accountId: "1", categoryId: "2", currency: "CAD", amount: -10, payee: "Cafe", note: null, tags: null, updatedAt });

beforeEach(() => {
  window.localStorage.clear();
  window.localStorage.setItem(LOCAL_READ_CACHE_KEY, "1");
  window.localStorage.setItem(LOCAL_WRITE_QUEUE_KEY, "1");
  uid = `del-user-${++n}-${Date.now()}`;
  t = T0;
});
afterEach(async () => {
  vi.restoreAllMocks();
  window.localStorage.clear();
  await wipeAll();
});

const setup = () => {
  let i = 0;
  const server = new FakeServer();
  server.clock = T0 - 1000;
  const q = createWriteQueue({ userId: uid, deviceId: "d1", now, allow: () => true, newId: () => `op${++i}` });
  const cache = new FakeCache();
  const drain = createDrain({ store: q.store, fetchImpl: server.fetch, cache, now, random: () => 0.5 });
  return { server, q, cache, drain };
};
const seedRow = (server: FakeServer) =>
  server.seed({ date: "2026-10-01", accountId: 1, categoryId: 2, currency: "CAD", amount: -10, payee: "Cafe", note: null, tags: null });

describe("flag off", () => {
  it("enqueueDelete / dequeueCreate do nothing and open no IndexedDB", async () => {
    window.localStorage.setItem(LOCAL_WRITE_QUEUE_KEY, "0");
    const open = vi.spyOn(indexedDB, "open");
    const q = createWriteQueue({ userId: uid, deviceId: "d1" });
    expect(await q.enqueueDelete(5, rowOf(5, null))).toBeNull();
    expect(await q.dequeueCreate("local-x")).toBeNull();
    expect(open).not.toHaveBeenCalled();
  });
});

describe("enqueueDelete", () => {
  it("stores a delete op, hides the row optimistically, supersedes a pending edit of that row", async () => {
    const { q, cache } = setup();
    cache.tx.set("5", rowOf(5, "x"));
    await q.enqueueEdit(5, { note: "n" }, rowOf(5, "x"), cache);
    const e = await q.enqueueDelete(5, rowOf(5, "2026-10-01T00:00:00.000Z"), cache);
    expect(e).toMatchObject({ kind: "delete", rowId: "5", serverId: 5, status: "pending", baseUpdatedAt: "2026-10-01T00:00:00.000Z" });
    expect(cache.tx.has("5")).toBe(false);
    expect((await q.pending()).map((x) => x.kind)).toEqual(["delete"]);
  });

  it("a second delete of the same row is the same entry (dedupe)", async () => {
    const { q } = setup();
    const a = await q.enqueueDelete(5, rowOf(5, null));
    const b = await q.enqueueDelete(5, rowOf(5, null));
    expect(b!.opId).toBe(a!.opId);
    expect(await q.pending()).toHaveLength(1);
  });

  it("replayPending re-hides a queued delete in a freshly hydrated cache", async () => {
    const { q } = setup();
    await q.enqueueDelete(5, rowOf(5, null));
    const cache = new FakeCache();
    cache.tx.set("5", rowOf(5, null));
    await q.replayPending(cache);
    expect(cache.tx.has("5")).toBe(false);
  });
});

describe("dequeueCreate", () => {
  it("a queued create deleted before syncing just removes the entry (nothing is sent)", async () => {
    const { q, server, cache, drain } = setup();
    const c = await q.enqueueCreate({ date: "2026-10-02", accountId: 1, categoryId: 2, amount: -5 }, cache);
    expect(await q.dequeueCreate(c!.rowId, cache)).not.toBeNull();
    expect(await q.pending()).toEqual([]);
    expect(cache.tx.has(c!.rowId)).toBe(false);
    await drain();
    expect(server.log).toEqual([]);
  });

  it("refuses when a send may already be in flight (the row may exist on the server)", async () => {
    const { q, server, drain } = setup();
    const c = await q.enqueueCreate({ date: "2026-10-02", accountId: 1, categoryId: 2, amount: -5 });
    server.script = ["lose"];
    await drain();
    expect(await q.dequeueCreate(c!.rowId)).toBeNull();
    expect(await q.pending()).toHaveLength(1);
  });
});

describe("drain a delete", () => {
  it("sends DELETE with the idempotency key and clears the entry", async () => {
    const { q, server, drain, cache } = setup();
    const id = seedRow(server);
    const base = server.rows.get(id)!.updatedAt as string;
    const e = await q.enqueueDelete(id, rowOf(id, base), cache);
    const r = await drain();
    expect(r.sent).toBe(1);
    expect(server.log.find((l) => l.method === "DELETE")).toMatchObject({ key: e!.opId });
    expect(server.rows.has(id)).toBe(false);
    expect(await q.pending()).toEqual([]);
  });

  it("row already gone on the server counts as success", async () => {
    const { q, server, drain } = setup();
    await q.enqueueDelete(77, rowOf(77, "2026-10-01T00:00:00.000Z"));
    const r = await drain();
    expect(r.failed).toBe(0);
    expect(server.log.some((l) => l.method === "DELETE")).toBe(false);
    expect(await q.pending()).toEqual([]);
  });

  it("DELETE answering 404 (deleted between the check and the send) counts as success", async () => {
    const { q, server } = setup();
    const id = seedRow(server);
    await q.enqueueDelete(id, rowOf(id, server.rows.get(id)!.updatedAt as string));
    const orig = server.fetch;
    server.fetch = async (url, init) => {
      if (init?.method === "DELETE") server.rows.delete(id);
      return orig(url, init);
    };
    const d = createDrain({ store: q.store, fetchImpl: server.fetch, now, random: () => 0.5 });
    const r = await d();
    expect(r.failed).toBe(0);
    expect(await q.pending()).toEqual([]);
  });

  it("row edited on the server since the baseline: failed 'Row changed on the server', row NOT deleted", async () => {
    const { q, server, drain } = setup();
    const id = seedRow(server);
    const base = server.rows.get(id)!.updatedAt as string;
    await q.enqueueDelete(id, rowOf(id, base));
    server.editDirect(id, { note: "edited elsewhere" }, T0 + 5000);
    const r = await drain();
    expect(r.failed).toBe(1);
    expect(server.rows.has(id)).toBe(true);
    expect(server.log.some((l) => l.method === "DELETE")).toBe(false);
    expect((await q.pending())[0]).toMatchObject({ status: "failed", failReason: ROW_CHANGED_REASON });
    // never retried automatically
    server.log.length = 0;
    await drain();
    expect(server.log).toEqual([]);
  });

  it("without an updatedAt baseline, a changed editable field is still caught", async () => {
    const { q, server, drain } = setup();
    const id = seedRow(server);
    await q.enqueueDelete(id, rowOf(id, null));
    server.editDirect(id, { payee: "Someone else" }, T0 + 5000);
    await drain();
    expect((await q.pending())[0]).toMatchObject({ status: "failed", failReason: ROW_CHANGED_REASON });
    expect(server.rows.has(id)).toBe(true);
  });

  it("a network failure backs off and retries; the delete lands later", async () => {
    const { q, server, drain } = setup();
    const id = seedRow(server);
    await q.enqueueDelete(id, rowOf(id, server.rows.get(id)!.updatedAt as string));
    server.script = ["net"];
    const a = await drain();
    expect(a.retryLater).toBe(1);
    expect(server.rows.has(id)).toBe(true);
    t += 60_000;
    const b = await drain();
    expect(b.sent).toBe(1);
    expect(server.rows.has(id)).toBe(false);
  });
});
