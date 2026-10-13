// @vitest-environment jsdom
// Budgets through the offline facade (local-first L3): flag ON starts the queue; a queued set/delete is listed in the
// Pending sync list and shows on the budgets list overlay; flag OFF queues nothing.
import "fake-indexeddb/auto";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { LOCAL_WRITE_QUEUE_KEY } from "@/lib/local-first/write-path/flag";
import { LOCAL_READ_CACHE_KEY } from "@/lib/local-first/read-cache/optin";
import { wipeAll } from "@/lib/local-first/read-cache/persist-store";
import {
  startLocalWriteQueue, stopLocalWriteQueue, queueOfflineBudgetSet, queueOfflineBudgetDelete, listPendingSync,
  usePendingBudgets, discardPendingSync,
} from "@/lib/data/local-write-queue";
import { applyPendingBudgets } from "@/lib/budgets/pending-overlay";
import type { Budget } from "@/app/(app)/budgets/_components/budget-types";

const MONTH = "2026-10";
let n = 0;

beforeEach(() => {
  window.localStorage.clear();
});
afterEach(async () => {
  stopLocalWriteQueue();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.localStorage.clear();
  await wipeAll();
});

describe("flag off", () => {
  it("budget set/delete queue nothing, usePendingBudgets stays on the empty view, no IndexedDB", async () => {
    const open = vi.spyOn(indexedDB, "open");
    expect(await queueOfflineBudgetSet({ categoryId: 1, month: MONTH, amount: 5, currency: "CAD" }, undefined)).toBe(false);
    expect(await queueOfflineBudgetDelete({ id: 3, categoryId: 1, month: MONTH, amount: 5, currency: "CAD" })).toBe(false);
    expect(await listPendingSync()).toEqual([]);
    const { result } = renderHook(() => usePendingBudgets());
    expect(result.current.creates).toEqual([]);
    expect(open).not.toHaveBeenCalled();
  });
});

describe("flag on", () => {
  beforeEach(() => {
    window.localStorage.setItem(LOCAL_READ_CACHE_KEY, "1");
    window.localStorage.setItem(LOCAL_WRITE_QUEUE_KEY, "1");
  });

  it("a set with no server row is queued as a create; it shows in the pending list and on the overlay", async () => {
    const uid = `bud-facade-${++n}-${Date.now()}`;
    Object.defineProperty(window.navigator, "onLine", { configurable: true, value: false });
    expect(startLocalWriteQueue(uid, "dev-f")).toBe(true);
    expect(await queueOfflineBudgetSet({ categoryId: 4, month: MONTH, amount: 150, currency: "CAD", categoryName: "Fun", categoryGroup: "Living" }, undefined)).toBe(true);

    const items = await listPendingSync();
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ entity: "budget", kind: "create", status: "pending" });
    expect(items[0].summary).toBe(`Fun · ${MONTH} · 150`);

    const { result } = renderHook(() => usePendingBudgets());
    await act(async () => {
      await new Promise((r) => setTimeout(r, 30));
    });
    expect(result.current.creates).toHaveLength(1);
    const rows: Budget[] = applyPendingBudgets([], result.current, MONTH);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ categoryName: "Fun", amount: 150, pendingSync: { kind: "create", status: "pending" } });
  });

  it("a second set for the same category and month merges into the queued create (no second entry)", async () => {
    const uid = `bud-facade-${++n}-${Date.now()}`;
    Object.defineProperty(window.navigator, "onLine", { configurable: true, value: false });
    startLocalWriteQueue(uid, "dev-f");
    await queueOfflineBudgetSet({ categoryId: 5, month: MONTH, amount: 100, currency: "CAD" }, undefined);
    await queueOfflineBudgetSet({ categoryId: 5, month: MONTH, amount: 175, currency: "CAD" }, undefined);
    const items = await listPendingSync();
    expect(items).toHaveLength(1);
    expect(items[0].summary).toContain("175");
  });

  it("a set with a known server row is queued as an edit of that row; a delete of it is queued as a delete", async () => {
    const uid = `bud-facade-${++n}-${Date.now()}`;
    Object.defineProperty(window.navigator, "onLine", { configurable: true, value: false });
    startLocalWriteQueue(uid, "dev-f");
    const row = { id: 42, categoryId: 6, month: MONTH, amount: 90, currency: "CAD", updatedAt: "2026-10-01T00:00:00.000Z" };
    expect(await queueOfflineBudgetSet({ categoryId: 6, month: MONTH, amount: 120, currency: "CAD" }, row)).toBe(true);
    let items = await listPendingSync();
    expect(items.map((i) => [i.kind, i.entity])).toEqual([["edit", "budget"]]);
    expect(await queueOfflineBudgetDelete(row)).toBe(true);
    items = await listPendingSync();
    expect(items.map((i) => [i.kind, i.entity])).toEqual([["delete", "budget"]]);
  });

  it("a failed budget entry is listed for Retry/Discard like a transaction (discard removes it)", async () => {
    const uid = `bud-facade-${++n}-${Date.now()}`;
    Object.defineProperty(window.navigator, "onLine", { configurable: true, value: false });
    startLocalWriteQueue(uid, "dev-f");
    await queueOfflineBudgetSet({ categoryId: 7, month: MONTH, amount: 10, currency: "CAD" }, undefined);
    const [item] = await listPendingSync();
    await discardPendingSync(item.opId);
    expect(await listPendingSync()).toEqual([]);
  });
});
