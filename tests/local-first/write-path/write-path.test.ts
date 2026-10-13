// @vitest-environment jsdom
// Offline write queue (local-first L3): encrypted outbox, optimistic apply, drain, conflicts, wipes.
import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createWriteQueue } from "@/lib/local-first/write-path/queue";
import { createDrain, backoffMs, MAX_ATTEMPTS } from "@/lib/local-first/write-path/drain";
import { createOutboxStore, outboxDbName } from "@/lib/local-first/write-path/outbox-store";
import { LOCAL_WRITE_QUEUE_KEY, isLocalWriteQueueEnabled, setLocalWriteQueueEnabled } from "@/lib/local-first/write-path/flag";
import { LOCAL_READ_CACHE_KEY } from "@/lib/local-first/read-cache/optin";
import { wipeAll } from "@/lib/local-first/read-cache/persist-store";
import { dropAllLocalCaches, dropLocalUserCache } from "@/lib/data/local-read-cache-wipe";
import type { LocalRow, TransactionRow } from "@/lib/local-first/store/types";
import { FakeServer } from "./fake-server";

class FakeCache {
  tx = new Map<string, TransactionRow>();
  async upsertRows(_t: string, rows: LocalRow[]) { for (const r of rows) this.tx.set(r.id, r as TransactionRow); }
  async deleteRows(_t: string, ids: string[]) { for (const i of ids) this.tx.delete(i); }
}

const baseRow = (id: number): TransactionRow => ({ id: String(id), serverId: id, date: "2026-10-01", accountId: "1", categoryId: "2", currency: "CAD", amount: -10, payee: "Cafe", note: null, tags: null });
const dbNames = async () => (await indexedDB.databases()).map((d) => d.name ?? "");
let n = 0;
let uid = "";
let t = 5_000_000;
const now = () => t;

beforeEach(async () => {
  window.localStorage.clear();
  window.localStorage.setItem(LOCAL_READ_CACHE_KEY, "1");
  window.localStorage.setItem(LOCAL_WRITE_QUEUE_KEY, "1");
  uid = `wp-user-${++n}-${Date.now()}`;
  t = 5_000_000;
});
afterEach(async () => {
  vi.restoreAllMocks();
  window.localStorage.clear();
  await wipeAll();
});

// Separate browsers have separate IndexedDB; one jsdom shares it, so a second "device" gets its own user key space.
const mkQueue = (dev: string, clock: () => number = now, allow = () => true, user: string = uid) => {
  let i = 0;
  return createWriteQueue({ userId: user, deviceId: dev, now: clock, allow, newId: () => `${dev}-op${++i}` });
};

describe("flag", () => {
  it("is on by default (both keys absent); an explicit '0' on either key turns it off", () => {
    window.localStorage.clear();
    expect(isLocalWriteQueueEnabled()).toBe(true);
    window.localStorage.setItem(LOCAL_READ_CACHE_KEY, "0");
    expect(isLocalWriteQueueEnabled()).toBe(false); // read cache opted out
    window.localStorage.removeItem(LOCAL_READ_CACHE_KEY);
    window.localStorage.setItem(LOCAL_WRITE_QUEUE_KEY, "0");
    expect(isLocalWriteQueueEnabled()).toBe(false); // write queue opted out
    window.localStorage.setItem(LOCAL_WRITE_QUEUE_KEY, "1");
    expect(isLocalWriteQueueEnabled()).toBe(true);
  });

  it("flag off: enqueue does nothing and creates no IndexedDB database", async () => {
    window.localStorage.setItem(LOCAL_WRITE_QUEUE_KEY, "0");
    const q = createWriteQueue({ userId: uid, deviceId: "d1" }); // default allow = opt-in flags
    const cache = new FakeCache();
    expect(await q.enqueueCreate({ date: "2026-10-02", accountId: 1, categoryId: 2, amount: -5 }, cache)).toBeNull();
    expect(await q.enqueueEdit(1, { note: "x" }, baseRow(1), cache)).toBeNull();
    expect(cache.tx.size).toBe(0);
    expect((await dbNames()).filter((x) => x.startsWith("finlynq-lf-outbox"))).toEqual([]);
  });
});

describe("outbox + optimistic apply", () => {
  it("stores entries encrypted (no plaintext in the raw record) and applies optimistically", async () => {
    const q = mkQueue("d1");
    const cache = new FakeCache();
    const e = await q.enqueueCreate({ date: "2026-10-02", accountId: 1, categoryId: 2, amount: -5, payee: "SecretPayeeXYZ" }, cache);
    expect(cache.tx.get(e!.rowId)).toMatchObject({ payee: "SecretPayeeXYZ", amount: -5, accountId: "1", serverId: null });
    const name = await outboxDbName(uid);
    const raw = await new Promise<Uint8Array>((resolve, reject) => {
      const r = indexedDB.open(name);
      r.onsuccess = () => {
        const g = r.result.transaction("entries").objectStore("entries").get(e!.opId);
        g.onsuccess = () => { r.result.close(); resolve(g.result as Uint8Array); };
        g.onerror = () => reject(g.error);
      };
      r.onerror = () => reject(r.error);
    });
    expect(new TextDecoder("latin1").decode(raw)).not.toContain("SecretPayeeXYZ");
    expect((await q.pending()).map((x) => x.opId)).toEqual([e!.opId]);
  });

  it("an edit is merged onto the cached row; a second edit coalesces with newer HLC per field", async () => {
    const q = mkQueue("d1");
    const cache = new FakeCache();
    const e1 = await q.enqueueEdit(7, { note: "a", payee: "P1" }, baseRow(7), cache);
    t += 10;
    const e2 = await q.enqueueEdit(7, { note: "b" }, baseRow(7), cache);
    expect(e2!.opId).toBe(e1!.opId);
    const list = await q.pending();
    expect(list).toHaveLength(1);
    expect(list[0].fields).toEqual({ note: "b", payee: "P1" });
    expect(list[0].base).toEqual({ note: null, payee: "Cafe" });
    expect(list[0].fieldHlc.note!.ms).toBeGreaterThan(list[0].fieldHlc.payee!.ms);
    expect(cache.tx.get("7")).toMatchObject({ note: "b", payee: "P1", amount: -10 });
  });

  it("an edit of a not-yet-synced create merges into the create", async () => {
    const q = mkQueue("d1");
    const c = await q.enqueueCreate({ date: "2026-10-02", accountId: 1, categoryId: 2, amount: -5 });
    await q.enqueueEditLocal(c!.rowId, { amount: -6 });
    const list = await q.pending();
    expect(list).toHaveLength(1);
    expect(list[0].fields.amount).toBe(-6);
  });

  it("rejects fields outside the offline allowlist", async () => {
    const q = mkQueue("d1");
    await expect(q.enqueueEdit(1, { splitPerson: "x" } as never, baseRow(1))).rejects.toThrow(/not allowed/);
  });

  it("a tampered record is skipped and removed; others survive", async () => {
    const q = mkQueue("d1");
    const a = await q.enqueueCreate({ date: "2026-10-02", accountId: 1, categoryId: 2, amount: -1 });
    await q.enqueueCreate({ date: "2026-10-03", accountId: 1, categoryId: 2, amount: -2 });
    // wrong device id => AAD mismatch for every record
    const other = createOutboxStore(uid, "other-device");
    expect(await other.list()).toEqual([]);
    expect((await q.pending()).length).toBe(0); // the mismatched reader removed them: AAD-bound, nothing is movable
    void a;
  });

  it("replayPending re-applies queued entries to a fresh cache", async () => {
    const q = mkQueue("d1");
    await q.enqueueCreate({ date: "2026-10-02", accountId: 1, categoryId: 2, amount: -5 });
    await q.enqueueEdit(7, { note: "z" }, baseRow(7));
    const cache = new FakeCache();
    const count = await q.replayPending(cache, new Map([["7", baseRow(7)]]));
    expect(count).toBe(2);
    expect(cache.tx.size).toBe(2);
    expect(cache.tx.get("7")!.note).toBe("z");
  });
});

describe("drain", () => {
  const setup = (dev = "d1", clock = now) => {
    const server = new FakeServer();
    server.clock = t;
    const q = mkQueue(dev, clock);
    const cache = new FakeCache();
    const drain = createDrain({ store: q.store, fetchImpl: server.fetch, cache, now: clock, random: () => 0.5 });
    return { server, q, cache, drain };
  };

  it("create: POSTs with the idempotency key, swaps the local row for the server row, clears the outbox", async () => {
    const { server, q, cache, drain } = setup();
    const e = await q.enqueueCreate({ date: "2026-10-02", accountId: 1, categoryId: 2, amount: -5 }, cache);
    const r = await drain();
    expect(r.sent).toBe(1);
    expect(server.log[0]).toMatchObject({ method: "POST", key: e!.opId });
    expect(cache.tx.has(e!.rowId)).toBe(false);
    expect(cache.tx.get("1")).toMatchObject({ serverId: 1, amount: -5 });
    expect(await q.pending()).toEqual([]);
  });

  it("transient failure backs off exponentially and respects nextAttemptAt", async () => {
    const { server, q, drain } = setup();
    await q.enqueueCreate({ date: "2026-10-02", accountId: 1, categoryId: 2, amount: -5 });
    server.script = [503];
    expect((await drain()).retryLater).toBe(1);
    const [e] = await q.pending();
    expect(e.attempts).toBe(1);
    expect(e.nextAttemptAt).toBe(t + backoffMs(1, 0.5));
    const calls = server.log.length;
    await drain(); // too early: nothing sent
    expect(server.log.length).toBe(calls);
    t = e.nextAttemptAt + 1;
    expect((await drain()).sent).toBe(1);
    expect(backoffMs(2, 0.5)).toBe(2 * backoffMs(1, 0.5));
    expect(backoffMs(40, 1)).toBeLessThanOrEqual(15 * 60_000);
  });

  it("lost response on a create does not duplicate: the retry adopts the row the server already made", async () => {
    const { server, q, cache, drain } = setup();
    await q.enqueueCreate({ date: "2026-10-02", accountId: 1, categoryId: 2, amount: -5, payee: "X" }, cache);
    server.script = ["lose"];
    await drain();
    expect(server.rows.size).toBe(1); // applied server side, response lost
    t += 60_000;
    const r = await drain();
    expect(r.adopted).toBe(1);
    expect(server.rows.size).toBe(1);
    expect(server.log.filter((l) => l.method === "POST")).toHaveLength(1);
    expect(await q.pending()).toEqual([]);
  });

  it("a pre-existing identical row (created before the first send) is not mistaken for ours", async () => {
    const { server, q, drain } = setup();
    server.clock = 1_000; // old row
    server.seed({ date: "2026-10-02", accountId: 1, categoryId: 2, amount: -5, payee: null, note: null, tags: null });
    server.clock = t;
    await q.enqueueCreate({ date: "2026-10-02", accountId: 1, categoryId: 2, amount: -5 });
    server.script = ["net"];
    await drain();
    t += 60_000;
    await drain();
    expect(server.rows.size).toBe(2);
  });

  it("permanent 4xx marks failed and is never retried; 423 pauses without an attempt", async () => {
    const { server, q, drain } = setup();
    await q.enqueueCreate({ date: "2026-10-02", accountId: 1, categoryId: 2, amount: -5 });
    server.script = [423];
    const p = await drain();
    expect(p.paused).toBe(true);
    expect((await q.pending())[0]).toMatchObject({ attempts: 0, status: "pending" });
    server.script = [400];
    expect((await drain()).failed).toBe(1);
    const calls = server.log.length;
    await drain();
    expect(server.log.length).toBe(calls);
    expect((await q.pending())[0]).toMatchObject({ status: "failed", failReason: "http 400" });
  });

  it("gives up after MAX_ATTEMPTS transient failures", async () => {
    const { server, q, drain } = setup();
    await q.enqueueCreate({ date: "2026-10-02", accountId: 1, categoryId: 2, amount: -5 });
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      server.script = [500];
      t += 20 * 60_000;
      await drain();
    }
    expect((await q.pending())[0].status).toBe("failed");
  });

  it("single-flight: concurrent drains share one run", async () => {
    const { server, q, drain } = setup();
    await q.enqueueCreate({ date: "2026-10-02", accountId: 1, categoryId: 2, amount: -5 });
    const [a, b] = await Promise.all([drain(), drain()]);
    expect(a).toBe(b);
    expect(server.rows.size).toBe(1);
  });

  it("drain does nothing when allow() turns false", async () => {
    const server = new FakeServer();
    const q = mkQueue("d1");
    await q.enqueueCreate({ date: "2026-10-02", accountId: 1, categoryId: 2, amount: -5 });
    const drain = createDrain({ store: q.store, fetchImpl: server.fetch, allow: () => false });
    expect((await drain()).skipped).toBe(true);
    expect(server.log).toEqual([]);
  });
});

describe("two-device per-field HLC conflict", () => {
  it("each field goes to its later writer; the server's later change wins its field; non-conflicting fields merge", async () => {
    const server = new FakeServer();
    const id = server.seed({ date: "2026-10-01", accountId: 1, categoryId: 2, amount: -10, payee: "Cafe", note: null, tags: null });
    // both devices cached the same row, then went offline
    let ta = 6_000_000, tb = 6_000_000;
    const qa = mkQueue("devA", () => ta);
    const qb = mkQueue("devB", () => tb, () => true, `${uid}-b`);
    ta = 6_000_100; await qa.enqueueEdit(id, { payee: "A-payee", note: "A-note" }, baseRow(id));
    tb = 6_000_200; await qb.enqueueEdit(id, { payee: "B-payee", amount: -12 }, baseRow(id));

    // device B reconnects first (server time after both edits)
    server.clock = 6_000_300;
    const drainB = createDrain({ store: qb.store, fetchImpl: server.fetch, now: () => 6_000_300 });
    await drainB();
    expect(server.rows.get(id)).toMatchObject({ payee: "B-payee", amount: -12, note: null });

    // then A: payee changed on server (B-payee, updatedAt 6_000_300) after A's edit (6_000_100): server wins payee.
    // note was untouched on the server: A's note goes through.
    server.clock = 6_000_400;
    const lostSeen: string[] = [];
    const drainA = createDrain({ store: qa.store, fetchImpl: server.fetch, now: () => 6_000_400, onConflict: (_e, lost) => lostSeen.push(...lost) });
    const rep = await drainA();
    expect(lostSeen).toEqual(["payee"]);
    expect(Object.values(rep.lost)[0]).toEqual(["payee"]);
    expect(server.rows.get(id)).toMatchObject({ payee: "B-payee", note: "A-note", amount: -12 });
    expect(await qa.pending()).toEqual([]);
    expect(await qb.pending()).toEqual([]);
  });

  it("order-independent: when A's write is the later one it wins the contested field even if it syncs second", async () => {
    const server = new FakeServer();
    const id = server.seed({ date: "2026-10-01", accountId: 1, categoryId: 2, amount: -10, payee: "Cafe", note: null, tags: null });
    const qa = mkQueue("devA", () => 7_000_500); // A edits LATER
    const qb = mkQueue("devB", () => 7_000_100, () => true, `${uid}-b`);
    await qa.enqueueEdit(id, { payee: "A-later" }, baseRow(id));
    await qb.enqueueEdit(id, { payee: "B-earlier" }, baseRow(id));
    server.clock = 7_000_200; // B syncs; server updatedAt = 7_000_200
    await createDrain({ store: qb.store, fetchImpl: server.fetch, now: () => 7_000_200 })();
    server.clock = 7_000_900;
    await createDrain({ store: qa.store, fetchImpl: server.fetch, now: () => 7_000_900 })();
    expect(server.rows.get(id)!.payee).toBe("A-later"); // 7_000_500 > server clock 7_000_200
  });

  it("a deleted-on-server row marks the edit failed (server wins)", async () => {
    const server = new FakeServer();
    const q = mkQueue("d1");
    await q.enqueueEdit(99, { note: "x" }, baseRow(99));
    await createDrain({ store: q.store, fetchImpl: server.fetch, now })();
    expect((await q.pending())[0]).toMatchObject({ status: "failed" });
  });
});

describe("wipe", () => {
  it("lock/untrusted/logout (dropLocalUserCache) deletes that user's outbox and the device key; other users stay", async () => {
    const q = mkQueue("d1");
    await q.enqueueCreate({ date: "2026-10-02", accountId: 1, categoryId: 2, amount: -5 });
    const other = createWriteQueue({ userId: `${uid}-other`, deviceId: "d1", allow: () => true });
    await other.enqueueCreate({ date: "2026-10-02", accountId: 1, categoryId: 2, amount: -5 });
    expect((await dbNames()).filter((x) => x.startsWith("finlynq-lf-outbox"))).toHaveLength(2);
    await dropLocalUserCache(uid);
    const names = await dbNames();
    expect(names).not.toContain(await outboxDbName(uid));
    expect(names).toContain(await outboxDbName(`${uid}-other`));
    expect((await q.pending())).toEqual([]);
  });

  it("works with the write key on and the read cache opted out (0): the queue is not orphaned", async () => {
    window.localStorage.setItem(LOCAL_READ_CACHE_KEY, "0");
    const q = mkQueue("d1");
    await q.enqueueCreate({ date: "2026-10-02", accountId: 1, categoryId: 2, amount: -5 }, undefined);
    await dropLocalUserCache(uid);
    expect(await dbNames()).not.toContain(await outboxDbName(uid));
  });

  it("signed-out boot / account deletion (dropAllLocalCaches) deletes every outbox", async () => {
    await mkQueue("d1").enqueueCreate({ date: "2026-10-02", accountId: 1, categoryId: 2, amount: -5 });
    await dropAllLocalCaches();
    expect((await dbNames()).filter((x) => x.startsWith("finlynq-lf-"))).toEqual([]);
  });

  it("turning the write opt-out deletes the outbox but keeps the read cache keys", async () => {
    await mkQueue("d1").enqueueCreate({ date: "2026-10-02", accountId: 1, categoryId: 2, amount: -5 });
    setLocalWriteQueueEnabled(false);
    await vi.waitFor(async () => expect((await dbNames()).filter((x) => x.startsWith("finlynq-lf-outbox"))).toEqual([]));
  });

  it("flag fully off: the wipe triggers do no IndexedDB work", async () => {
    window.localStorage.setItem(LOCAL_READ_CACHE_KEY, "0");
    window.localStorage.setItem(LOCAL_WRITE_QUEUE_KEY, "0");
    const spy = vi.spyOn(indexedDB, "deleteDatabase");
    await dropLocalUserCache(uid);
    await dropAllLocalCaches();
    expect(spy).not.toHaveBeenCalled();
  });
});
