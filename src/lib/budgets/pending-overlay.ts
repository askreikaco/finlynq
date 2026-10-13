/**
 * Offline queue overlay for the budgets list (local-first L3, flag off by default). Pure.
 *
 * Takes the server rows of one month plus a snapshot of the outbox (budget entries only) and returns the rows to show:
 *   - queued creates: merged into the server row of the same category + month when there is one, else added as a row
 *     with a negative local id and a pendingSync mark;
 *   - queued edits: applied over the server row (amount, currency) with the mark;
 *   - queued deletes: hidden while pending; a FAILED delete keeps the row, marked.
 *   - failed edits and creates keep their marks too.
 * With an empty snapshot the input array is returned as is (same reference): flag off = zero change.
 */
import type { Budget } from "@/app/(app)/budgets/_components/budget-types";
import { localRowId } from "@/lib/transactions/pending-overlay";
import { entityOf } from "@/lib/local-first/write-path/entities";
import type { OutboxEntry } from "@/lib/local-first/write-path/types";

export type BudgetPendingStatus = "pending" | "failed";

export interface BudgetPendingEntry {
  opId: string;
  status: BudgetPendingStatus;
  failReason: string | null;
  fields: Record<string, string | number | null>;
  ref: Record<string, string | number | null>;
}

export interface BudgetSyncMark {
  kind: "create" | "edit" | "delete";
  status: BudgetPendingStatus;
  opId: string;
  failReason: string | null;
}

export interface PendingBudgetView {
  creates: BudgetPendingEntry[];
  /** By server budget id. */
  edits: Record<number, BudgetPendingEntry>;
  /** By server budget id. */
  deletes: Record<number, { opId: string; status: BudgetPendingStatus; failReason: string | null }>;
}

export const EMPTY_PENDING_BUDGETS: PendingBudgetView = Object.freeze({ creates: [], edits: {}, deletes: {} }) as PendingBudgetView;

export const isPendingBudgetsEmpty = (p: PendingBudgetView): boolean =>
  p.creates.length === 0 && Object.keys(p.edits).length === 0 && Object.keys(p.deletes).length === 0;

/** Budget entries of the outbox as the list shows them. Other entities are ignored. */
export function toPendingBudgetView(entries: OutboxEntry[]): PendingBudgetView {
  const view: PendingBudgetView = { creates: [], edits: {}, deletes: {} };
  for (const e of entries) {
    if (entityOf(e) !== "budget") continue;
    const base = { opId: e.opId, status: e.status, failReason: e.failReason };
    if (e.kind === "create") view.creates.push({ ...base, fields: { ...e.fields }, ref: { ...(e.ref ?? {}) } });
    else if (e.serverId === null) continue;
    else if (e.kind === "edit") view.edits[e.serverId] = { ...base, fields: { ...e.fields }, ref: { ...(e.ref ?? {}) } };
    else view.deletes[e.serverId] = base;
  }
  return view;
}

const num = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};

const mark = (kind: BudgetSyncMark["kind"], e: { opId: string; status: BudgetPendingStatus; failReason: string | null }): BudgetSyncMark => ({
  kind,
  status: e.status,
  opId: e.opId,
  failReason: e.failReason,
});

function overlayEdit(row: Budget, e: BudgetPendingEntry): Budget {
  const amount = num(e.fields.amount);
  const currency = typeof e.fields.currency === "string" ? e.fields.currency : undefined;
  return { ...row, amount: amount ?? row.amount, ...(currency ? { currency } : {}), pendingSync: mark("edit", e) };
}

/** Rows of one month with the queued budget changes applied. Creates only for `month`. */
export function applyPendingBudgets(rows: Budget[], view: PendingBudgetView, month: string): Budget[] {
  if (isPendingBudgetsEmpty(view)) return rows;
  const out: Budget[] = [];
  for (const row of rows) {
    const d = view.deletes[row.id];
    if (d) {
      if (d.status === "failed") out.push({ ...row, pendingSync: mark("delete", { ...d }) });
      continue;
    }
    const ed = view.edits[row.id];
    out.push(ed ? overlayEdit(row, ed) : row);
  }
  for (const c of view.creates) {
    if (c.ref.month !== month) continue;
    const categoryId = num(c.ref.categoryId) ?? num(c.fields.categoryId);
    if (categoryId === null) continue;
    const idx = out.findIndex((r) => r.categoryId === categoryId && r.month === month);
    if (idx >= 0) {
      // The server already has this budget: the queued create (an upsert) shows over it.
      const row = out[idx];
      const amount = num(c.fields.amount);
      const currency = typeof c.fields.currency === "string" ? c.fields.currency : undefined;
      out[idx] = { ...row, amount: amount ?? row.amount, ...(currency ? { currency } : {}), pendingSync: mark("create", c) };
      continue;
    }
    const name = typeof c.ref.categoryName === "string" ? c.ref.categoryName : `Category #${categoryId}`;
    const group = typeof c.ref.categoryGroup === "string" ? c.ref.categoryGroup : "Other";
    const currency = typeof c.fields.currency === "string" ? c.fields.currency : undefined;
    out.push({
      id: localRowId(c.opId),
      categoryId,
      categoryName: name,
      categoryGroup: group,
      month,
      amount: num(c.fields.amount) ?? 0,
      ...(currency ? { currency } : {}),
      rolloverAmount: 0,
      pendingSync: mark("create", c),
    });
  }
  return out;
}
