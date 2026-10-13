/**
 * Generic outbox view for entity lists (local-first L3). Pure. Used by goals, rules, accounts, categories.
 * Budgets keep their own view (src/lib/budgets/pending-overlay.ts) because of their identity rules.
 *
 * View: queued creates, edits and deletes of one entity kind, keyed by server id for edits and deletes.
 * overlayRows: hides a pending delete, keeps a failed delete marked, applies queued edit fields, marks each changed
 * row with pendingSync. Empty view = the input array returned as is (flag off = zero change).
 */
import { entityOf } from "./entities";
import type { EntityKind, FieldValue, OutboxEntry } from "./types";

export type EntityPendingStatus = "pending" | "failed";

export interface EntityPendingEntry {
  opId: string;
  status: EntityPendingStatus;
  failReason: string | null;
  fields: Record<string, FieldValue>;
  ref: Record<string, FieldValue>;
}

export interface EntityRowMark {
  kind: "create" | "edit" | "delete";
  status: EntityPendingStatus;
  opId: string;
  failReason: string | null;
}

export interface EntityPendingView {
  creates: EntityPendingEntry[];
  edits: Record<number, EntityPendingEntry>;
  deletes: Record<number, { opId: string; status: EntityPendingStatus; failReason: string | null }>;
}

export const EMPTY_ENTITY_VIEW: EntityPendingView = Object.freeze({ creates: [], edits: {}, deletes: {} }) as EntityPendingView;

export const isEntityViewEmpty = (v: EntityPendingView): boolean =>
  v.creates.length === 0 && Object.keys(v.edits).length === 0 && Object.keys(v.deletes).length === 0;

export function toEntityPendingView(entries: OutboxEntry[], kind: EntityKind): EntityPendingView {
  const view: EntityPendingView = { creates: [], edits: {}, deletes: {} };
  for (const e of entries) {
    if (entityOf(e) !== kind) continue;
    const base = { opId: e.opId, status: e.status, failReason: e.failReason };
    if (e.kind === "create") view.creates.push({ ...base, fields: { ...e.fields }, ref: { ...(e.ref ?? {}) } });
    else if (e.serverId === null) continue;
    else if (e.kind === "edit") view.edits[e.serverId] = { ...base, fields: { ...e.fields }, ref: { ...(e.ref ?? {}) } };
    else view.deletes[e.serverId] = base;
  }
  return view;
}

export interface OverlayOptions<T> {
  /** Row fields a queued edit changes (only the keys it carries). */
  patchOf: (fields: Record<string, FieldValue>, row: T) => Partial<T>;
  /** Optional: a row for each queued create (negative id). Without it, creates are not shown. */
  rowOfCreate?: (c: EntityPendingEntry, localId: number) => T;
}

/** Stable negative id for a queued create's row. */
export function localEntityId(opId: string): number {
  let h = 0;
  for (let i = 0; i < opId.length; i++) h = (Math.imul(h, 31) + opId.charCodeAt(i)) | 0;
  return -(Math.abs(h) % 2_000_000_000) - 1;
}

export function overlayRows<T extends { id: number }>(rows: T[], view: EntityPendingView, opts: OverlayOptions<T>): Array<T & { pendingSync?: EntityRowMark }> {
  if (isEntityViewEmpty(view)) return rows;
  const out: Array<T & { pendingSync?: EntityRowMark }> = [];
  for (const row of rows) {
    const d = view.deletes[row.id];
    if (d) {
      if (d.status === "failed") out.push({ ...row, pendingSync: { kind: "delete", status: "failed", opId: d.opId, failReason: d.failReason } });
      continue;
    }
    const ed = view.edits[row.id];
    if (ed) {
      out.push({ ...row, ...opts.patchOf(ed.fields, row), pendingSync: { kind: "edit", status: ed.status, opId: ed.opId, failReason: ed.failReason } });
    } else {
      out.push(row);
    }
  }
  if (opts.rowOfCreate) {
    for (const c of view.creates) {
      const id = localEntityId(c.opId);
      out.push({ ...opts.rowOfCreate(c, id), id, pendingSync: { kind: "create", status: c.status, opId: c.opId, failReason: c.failReason } });
    }
  }
  return out;
}
