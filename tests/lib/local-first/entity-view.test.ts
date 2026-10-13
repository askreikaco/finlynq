// Generic outbox overlay for entity lists (local-first L3). Pure.
import { describe, it, expect } from "vitest";
import { toEntityPendingView, overlayRows, EMPTY_ENTITY_VIEW } from "@/lib/local-first/write-path/entity-view";
import type { OutboxEntry } from "@/lib/local-first/write-path/types";

type Row = { id: number; name: string; amount: number };
const rows: Row[] = [{ id: 1, name: "A", amount: 1 }, { id: 2, name: "B", amount: 2 }];
const e = (o: Partial<OutboxEntry>): OutboxEntry =>
  ({ opId: "op", entity: "goal", kind: "edit", rowId: "goal:1", serverId: 1, fields: {}, fieldHlc: {}, base: {}, createdAt: 1, attempts: 0, nextAttemptAt: 0, firstSendAt: null, status: "pending", failReason: null, ...o }) as OutboxEntry;

describe("overlayRows", () => {
  it("empty view: the same array reference", () => {
    expect(overlayRows(rows, EMPTY_ENTITY_VIEW, { patchOf: () => ({}) })).toBe(rows);
  });

  it("only entries of the given kind count", () => {
    const v = toEntityPendingView([e({ entity: "budget", serverId: 1 }), e({ entity: undefined, serverId: 2 })], "goal");
    expect(v.edits).toEqual({});
  });

  it("a queued edit applies its fields and carries a pending mark; a missing entity counts as transaction", () => {
    const v = toEntityPendingView([e({ fields: { name: "Z" } })], "goal");
    const out = overlayRows(rows, v, { patchOf: (f) => ({ name: String(f.name) }) });
    expect(out[0]).toMatchObject({ id: 1, name: "Z", amount: 1, pendingSync: { kind: "edit", status: "pending", opId: "op" } });
    expect(out[1]).toBe(rows[1]);
    expect(toEntityPendingView([e({ entity: undefined })], "transaction").edits[1]).toBeDefined();
  });

  it("a pending delete hides the row; a failed delete keeps it marked", () => {
    const pending = toEntityPendingView([e({ kind: "delete", fields: {} })], "goal");
    expect(overlayRows(rows, pending, { patchOf: () => ({}) }).map((r) => r.id)).toEqual([2]);
    const failed = toEntityPendingView([e({ kind: "delete", status: "failed", failReason: "Row changed on the server" })], "goal");
    const out = overlayRows(rows, failed, { patchOf: () => ({}) });
    expect(out.map((r) => r.id)).toEqual([1, 2]);
    expect(out[0].pendingSync).toMatchObject({ kind: "delete", status: "failed", failReason: "Row changed on the server" });
  });

  it("a queued create adds a row with a negative id when rowOfCreate is given", () => {
    const v = toEntityPendingView([e({ kind: "create", serverId: null, rowId: "local-op9", opId: "op9", fields: { name: "New", amount: 5 } })], "goal");
    expect(overlayRows(rows, v, { patchOf: () => ({}) })).toHaveLength(2);
    const out = overlayRows(rows, v, { patchOf: () => ({}), rowOfCreate: (c) => ({ id: 0, name: String(c.fields.name), amount: Number(c.fields.amount) }) });
    expect(out).toHaveLength(3);
    expect(out[2]).toMatchObject({ name: "New", amount: 5, pendingSync: { kind: "create", opId: "op9" } });
    expect(out[2].id).toBeLessThan(0);
  });
});
