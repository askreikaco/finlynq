/**
 * Budget adapter (local-first L3). Server: /api/budgets. Create and edit are both POST (upsert keyed by
 * user + categoryId + month), so an edit is a POST that carries the full identity; delete is DELETE ?id=.
 * Identity (categoryId, month) is not editable offline: changing it is a different budget (create + delete).
 * Conflict clock: the row's updatedAt (budgets.updated_at, bumped by upsertBudget).
 */
import { isObj, pickFields } from "./common";
import type { EntityAdapter, EntityFields, OutboxEntry, WireRequest } from "../types";

const EDITABLE = ["amount", "currency"] as const;

const hasCurrency = (v: unknown): v is string => typeof v === "string" && v.trim() !== "";

export const budgetAdapter: EntityAdapter = {
  kind: "budget",
  basePath: "/api/budgets",
  createFields: ["categoryId", "month", "amount", "currency"],
  editableFields: EDITABLE,
  refFields: ["categoryId", "month", "categoryName", "categoryGroup"],
  cacheTable: null,
  canCreateOffline: true,
  canEditOffline: true,
  canDeleteOffline: true,
  dependsOn: ["category"],
  serialize(fields: EntityFields) {
    const body: Record<string, unknown> = { categoryId: fields.categoryId, month: fields.month, amount: fields.amount };
    if (hasCurrency(fields.currency)) body.currency = fields.currency;
    return body;
  },
  editRequest(_serverId, e: OutboxEntry, send, server): WireRequest {
    // POST upsert needs the whole identity and amount: unchanged fields come from the server row read just before.
    const body: Record<string, unknown> = {
      categoryId: e.ref?.categoryId,
      month: e.ref?.month,
      amount: send.amount ?? server.amount,
    };
    const currency = send.currency ?? server.currency;
    if (hasCurrency(currency)) body.currency = currency;
    return { method: "POST", url: "/api/budgets", body };
  },
  fetchRequest: (_serverId, e) => ({ method: "GET", url: `/api/budgets?month=${encodeURIComponent(String(e.ref?.month ?? ""))}` }),
  rowsOf: (body) => (Array.isArray(body) ? body.filter(isObj) : []),
  idOf: (row) => (typeof row.id === "number" ? row.id : null),
  updatedAtOf: (row) => (typeof row.updatedAt === "string" ? row.updatedAt : null),
  fieldsOf: (row) => pickFields(row, EDITABLE),
  rowFromEntry(entry) {
    return { id: entry.serverId ?? entry.rowId, categoryId: entry.ref?.categoryId ?? entry.fields.categoryId ?? null, month: entry.ref?.month ?? entry.fields.month ?? null, ...entry.fields };
  },
};
