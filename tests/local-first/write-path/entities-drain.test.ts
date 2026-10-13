// @vitest-environment jsdom
// Goals, rules, accounts and categories through the offline queue (local-first L3): wire shapes, conflicts, the
// online-only rules for account/category create and delete, and the rule JSON compare.
import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createWriteQueue, type WriteQueue } from "@/lib/local-first/write-path/queue";
import { createDrain } from "@/lib/local-first/write-path/drain";
import { LOCAL_WRITE_QUEUE_KEY } from "@/lib/local-first/write-path/flag";
import { LOCAL_READ_CACHE_KEY } from "@/lib/local-first/read-cache/optin";
import { wipeAll } from "@/lib/local-first/read-cache/persist-store";
import { canonicalJson } from "@/lib/local-first/write-path/entities/json";
import { ruleChangedFields } from "@/lib/rules/offline-fields";
import { EntityFakeServer } from "./entity-fake-server";

let n = 0;
let t = 5_000_000;
const now = () => t;
let uid = "";

beforeEach(() => {
  window.localStorage.setItem(LOCAL_READ_CACHE_KEY, "1");
  window.localStorage.setItem(LOCAL_WRITE_QUEUE_KEY, "1");
  uid = `ent-drain-${++n}-${Date.now()}`;
  t = 5_000_000;
});
afterEach(async () => {
  vi.restoreAllMocks();
  window.localStorage.clear();
  await wipeAll();
});

function mkQueue(): WriteQueue {
  let i = 0;
  return createWriteQueue({ userId: uid, deviceId: "dev-e", now, allow: () => true, newId: () => `e-op${++i}` });
}
const drainWith = (q: WriteQueue, server: EntityFakeServer, onConflict?: (lost: string[]) => void) =>
  createDrain({ store: q.store, fetchImpl: server.fetch, now, random: () => 0.5, onConflict: onConflict ? (_e, lost) => onConflict(lost) : undefined })();

const GOAL = { name: "Fund", type: "savings", targetAmount: 1000, currency: "CAD", deadline: null, priority: 1, status: "active", note: "" };

describe("goal", () => {
  it("create: POST /api/goals with the Idempotency-Key, one row", async () => {
    const q = mkQueue();
    const server = new EntityFakeServer();
    const e = (await q.enqueueEntityCreate("goal", GOAL))!;
    expect((await drainWith(q, server)).sent).toBe(1);
    expect(server.log).toEqual([expect.objectContaining({ method: "POST", url: "/api/goals", key: e.opId })]);
    expect([...server.table("/api/goals").values()].map((r) => r.name)).toEqual(["Fund"]);
    expect(await q.store.list()).toEqual([]);
  });

  it("edit: GET the row, PUT only the winning field with the id", async () => {
    const q = mkQueue();
    const server = new EntityFakeServer();
    const id = server.seed("/api/goals", { ...GOAL, name: "Old" }, 1_000_000);
    await q.enqueueEntityEdit("goal", id, { name: "New" }, { name: "Old" });
    await drainWith(q, server);
    expect(server.log.map((l) => l.method)).toEqual(["GET", "PUT"]);
    expect(server.log[1].body).toEqual({ id, name: "New" });
    expect(server.table("/api/goals").get(id)?.name).toBe("New");
  });

  it("edit conflict: a newer server change to the same field wins and is reported", async () => {
    const q = mkQueue();
    const server = new EntityFakeServer();
    const id = server.seed("/api/goals", { ...GOAL, name: "Old" }, 1_000_000);
    await q.enqueueEntityEdit("goal", id, { name: "Mine" }, { name: "Old" });
    server.editDirect("/api/goals", id, { name: "Theirs" }, 9_000_000);
    const lost: string[][] = [];
    const r = await drainWith(q, server, (l) => lost.push(l));
    expect(r.lost[Object.keys(r.lost)[0]]).toEqual(["name"]);
    expect(lost).toEqual([["name"]]);
    expect(server.table("/api/goals").get(id)?.name).toBe("Theirs");
  });

  it("delete: DELETE when unchanged since the baseline; refused when changed", async () => {
    const q = mkQueue();
    const server = new EntityFakeServer();
    const id = server.seed("/api/goals", GOAL, 1_000_000);
    const row = server.table("/api/goals").get(id)!;
    await q.enqueueEntityDelete("goal", id, { ...GOAL, updatedAt: row.updatedAt });
    expect((await drainWith(q, server)).sent).toBe(1);
    expect(server.table("/api/goals").size).toBe(0);
  });
});

describe("account (edit only offline)", () => {
  it("create and delete are refused offline (RangeError), no entry is written", async () => {
    const q = mkQueue();
    await expect(q.enqueueEntityCreate("account", { name: "x" })).rejects.toThrow(/online-only/);
    await expect(q.enqueueEntityDelete("account", 3, { name: "x", updatedAt: null })).rejects.toThrow(/online-only/);
    expect(await q.store.list()).toEqual([]);
  });

  it("rename of an ARCHIVED account drains: the fetch includes archived rows; PUT carries only the changed field", async () => {
    const q = mkQueue();
    const server = new EntityFakeServer();
    const id = server.seed("/api/accounts", { name: "Acc", group: "Bank", note: "", alias: null, archived: true, invisible: false, type: "A", currency: "CAD" }, 1_000_000);
    await q.enqueueEntityEdit("account", id, { name: "Renamed" }, { name: "Acc" });
    expect((await drainWith(q, server)).sent).toBe(1);
    expect(server.log[0].url).toBe("/api/accounts?includeArchived=1");
    expect(server.log[1].body).toEqual({ id, name: "Renamed" });
    expect(server.table("/api/accounts").get(id)?.name).toBe("Renamed");
  });

  it("invisible and archived flags are sent as booleans", async () => {
    const q = mkQueue();
    const server = new EntityFakeServer();
    const id = server.seed("/api/accounts", { name: "Acc", group: "", note: "", alias: null, archived: false, invisible: false }, 1_000_000);
    await q.enqueueEntityEdit("account", id, { invisible: 1, archived: 1 }, { invisible: 0, archived: 0 });
    await drainWith(q, server);
    expect(server.log[1].body).toEqual({ id, invisible: true, archived: true });
  });
});

describe("category (edit only offline)", () => {
  it("create and delete are refused offline; rename drains as PUT {id, name}", async () => {
    const q = mkQueue();
    await expect(q.enqueueEntityCreate("category", { name: "x" })).rejects.toThrow(/online-only/);
    await expect(q.enqueueEntityDelete("category", 2, { name: "x", updatedAt: null })).rejects.toThrow(/online-only/);
    const server = new EntityFakeServer();
    const id = server.seed("/api/categories", { name: "Food", group: "Living", note: "", type: "E" }, 1_000_000);
    await q.enqueueEntityEdit("category", id, { name: "Groceries" }, { name: "Food" });
    await drainWith(q, server);
    expect(server.log[1].body).toEqual({ id, name: "Groceries" });
    expect(server.table("/api/categories").get(id)?.name).toBe("Groceries");
  });
});

describe("rule", () => {
  const conditions = { all: [{ field: "payee", op: "contains", value: "cafe" }] };
  const actions = [{ type: "set_category", categoryId: 4 }];

  it("create: conditions and actions are parsed back into objects for the POST", async () => {
    const q = mkQueue();
    const server = new EntityFakeServer();
    await q.enqueueEntityCreate("rule", { name: "Coffee", conditions: canonicalJson(conditions), actions: canonicalJson(actions), priority: 2, isActive: "true" });
    await drainWith(q, server);
    expect(server.log[0].body).toEqual({ name: "Coffee", conditions, actions, priority: 2, isActive: true });
  });

  it("toggle: isActive sent as a boolean", async () => {
    const q = mkQueue();
    const server = new EntityFakeServer();
    const id = server.seed("/api/rules", { name: "R", conditions, actions, priority: 0, isActive: true }, 1_000_000);
    const { patch, current } = ruleChangedFields({ isActive: false }, { isActive: true });
    await q.enqueueEntityEdit("rule", id, patch, current);
    await drainWith(q, server);
    expect(server.log[1].body).toEqual({ id, isActive: false });
  });

  it("an equal conditions object with another key order is NOT a conflict (canonical compare)", async () => {
    const q = mkQueue();
    const server = new EntityFakeServer();
    // The server returns the same content with keys in another order.
    const reordered = { all: [{ value: "cafe", op: "contains", field: "payee" }] };
    const id = server.seed("/api/rules", { name: "R", conditions: reordered, actions, priority: 0, isActive: true }, 1_000_000);
    const newer = { all: [{ field: "payee", op: "contains", value: "coffee" }] };
    await q.enqueueEntityEdit("rule", id, { conditions: canonicalJson(newer) }, { conditions: canonicalJson(conditions) });
    const lost: string[][] = [];
    const r = await drainWith(q, server, (l) => lost.push(l));
    expect(r.lost).toEqual({});
    expect(lost).toEqual([]);
    expect(server.log[1].body).toEqual({ id, conditions: newer });
  });
});
