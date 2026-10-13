/**
 * Transaction-rule adapter (local-first L3). Server: /api/rules. Conditions and actions are JSON: queued as canonical
 * JSON text (so per-field conflict compare is key-order safe) and parsed for the request body. Reorder offline = an
 * edit of `priority`. Conflict clock: transaction_rules.updated_at (bumped by PUT).
 */
import { isObj } from "./common";
import { canonicalJson, parseJsonField } from "./json";
import type { EntityAdapter, EntityFields, WireRequest } from "../types";

const EDITABLE = ["name", "conditions", "actions", "priority", "isActive"] as const;

function toRequestBody(send: EntityFields): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(send)) {
    if (k === "conditions" || k === "actions") out[k] = parseJsonField(v);
    else if (k === "priority") out[k] = Number(v);
    else if (k === "isActive") out[k] = v === "true";
    else out[k] = v;
  }
  return out;
}

export const ruleAdapter: EntityAdapter = {
  kind: "rule",
  basePath: "/api/rules",
  createFields: EDITABLE,
  editableFields: EDITABLE,
  refFields: [],
  cacheTable: null,
  canCreateOffline: true,
  canEditOffline: true,
  canDeleteOffline: true,
  dependsOn: ["category", "account"],
  serialize: (fields) => toRequestBody(fields),
  editRequest: (serverId, _e, send): WireRequest => ({ method: "PUT", url: "/api/rules", body: { id: serverId, ...toRequestBody(send) } }),
  fetchRequest: () => ({ method: "GET", url: "/api/rules" }),
  rowsOf: (body) => (Array.isArray(body) ? body.filter(isObj) : []),
  idOf: (row) => (typeof row.id === "number" ? row.id : null),
  updatedAtOf: (row) => (typeof row.updatedAt === "string" ? row.updatedAt : null),
  fieldsOf(row) {
    const out: EntityFields = {};
    if (row.name !== undefined) out.name = row.name === null ? null : String(row.name);
    if (row.conditions !== undefined) out.conditions = canonicalJson(row.conditions);
    if (row.actions !== undefined) out.actions = canonicalJson(row.actions);
    if (typeof row.priority === "number") out.priority = row.priority;
    if (row.isActive !== undefined) out.isActive = row.isActive ? "true" : "false";
    return out;
  },
  rowFromEntry: (entry) => ({ id: entry.serverId ?? entry.rowId, ...entry.fields }),
};

