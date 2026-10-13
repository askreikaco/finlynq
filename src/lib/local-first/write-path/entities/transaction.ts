/**
 * Transaction adapter (local-first L3). The reference behaviour: the wire shapes here are exactly the ones drain.ts
 * used before the adapter registry existed (POST/PUT/DELETE/GET on /api/transactions).
 */
import type { TransactionRow } from "../../store/types";
import { EDITABLE_FIELDS, type EntityAdapter, type FieldValue, type OutboxEntry } from "../types";
import { isObj, pickFields, sameValue } from "./common";

const str = (v: unknown): string | null => (v === null || v === undefined ? null : String(v));

/** Local row for an entry, merged onto `base` when editing. */
export function rowFromEntry(entry: OutboxEntry, base?: TransactionRow): TransactionRow {
  const f = entry.fields;
  const b: TransactionRow = base ?? { id: entry.rowId, serverId: entry.serverId, date: "1970-01-01", accountId: null, categoryId: null, currency: null, amount: 0 };
  return {
    ...b,
    id: entry.rowId,
    serverId: entry.serverId,
    date: f.date !== undefined ? String(f.date) : b.date,
    amount: f.amount !== undefined ? Number(f.amount) : b.amount,
    accountId: f.accountId !== undefined ? str(f.accountId) : b.accountId,
    categoryId: f.categoryId !== undefined ? str(f.categoryId) : b.categoryId,
    currency: f.currency !== undefined ? str(f.currency) : b.currency,
    enteredAmount: f.enteredAmount !== undefined ? (f.enteredAmount === null ? null : Number(f.enteredAmount)) : b.enteredAmount,
    enteredCurrency: f.enteredCurrency !== undefined ? str(f.enteredCurrency) : b.enteredCurrency,
    payee: f.payee !== undefined ? str(f.payee) : b.payee,
    note: f.note !== undefined ? str(f.note) : b.note,
    tags: f.tags !== undefined ? str(f.tags) : b.tags,
  };
}

function unwrapRows(body: unknown): Record<string, unknown>[] {
  let b = body;
  if (isObj(b) && "success" in b && "data" in b) b = b.data;
  if (isObj(b) && Array.isArray(b.data)) b = b.data;
  return Array.isArray(b) ? b.filter(isObj) : [];
}

const EDITABLE: readonly string[] = EDITABLE_FIELDS;

export const transactionAdapter: EntityAdapter = {
  kind: "transaction",
  basePath: "/api/transactions",
  createFields: EDITABLE,
  editableFields: EDITABLE,
  refFields: [],
  cacheTable: "transactions",
  canCreateOffline: true,
  canEditOffline: true,
  canDeleteOffline: true,
  dependsOn: ["account", "category"],
  serialize: (fields) => fields,
  editRequest: (serverId, _e, send) => ({ method: "PUT", url: "/api/transactions", body: { id: serverId, ...send } }),
  fetchRequest: (serverId) => ({ method: "GET", url: `/api/transactions?id=${serverId}&scope=all` }),
  rowsOf: unwrapRows,
  idOf: (row) => (typeof row.id === "number" ? row.id : null),
  updatedAtOf: (row) => (typeof row.updatedAt === "string" ? row.updatedAt : null),
  fieldsOf: (row) => pickFields(row, EDITABLE),
  rowFromEntry: (entry, base) => rowFromEntry(entry, base as TransactionRow | undefined),
  lostCreateLookup(e) {
    if (typeof e.fields.date !== "string") return null;
    return `/api/transactions?startDate=${e.fields.date}&endDate=${e.fields.date}&limit=200&scope=all`;
  },
  matchesLostCreate(row, e, since) {
    const created = typeof row.createdAt === "string" ? Date.parse(row.createdAt) : NaN;
    if (!(created >= since) || typeof row.id !== "number") return false;
    const got = pickFields(row, EDITABLE);
    return (Object.keys(e.fields)).every((k) => sameValue(got[k] as FieldValue | undefined, e.fields[k]));
  },
};
