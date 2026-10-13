/**
 * Category adapter (local-first L3). Server: /api/categories. OFFLINE: edit only (rename, move to another group, note).
 * Create and delete stay online (queued transactions reference category ids; see account.ts). The type (income/expense)
 * is not editable offline: it changes how past transactions are counted. Conflict clock: categories.updated_at.
 */
import { isObj, pickFields } from "./common";
import type { EntityAdapter, WireRequest } from "../types";

const EDITABLE = ["name", "group", "note"] as const;

export const categoryAdapter: EntityAdapter = {
  kind: "category",
  basePath: "/api/categories",
  createFields: [],
  editableFields: EDITABLE,
  refFields: [],
  cacheTable: null,
  canCreateOffline: false,
  canEditOffline: true,
  canDeleteOffline: false,
  dependsOn: [],
  serialize: () => {
    throw new RangeError("category create is online-only");
  },
  editRequest(serverId, _e, send): WireRequest {
    const body: Record<string, unknown> = { id: serverId };
    for (const [k, v] of Object.entries(send)) body[k] = v === null ? "" : v;
    return { method: "PUT", url: "/api/categories", body };
  },
  fetchRequest: () => ({ method: "GET", url: "/api/categories" }),
  rowsOf: (body) => (Array.isArray(body) ? body.filter(isObj) : []),
  idOf: (row) => (typeof row.id === "number" ? row.id : null),
  updatedAtOf: (row) => (typeof row.updatedAt === "string" ? row.updatedAt : null),
  fieldsOf: (row) => pickFields(row, EDITABLE),
  rowFromEntry: (entry) => ({ id: entry.serverId ?? entry.rowId, ...entry.fields }),
};
