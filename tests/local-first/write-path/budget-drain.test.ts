// @vitest-environment jsdom
// Budgets through the offline write queue (local-first L3): create, edit, delete, lost responses, conflicts, failures.
import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createWriteQueue, type WriteQueue } from "@/lib/local-first/write-path/queue";
import { createDrain, ROW_CHANGED_REASON, backoffMs } from "@/lib/local-first/write-path/drain";
import { LOCAL_WRITE_QUEUE_KEY } from "@/lib/local-first/write-path/flag";
import { LOCAL_READ_CACHE_KEY } from "@/lib/local-first/read-cache/optin";
import { wipeAll } from "@/lib/local-first/read-cache/persist-store";
import type { OutboxEntry } from "@/lib/local-first/write-path/types";
import { BudgetFakeServer } from "./budget-fake-server";

const MONTH = "2026-10";
const CAT = { categoryId: 1, month: MONTH };
let n = 0;
let t = 5_000_000;
const now = () => t;
let uid = "";

beforeEach(() => {
  window.localStorage.setItem(LOCAL_READ_CACHE_KEY, "1");
  window.localStorage.setItem(LOCAL_WRITE_QUEUE_KEY, "1");
  uid = `budget-user-${++n}-${Date.now()}`;
  t = 5_000_000;
});
afterEach(async () => {
  vi.restoreAllMocks();
  window.localStorage.clear();
  await wipeAll();
});

function mkQueue(): WriteQueue {
  let i = 0;
  return createWriteQueue({ userId: uid, deviceId: "dev-b", now, allow: () => true, newId: () => `b-op${++i}` });
}
const drainWith = (q: WriteQueue, server: BudgetFakeServer, onConflict?: (e: OutboxEntry, lost: string[]) => void) =>
  createDrain({ store: q.store, fetchImpl: server.fetch, now, random: () => 0.5, onConflict: onConflict ? (e, lost) => onConflict(e, lost) : undefined })();

describe("budget create", () => {
  it("sent once with Idempotency-Key = opId, one server row, outbox emptied", async () => {
    const q = mkQueue();
    const server = new BudgetFakeServer();
    const e = (await q.enqueueEntityCreate("budget", { ...CAT, amount: 300, currency: "CAD" }, { ...CAT, categoryName: "Food", categoryGroup: "Living" }))!;
    expect(e.entity).toBe("budget");
    expect(e.ref).toEqual({ ...CAT, categoryName: "Food", categoryGroup: "Living" });
    const report = await drainWith(q, server);
    expect(report.sent).toBe(1);
    expect(server.log).toEqual([{ method: "POST", url: "/api/budgets", key: e.opId }]);
    expect([...server.rows.values()].map((r) => [r.categoryId, r.month, r.amount])).toEqual([[1, MONTH, 300]]);
    expect(await q.store.list()).toEqual([]);
  });

  it("lost response: the retry with the same key replays the first response, no second row", async () => {
    const q = mkQueue();
    const server = new BudgetFakeServer();
    const e = (await q.enqueueEntityCreate("budget", { ...CAT, amount: 300, currency: "CAD" }))!;
    server.script = ["lose"]; // applied on the server, response lost
    const first = await drainWith(q, server);
    expect(first.retryLater).toBe(1);
    expect(server.rows.size).toBe(1);
    t += 120_000; // past the backoff
    const second = await drainWith(q, server);
    expect(second.sent).toBe(1);
    expect(server.rows.size).toBe(1);
    expect(server.log.map((l) => [l.method, l.key])).toEqual([["POST", e.opId], ["POST", e.opId]]);
    expect(await q.store.list()).toEqual([]);
  });

  it("a server 404 (category gone) marks the entry failed and keeps it for review", async () => {
    const q = mkQueue();
    const server = new BudgetFakeServer();
    server.categories.delete(1);
    await q.enqueueEntityCreate("budget", { ...CAT, amount: 300, currency: "CAD" });
    const report = await drainWith(q, server);
    expect(report.failed).toBe(1);
    const [kept] = await q.store.list();
    expect(kept.status).toBe("failed");
    expect(kept.failReason).toBe("http 404");
    expect(server.rows.size).toBe(0);
  });

  it("the create's currency is optional: a create without one is sent without it", async () => {
    const q = mkQueue();
    const server = new BudgetFakeServer();
    const seen: unknown[] = [];
    const spy = async (url: string, init?: { body?: string }) => {
      if (init?.body) seen.push(JSON.parse(init.body));
      return server.fetch(url, init as never);
    };
    await q.enqueueEntityCreate("budget", { ...CAT, amount: 50, currency: null });
    await createDrain({ store: q.store, fetchImpl: spy, now, random: () => 0.5 })();
    expect(seen).toEqual([{ categoryId: 1, month: MONTH, amount: 50 }]);
  });
});

describe("budget edit", () => {
  it("sends the identity and the new amount with the server currency kept", async () => {
    const q = mkQueue();
    const server = new BudgetFakeServer();
    const id = server.seed(1, MONTH, 100, "CAD");
    const current = { amount: 100, currency: "CAD" };
    const e = (await q.enqueueEntityEdit("budget", id, { amount: 250 }, current, CAT))!;
    const report = await drainWith(q, server);
    expect(report.sent).toBe(1);
    expect(server.rows.get(id)).toMatchObject({ amount: 250, currency: "CAD" });
    expect(server.rows.size).toBe(1);
    expect(server.log[1]).toEqual({ method: "POST", url: "/api/budgets", key: e.opId });
  });

  it("edits to the same budget coalesce into one entry (per-field newest wins)", async () => {
    const q = mkQueue();
    const id = 7;
    await q.enqueueEntityEdit("budget", id, { amount: 1 }, { amount: 0, currency: "CAD" }, CAT);
    t += 1000;
    await q.enqueueEntityEdit("budget", id, { amount: 2, currency: "USD" }, { amount: 0, currency: "CAD" }, CAT);
    const list = await q.store.list();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ kind: "edit", rowId: "budget:7", entity: "budget", fields: { amount: 2, currency: "USD" } });
  });

  it("per-field LWW: a newer local change beats an older server change; a newer server change wins", async () => {
    // Local write at t=5_000_000. Server changed the amount at 1_000_000 (older): the local value is sent.
    const q = mkQueue();
    const server = new BudgetFakeServer();
    const older = server.seed(1, MONTH, 100, "CAD");
    await q.enqueueEntityEdit("budget", older, { amount: 250 }, { amount: 100, currency: "CAD" }, CAT);
    server.editDirect(older, { amount: 300 }, 1_000_000);
    const a = await drainWith(q, server);
    expect(a.lost).toEqual({});
    expect(server.rows.get(older)?.amount).toBe(250);

    // Server changed the amount at 9_000_000 (newer than the local write): the server value stays, field reported lost.
    const newer = server.seed(2, MONTH, 100, "CAD");
    const e2 = (await q.enqueueEntityEdit("budget", newer, { amount: 250 }, { amount: 100, currency: "CAD" }, { categoryId: 2, month: MONTH }))!;
    server.editDirect(newer, { amount: 300 }, 9_000_000);
    const lostSeen: string[][] = [];
    const b = await drainWith(q, server, (_e, lost) => lostSeen.push(lost));
    expect(b.lost[e2.opId]).toEqual(["amount"]);
    expect(lostSeen).toEqual([["amount"]]);
    expect(server.rows.get(newer)?.amount).toBe(300);
    expect(await q.store.list()).toEqual([]);
  });

  it("a server value already equal to the queued one is a no-op (nothing sent)", async () => {
    const q = mkQueue();
    const server = new BudgetFakeServer();
    const id = server.seed(1, MONTH, 100, "CAD");
    await q.enqueueEntityEdit("budget", id, { amount: 250 }, { amount: 100, currency: "CAD" }, CAT);
    server.editDirect(id, { amount: 250 }, 1_000_000);
    const report = await drainWith(q, server);
    expect(report.sent).toBe(0);
    expect(server.log.filter((l) => l.method === "POST")).toHaveLength(0);
  });
});

describe("budget delete", () => {
  it("DELETE when the row is unchanged since the baseline", async () => {
    const q = mkQueue();
    const server = new BudgetFakeServer();
    const id = server.seed(1, MONTH, 100, "CAD");
    const row = server.rows.get(id)!;
    await q.enqueueEntityDelete("budget", id, { amount: row.amount, currency: row.currency, updatedAt: row.updatedAt }, CAT);
    const report = await drainWith(q, server);
    expect(report.sent).toBe(1);
    expect(server.rows.size).toBe(0);
    expect(server.log.at(-1)).toMatchObject({ method: "DELETE", url: `/api/budgets?id=${id}` });
  });

  it("refused (failed, row kept) when the server row changed since the delete was made", async () => {
    const q = mkQueue();
    const server = new BudgetFakeServer();
    const id = server.seed(1, MONTH, 100, "CAD");
    const row = server.rows.get(id)!;
    await q.enqueueEntityDelete("budget", id, { amount: row.amount, currency: row.currency, updatedAt: row.updatedAt }, CAT);
    server.editDirect(id, { amount: 999 }, 2_000_000);
    const report = await drainWith(q, server);
    expect(report.failed).toBe(1);
    const [kept] = await q.store.list();
    expect(kept).toMatchObject({ status: "failed", failReason: ROW_CHANGED_REASON });
    expect(server.rows.get(id)?.amount).toBe(999);
  });

  it("a row already gone on the server counts as done", async () => {
    const q = mkQueue();
    const server = new BudgetFakeServer();
    const id = server.seed(1, MONTH, 100, "CAD");
    const row = server.rows.get(id)!;
    await q.enqueueEntityDelete("budget", id, { amount: row.amount, currency: row.currency, updatedAt: row.updatedAt }, CAT);
    server.rows.delete(id);
    const report = await drainWith(q, server);
    expect(report.adopted).toBe(1);
    expect(await q.store.list()).toEqual([]);
  });

  it("a delete supersedes a pending edit of the same budget; a second delete is the same entry", async () => {
    const q = mkQueue();
    await q.enqueueEntityEdit("budget", 3, { amount: 5 }, { amount: 1, currency: "CAD" }, CAT);
    const d1 = await q.enqueueEntityDelete("budget", 3, { amount: 1, currency: "CAD", updatedAt: null }, CAT);
    const d2 = await q.enqueueEntityDelete("budget", 3, { amount: 1, currency: "CAD", updatedAt: null }, CAT);
    const list = await q.store.list();
    expect(list.map((e) => e.kind)).toEqual(["delete"]);
    expect(d2?.opId).toBe(d1?.opId);
  });
});

describe("entities do not collide", () => {
  it("a budget and a transaction with the same numeric id keep separate entries", async () => {
    const q = mkQueue();
    await q.enqueueEntityEdit("budget", 4, { amount: 9 }, { amount: 1, currency: "CAD" }, CAT);
    await q.enqueueEdit(4, { note: "x" }, { id: "4", serverId: 4, date: "2026-10-01", accountId: null, categoryId: null, currency: null, amount: 0 });
    const rows = (await q.store.list()).map((e) => [e.entity ?? "transaction", e.rowId]).sort();
    expect(rows).toEqual([["budget", "budget:4"], ["transaction", "4"]]);
  });

  it("an entry whose entity has no adapter is failed without any request", async () => {
    const q = mkQueue();
    const server = new BudgetFakeServer();
    await q.store.put({
      opId: "widget-op", entity: "widget", kind: "create", rowId: "local-widget-op", serverId: null, fields: { name: "x" }, fieldHlc: {}, base: {},
      createdAt: 1, attempts: 0, nextAttemptAt: 0, firstSendAt: null, status: "pending", failReason: null,
    } as unknown as OutboxEntry);
    const report = await drainWith(q, server);
    expect(report.failed).toBe(1);
    expect(server.log).toEqual([]);
    expect((await q.store.list())[0]).toMatchObject({ status: "failed", failReason: "unknown entity" });
  });

  it("backoff is unchanged by the generalisation", () => {
    expect(backoffMs(1, 0.5)).toBe(1500);
  });
});
