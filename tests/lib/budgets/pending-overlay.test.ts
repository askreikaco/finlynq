// Budgets list overlay for the offline queue (local-first L3). Pure: no IndexedDB, no flag.
import { describe, it, expect } from "vitest";
import { applyPendingBudgets, toPendingBudgetView, EMPTY_PENDING_BUDGETS } from "@/lib/budgets/pending-overlay";
import type { Budget } from "@/app/(app)/budgets/_components/budget-types";
import type { OutboxEntry } from "@/lib/local-first/write-path/types";

const MONTH = "2026-10";
const server: Budget[] = [
  { id: 1, categoryId: 10, categoryName: "Food", categoryGroup: "Living", month: MONTH, amount: 300, currency: "CAD", rolloverAmount: 0, updatedAt: "2026-10-01T00:00:00.000Z" },
  { id: 2, categoryId: 11, categoryName: "Fun", categoryGroup: "Living", month: MONTH, amount: 80, currency: "CAD", rolloverAmount: 0, updatedAt: "2026-10-01T00:00:00.000Z" },
];

const entry = (over: Partial<OutboxEntry>): OutboxEntry => ({
  opId: "op", entity: "budget", kind: "create", rowId: "local-op", serverId: null, fields: {}, fieldHlc: {}, base: {},
  createdAt: 1, attempts: 0, nextAttemptAt: 0, firstSendAt: null, status: "pending", failReason: null, ...over,
} as OutboxEntry);

describe("applyPendingBudgets", () => {
  it("empty snapshot: the same array reference (flag off = zero change)", () => {
    expect(applyPendingBudgets(server, EMPTY_PENDING_BUDGETS, MONTH)).toBe(server);
    expect(applyPendingBudgets(server, toPendingBudgetView([]), MONTH)).toBe(server);
  });

  it("a queued create for a new category adds a row with a negative id and a 'create' mark", () => {
    const view = toPendingBudgetView([
      entry({ opId: "c1", ref: { categoryId: 12, month: MONTH, categoryName: "Travel", categoryGroup: "Life" }, fields: { categoryId: 12, month: MONTH, amount: 500, currency: "CAD" } }),
    ]);
    const out = applyPendingBudgets(server, view, MONTH);
    expect(out).toHaveLength(3);
    const added = out[2];
    expect(added).toMatchObject({ categoryId: 12, categoryName: "Travel", categoryGroup: "Life", amount: 500, currency: "CAD", pendingSync: { kind: "create", status: "pending", opId: "c1" } });
    expect(added.id).toBeLessThan(0);
  });

  it("a queued create for a category that already has a server row shows over it (upsert)", () => {
    const view = toPendingBudgetView([entry({ opId: "c2", ref: { categoryId: 10, month: MONTH }, fields: { categoryId: 10, month: MONTH, amount: 420 } })]);
    const out = applyPendingBudgets(server, view, MONTH);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ id: 1, amount: 420, pendingSync: { kind: "create", opId: "c2" } });
  });

  it("a queued edit overlays amount and currency with an 'edit' mark", () => {
    const view = toPendingBudgetView([entry({ opId: "e1", kind: "edit", rowId: "budget:2", serverId: 2, ref: { categoryId: 11, month: MONTH }, fields: { amount: 120 }, base: { amount: 80 } })]);
    const out = applyPendingBudgets(server, view, MONTH);
    expect(out[1]).toMatchObject({ id: 2, amount: 120, currency: "CAD", pendingSync: { kind: "edit", status: "pending", opId: "e1" } });
    expect(server[1].amount).toBe(80); // input untouched
  });

  it("a pending delete hides the row; a failed delete keeps it, marked", () => {
    const pending = toPendingBudgetView([entry({ opId: "d1", kind: "delete", rowId: "budget:2", serverId: 2, base: { amount: 80 } })]);
    expect(applyPendingBudgets(server, pending, MONTH).map((b) => b.id)).toEqual([1]);
    const failed = toPendingBudgetView([entry({ opId: "d2", kind: "delete", rowId: "budget:2", serverId: 2, status: "failed", failReason: "Row changed on the server", base: {} })]);
    const out = applyPendingBudgets(server, failed, MONTH);
    expect(out.map((b) => b.id)).toEqual([1, 2]);
    expect(out[1].pendingSync).toEqual({ kind: "delete", status: "failed", opId: "d2", failReason: "Row changed on the server" });
  });

  it("creates for another month are not shown on this month", () => {
    const view = toPendingBudgetView([entry({ opId: "c3", ref: { categoryId: 12, month: "2026-11" }, fields: { categoryId: 12, month: "2026-11", amount: 1 } })]);
    expect(applyPendingBudgets(server, view, MONTH)).toHaveLength(2);
  });

  it("toPendingBudgetView ignores transactions", () => {
    const view = toPendingBudgetView([entry({ opId: "t1", entity: undefined, fields: { amount: 5 } })]);
    expect(view.creates).toEqual([]);
  });
});
