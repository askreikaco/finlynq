import { describe, it, expect } from "vitest";
import { canQueueOfflineDelete, isOfflineDeleteEligible } from "@/lib/transactions/entry-mode";
import {
  applyPendingToTransactions, countPendingDeletes, EMPTY_PENDING, localRowId, type OverlayContext, type PendingTxView,
} from "@/lib/transactions/pending-overlay";
import { toPendingTxView } from "@/lib/data/local-write-queue";
import type { Transaction } from "@/app/(app)/transactions/_types";
import type { OutboxEntry } from "@/lib/local-first/write-path/types";

const row = (o: Partial<Transaction> = {}): Transaction => ({
  id: 1, date: "2026-10-01", accountId: 1, accountName: "Chequing", categoryId: 4, categoryName: "Food", categoryType: "E", currency: "CAD",
  amount: -10, enteredAmount: -10, enteredCurrency: "CAD", quantity: null, portfolioHolding: null, note: "", payee: "Cafe", tags: "",
  isBusiness: 0, linkId: null, installmentGroupId: null, subscriptionId: null, ...o,
});
const ctx = (o: Partial<OverlayContext> = {}): OverlayContext => ({
  accounts: [{ id: 1, name: "Chequing", currency: "CAD" }, { id: 2, name: "Visa", currency: "USD", alias: "V" }],
  categories: [{ id: 4, name: "Food", type: "E", group: "g" }, { id: 5, name: "Fun", type: "E", group: "g" }],
  filters: {}, hasColFilters: false, ...o,
});
const view = (o: Partial<PendingTxView> = {}): PendingTxView => ({ creates: [], edits: {}, deletes: {}, ...o });
const entry = { status: "pending" as const, failReason: null };

describe("isOfflineDeleteEligible", () => {
  it("a plain row qualifies", () => expect(isOfflineDeleteEligible(row())).toBe(true));
  it.each([
    ["transfer-linked", { linkId: "L" }], ["installment", { installmentGroupId: "g" }], ["repeat", { subscriptionId: 3 }],
    ["portfolio holding", { portfolioHolding: "AAPL" }], ["quantity", { quantity: 2 }], ["business", { isBusiness: 1 }],
    ["portfolio kind", { kind: "buy" }], ["trade pair", { tradeLinkId: "T" }],
    ["unknown series membership", { installmentGroupId: undefined }], ["unknown repeat membership", { subscriptionId: undefined }],
  ])("%s row stays online-only", (_n, over) => expect(isOfflineDeleteEligible(row(over as Partial<Transaction>))).toBe(false));
});

describe("canQueueOfflineDelete", () => {
  const base = { queueActive: true, error: new TypeError("Failed to fetch"), row: row(), hasSplits: false as boolean | null };
  it("queues: flag on, network error, plain row, no splits", () => expect(canQueueOfflineDelete(base)).toBe(true));
  it("not when the queue is off", () => expect(canQueueOfflineDelete({ ...base, queueActive: false })).toBe(false));
  it("not for a non-network error", () => expect(canQueueOfflineDelete({ ...base, error: new Error("boom") })).toBe(false));
  it("not when the row has splits, or splits are unknown", () => {
    expect(canQueueOfflineDelete({ ...base, hasSplits: true })).toBe(false);
    expect(canQueueOfflineDelete({ ...base, hasSplits: null })).toBe(false);
  });
  it("not for a transfer-linked row", () => expect(canQueueOfflineDelete({ ...base, row: row({ linkId: "L" }) })).toBe(false));
});

describe("applyPendingToTransactions", () => {
  it("empty snapshot returns the same array (flag off = no change)", () => {
    const list = [row()];
    expect(applyPendingToTransactions(list, EMPTY_PENDING, ctx())).toBe(list);
  });

  it("queued creates go on top, newest first, with a negative local id and the mark", () => {
    const p = view({ creates: [
      { opId: "a", ...entry, createdAt: 1, fields: { date: "2026-10-02", accountId: 2, categoryId: 5, enteredCurrency: "USD", enteredAmount: -7, payee: "Old" } },
      { opId: "b", ...entry, createdAt: 2, fields: { date: "2026-10-03", accountId: 1, categoryId: 4, enteredCurrency: "CAD", enteredAmount: 12.5, payee: "New" } },
    ] });
    const out = applyPendingToTransactions([row({ id: 9 })], p, ctx());
    expect(out.map((t) => t.payee)).toEqual(["New", "Old", "Cafe"]);
    expect(out[0]).toMatchObject({ id: localRowId("b"), accountName: "Chequing", categoryName: "Food", amount: 12.5, currency: "CAD", pendingSync: { kind: "create", opId: "b", status: "pending" } });
    expect(out[0].id).toBeLessThan(0);
    expect(out[1]).toMatchObject({ accountName: "Visa", accountAlias: "V", currency: "USD", amount: -7 });
    expect(out[2].pendingSync).toBeUndefined();
  });

  it("queued edit overlays fields on the server row with the mark; other rows untouched", () => {
    const list = [row({ id: 1 }), row({ id: 2, payee: "Other" })];
    const out = applyPendingToTransactions(list, view({ edits: { 1: { opId: "e", ...entry, fields: { payee: "Edited", enteredAmount: -20, categoryId: 5, note: null } } } }), ctx());
    expect(out[0]).toMatchObject({ payee: "Edited", enteredAmount: -20, amount: -20, categoryName: "Fun", note: "", pendingSync: { kind: "edit", opId: "e" } });
    expect(out[1]).toBe(list[1]);
  });

  it("a pending delete hides the row (and is counted); a failed delete keeps it marked", () => {
    const list = [row({ id: 1 }), row({ id: 2 })];
    const p = view({ deletes: { 1: { opId: "d1", ...entry }, 2: { opId: "d2", status: "failed", failReason: "Row changed on the server" } } });
    const out = applyPendingToTransactions(list, p, ctx());
    expect(out.map((t) => t.id)).toEqual([2]);
    expect(out[0].pendingSync).toMatchObject({ kind: "delete", status: "failed", failReason: "Row changed on the server" });
    expect(countPendingDeletes(p)).toBe(1);
  });

  it("a failed edit keeps the server values, marked failed", () => {
    const out = applyPendingToTransactions([row()], view({ edits: { 1: { opId: "e", status: "failed", failReason: "x", fields: { payee: "Nope" } } } }), ctx());
    expect(out[0]).toMatchObject({ payee: "Cafe", pendingSync: { kind: "edit", status: "failed" } });
  });

  it("filters: queued creates honour account / search, and hide under a column filter", () => {
    const c = { opId: "a", ...entry, createdAt: 1, fields: { date: "2026-10-02", accountId: 2, categoryId: 5, enteredCurrency: "USD", enteredAmount: -7, payee: "Taxi" } };
    const p = view({ creates: [c] });
    expect(applyPendingToTransactions([], p, ctx({ filters: { accountId: "1" } }))).toHaveLength(0);
    expect(applyPendingToTransactions([], p, ctx({ filters: { accountId: "2", search: "tax" } }))).toHaveLength(1);
    expect(applyPendingToTransactions([], p, ctx({ filters: { search: "nope" } }))).toHaveLength(0);
    expect(applyPendingToTransactions([], p, ctx({ hasColFilters: true }))).toHaveLength(0);
  });
});

describe("toPendingTxView", () => {
  const e = (o: Partial<OutboxEntry>): OutboxEntry => ({
    opId: "x", kind: "create", rowId: "local-x", serverId: null, fields: {}, fieldHlc: {}, base: {}, createdAt: 1, attempts: 0, nextAttemptAt: 0,
    firstSendAt: null, status: "pending", failReason: null, ...o,
  });
  it("splits entries by kind and keys edits and deletes by server id", () => {
    const v = toPendingTxView([
      e({ opId: "c", fields: { payee: "P" } }),
      e({ opId: "e", kind: "edit", rowId: "5", serverId: 5, fields: { note: "n" } }),
      e({ opId: "d", kind: "delete", rowId: "6", serverId: 6, status: "failed", failReason: "Row changed on the server" }),
    ]);
    expect(v.creates).toHaveLength(1);
    expect(v.edits[5]).toMatchObject({ opId: "e", fields: { note: "n" } });
    expect(v.deletes[6]).toMatchObject({ opId: "d", status: "failed" });
  });
});
