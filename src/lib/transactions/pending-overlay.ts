/**
 * Offline queue overlay for the transactions list (local-first L3, flag off by default). Pure.
 *
 * Takes the server rows of the list plus a snapshot of the outbox (PendingTxView) and returns the rows to show:
 *   - queued creates at the top (newest first), as rows with a negative local id and a pendingSync mark;
 *   - queued edits applied over the server row (field overlay) with the mark;
 *   - queued deletes hidden (they are announced by the caller as a count); a FAILED delete keeps the row, marked;
 *   - failed edits keep the server values, marked.
 * With an empty snapshot the input array is returned as is (same reference): flag off = zero change.
 * Pending creates ignore column filters and the less common filters (hidden while a column filter is active);
 * account, category, date range, search text, tag, direction and amount bounds are honoured.
 */
import type { Account, Category, PendingSyncMark, Transaction } from "@/app/(app)/transactions/_types";

export type PendingStatus = "pending" | "failed";
export type PendingFields = Record<string, string | number | null | undefined>;

export interface PendingEntryView {
  opId: string;
  status: PendingStatus;
  failReason: string | null;
}
export interface PendingCreateView extends PendingEntryView {
  createdAt: number;
  fields: PendingFields;
}
export interface PendingEditView extends PendingEntryView {
  fields: PendingFields;
}
export interface PendingTxView {
  creates: PendingCreateView[];
  /** By server row id. */
  edits: Record<number, PendingEditView>;
  /** By server row id. */
  deletes: Record<number, PendingEntryView>;
}

export const EMPTY_PENDING: PendingTxView = Object.freeze({ creates: [], edits: {}, deletes: {} }) as PendingTxView;

export function isPendingEmpty(p: PendingTxView): boolean {
  return p.creates.length === 0 && Object.keys(p.edits).length === 0 && Object.keys(p.deletes).length === 0;
}

/** Stable negative id for a queued create (React key / row identity; never sent to the server). */
export function localRowId(opId: string): number {
  let h = 0;
  for (let i = 0; i < opId.length; i++) h = (Math.imul(h, 31) + opId.charCodeAt(i)) | 0;
  return -(Math.abs(h) % 2_000_000_000) - 1;
}

const num = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};
const text = (v: unknown): string => (v === null || v === undefined ? "" : String(v));

export interface OverlayContext {
  accounts: Account[];
  categories: Category[];
  filters: Record<string, string>;
  hasColFilters: boolean;
}

function mark(kind: PendingSyncMark["kind"], e: PendingEntryView): PendingSyncMark {
  return { kind, status: e.status, opId: e.opId, failReason: e.failReason };
}

/** Applies queued field values over a row (accountId and categoryId also refresh the display names). */
function overlay(t: Transaction, f: PendingFields, ctx: OverlayContext): Transaction {
  const out: Transaction = { ...t };
  if (f.date !== undefined && f.date !== null) out.date = String(f.date);
  const acc = num(f.accountId);
  if (acc !== null) {
    out.accountId = acc;
    const a = ctx.accounts.find((x) => x.id === acc);
    if (a) {
      out.accountName = a.name;
      out.accountAlias = a.alias ?? null;
      out.accountType = a.type ?? null;
      if (f.enteredCurrency === undefined) out.currency = a.currency;
    }
  }
  const cat = num(f.categoryId);
  if (cat !== null) {
    out.categoryId = cat;
    const c = ctx.categories.find((x) => x.id === cat);
    if (c) {
      out.categoryName = c.name;
      out.categoryType = c.type;
    }
  }
  const entered = num(f.enteredAmount);
  const ccy = f.enteredCurrency != null ? String(f.enteredCurrency) : null;
  if (entered !== null) {
    out.enteredAmount = entered;
    // The account-currency amount is only known client-side when no conversion is involved.
    if (ccy === null || ccy === out.currency) out.amount = entered;
  }
  if (ccy !== null) out.enteredCurrency = ccy;
  const amt = num(f.amount);
  if (amt !== null && entered === null) out.amount = amt;
  if (f.currency != null) out.currency = String(f.currency);
  if (f.payee !== undefined) out.payee = text(f.payee);
  if (f.note !== undefined) out.note = text(f.note);
  if (f.tags !== undefined) out.tags = text(f.tags);
  return out;
}

function blankRow(c: PendingCreateView, ctx: OverlayContext): Transaction {
  const base: Transaction = {
    id: localRowId(c.opId),
    date: "",
    accountId: 0,
    accountName: "",
    categoryId: 0,
    categoryName: "",
    categoryType: "",
    currency: "",
    amount: 0,
    quantity: null,
    portfolioHolding: null,
    note: "",
    payee: "",
    tags: "",
    isBusiness: null,
    linkId: null,
    pendingSync: mark("create", c),
  };
  const row = overlay(base, c.fields, ctx);
  if (!row.currency) row.currency = row.enteredCurrency ?? "";
  if (row.enteredAmount == null) row.enteredAmount = row.amount;
  // Cross-currency create: the converted amount is unknown until the server answers, so show the entered side only.
  row.amount = row.enteredAmount ?? row.amount;
  if (row.enteredCurrency) row.currency = row.enteredCurrency;
  return row;
}

function matchesFilters(t: Transaction, ctx: OverlayContext): boolean {
  if (ctx.hasColFilters) return false;
  const f = ctx.filters;
  if (f.id) return false;
  if (f.accountId && String(t.accountId) !== f.accountId) return false;
  if (f.categoryId && String(t.categoryId) !== f.categoryId) return false;
  if (f.startDate && t.date < f.startDate) return false;
  if (f.endDate && t.date > f.endDate) return false;
  if (f.portfolioHolding) return false;
  if (f.tag && !t.tags.split(",").map((x) => x.trim()).includes(f.tag)) return false;
  if (f.search) {
    const q = f.search.toLowerCase();
    if (![t.payee, t.note, t.tags, t.categoryName].some((v) => text(v).toLowerCase().includes(q))) return false;
  }
  const shown = Math.abs(t.enteredAmount ?? t.amount);
  if (f.direction === "in" && t.amount < 0) return false;
  if (f.direction === "out" && t.amount >= 0) return false;
  if (f.minAmount && num(f.minAmount) !== null && shown < (num(f.minAmount) as number)) return false;
  if (f.maxAmount && num(f.maxAmount) !== null && shown > (num(f.maxAmount) as number)) return false;
  return true;
}

/** Rows to render: queued creates first, edits overlaid, queued deletes hidden. */
export function applyPendingToTransactions(txns: Transaction[], pending: PendingTxView, ctx: OverlayContext): Transaction[] {
  if (isPendingEmpty(pending)) return txns;
  const body: Transaction[] = [];
  for (const t of txns) {
    const del = pending.deletes[t.id];
    if (del) {
      // A pending delete hides the row; a failed one leaves it visible so the user can see and resolve it.
      if (del.status === "pending") continue;
      body.push({ ...t, pendingSync: mark("delete", del) });
      continue;
    }
    const ed = pending.edits[t.id];
    if (!ed) {
      body.push(t);
    } else if (ed.status === "failed") {
      body.push({ ...t, pendingSync: mark("edit", ed) });
    } else {
      body.push({ ...overlay(t, ed.fields, ctx), pendingSync: mark("edit", ed) });
    }
  }
  const creates = [...pending.creates]
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((c) => blankRow(c, ctx))
    .filter((r) => matchesFilters(r, ctx));
  return [...creates, ...body];
}

/** Number of deletes waiting to sync (hidden rows), for the calm notice above the list. */
export function countPendingDeletes(pending: PendingTxView): number {
  return Object.values(pending.deletes).filter((d) => d.status === "pending").length;
}
