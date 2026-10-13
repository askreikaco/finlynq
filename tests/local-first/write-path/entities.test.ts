// @vitest-environment jsdom
// Entity adapter registry and back-compat (local-first L3): an outbox entry with no `entity` is a transaction.
import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createWriteQueue } from "@/lib/local-first/write-path/queue";
import { createDrain } from "@/lib/local-first/write-path/drain";
import { entityOf, adapterFor, rowIdFor, registeredKinds, budgetAdapter, transactionAdapter, goalAdapter, ruleAdapter, accountAdapter, categoryAdapter } from "@/lib/local-first/write-path/entities";
import { LOCAL_WRITE_QUEUE_KEY } from "@/lib/local-first/write-path/flag";
import { LOCAL_READ_CACHE_KEY } from "@/lib/local-first/read-cache/optin";
import { wipeAll } from "@/lib/local-first/read-cache/persist-store";
import type { OutboxEntry } from "@/lib/local-first/write-path/types";
import { FakeServer } from "./fake-server";

let n = 0;
beforeEach(() => {
  window.localStorage.setItem(LOCAL_READ_CACHE_KEY, "1");
  window.localStorage.setItem(LOCAL_WRITE_QUEUE_KEY, "1");
});
afterEach(async () => {
  vi.restoreAllMocks();
  window.localStorage.clear();
  await wipeAll();
});

const FIELDS = { date: "2026-10-01", accountId: 1, categoryId: 2, enteredCurrency: "CAD", enteredAmount: -12.5, payee: "Cafe" };

describe("registry", () => {
  it("entityOf: a missing entity is a transaction; a set one is itself", () => {
    expect(entityOf({})).toBe("transaction");
    expect(entityOf({ entity: undefined })).toBe("transaction");
    expect(entityOf({ entity: "budget" })).toBe("budget");
  });

  it("adapterFor: every entity kind is registered (create offline: transaction, budget, goal, rule; edit only: account, category)", () => {
    expect(adapterFor("transaction")).toBe(transactionAdapter);
    expect(adapterFor("budget")).toBe(budgetAdapter);
    expect(adapterFor("goal")).toBe(goalAdapter);
    expect(adapterFor("rule")).toBe(ruleAdapter);
    expect(adapterFor("account")).toBe(accountAdapter);
    expect(adapterFor("category")).toBe(categoryAdapter);
    expect(registeredKinds().sort()).toEqual(["account", "budget", "category", "goal", "rule", "transaction"]);
  });

  it("operation matrix: account and category are edit-only offline; goal, rule, budget, transaction also create and delete", () => {
    const m = (k: "transaction" | "budget" | "goal" | "rule" | "account" | "category") => {
      const a = adapterFor(k)!;
      return [a.canCreateOffline, a.canEditOffline, a.canDeleteOffline];
    };
    expect(m("transaction")).toEqual([true, true, true]);
    expect(m("budget")).toEqual([true, true, true]);
    expect(m("goal")).toEqual([true, true, true]);
    expect(m("rule")).toEqual([true, true, true]);
    expect(m("account")).toEqual([false, true, false]);
    expect(m("category")).toEqual([false, true, false]);
  });

  it("rowIdFor: transactions keep the bare server id (existing cache rows); other entities are prefixed", () => {
    expect(rowIdFor("transaction", 5)).toBe("5");
    expect(rowIdFor("budget", 5)).toBe("budget:5");
  });

  it("transaction adapter keeps the original wire shapes", () => {
    expect(transactionAdapter.basePath).toBe("/api/transactions");
    expect(transactionAdapter.editRequest(7, {} as OutboxEntry, { note: "n" }, {})).toEqual({ method: "PUT", url: "/api/transactions", body: { id: 7, note: "n" } });
    expect(transactionAdapter.fetchRequest(7, {} as OutboxEntry).url).toBe("/api/transactions?id=7&scope=all");
    expect(transactionAdapter.serialize(FIELDS)).toBe(FIELDS);
  });

  it("budget adapter: serialize drops an empty currency; edit POST uses the server amount when the edit does not change it", () => {
    expect(budgetAdapter.serialize({ categoryId: 1, month: "2026-10", amount: 5, currency: null })).toEqual({ categoryId: 1, month: "2026-10", amount: 5 });
    const e = { ref: { categoryId: 1, month: "2026-10" } } as unknown as OutboxEntry;
    expect(budgetAdapter.editRequest(9, e, { currency: "USD" }, { amount: 40, currency: "CAD" })).toEqual({
      method: "POST",
      url: "/api/budgets",
      body: { categoryId: 1, month: "2026-10", amount: 40, currency: "USD" },
    });
  });
});

describe("back-compat: an entry sealed before the generalisation (no `entity`) drains as a transaction", () => {
  it("create without entity: POST /api/transactions with its Idempotency-Key, outbox emptied", async () => {
    const uid = `ent-legacy-${++n}-${Date.now()}`;
    let i = 0;
    const q = createWriteQueue({ userId: uid, deviceId: "dev", now: () => 5_000_000, allow: () => true, newId: () => `legacy-op${++i}` });
    const e = (await q.enqueueCreate(FIELDS))!;
    // Simulate the record as it is on a device today: the field is absent.
    const legacy = { ...e } as Partial<OutboxEntry>;
    delete legacy.entity;
    await q.store.remove(e.opId);
    await q.store.put(legacy as OutboxEntry);

    const server = new FakeServer();
    const drain = createDrain({ store: q.store, fetchImpl: server.fetch, now: () => 5_000_000, random: () => 0.5 });
    const report = await drain();
    expect(report.sent).toBe(1);
    expect(server.log.map((l) => [l.method, l.url, l.key])).toEqual([["POST", "/api/transactions", e.opId]]);
    expect(await q.store.list()).toEqual([]);
  });

  it("edit without entity: GET then PUT /api/transactions, the winning field is written", async () => {
    const uid = `ent-legacy-${++n}-${Date.now()}`;
    let i = 0;
    const q = createWriteQueue({ userId: uid, deviceId: "dev", now: () => 5_000_000, allow: () => true, newId: () => `legacy-edit${++i}` });
    const server = new FakeServer();
    const id = server.seed({ date: "2026-10-01", note: "old" });
    const base = { id: String(id), serverId: id, date: "2026-10-01", accountId: null, categoryId: null, currency: "CAD", amount: -1, note: "old" };
    const e = (await q.enqueueEdit(id, { note: "new" }, base))!;
    const legacy = { ...e } as Partial<OutboxEntry>;
    delete legacy.entity;
    await q.store.remove(e.opId);
    await q.store.put(legacy as OutboxEntry);

    const report = await createDrain({ store: q.store, fetchImpl: server.fetch, now: () => 5_000_000, random: () => 0.5 })();
    expect(report.sent).toBe(1);
    expect(server.rows.get(id)?.note).toBe("new");
    expect(server.log.map((l) => l.method)).toEqual(["GET", "PUT"]);
  });
});
