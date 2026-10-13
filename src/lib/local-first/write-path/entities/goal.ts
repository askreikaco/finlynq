/**
 * Goal adapter (local-first L3). Server: /api/goals. Create = POST, edit = PUT {id,...}, delete = DELETE ?id=, list = GET.
 * Offline fields are the scalar ones. Account links (goal_accounts) are NOT offline: the goal form refuses an offline
 * save that changes them. Conflict clock: goals.updated_at. Create carries Idempotency-Key (POST wrapped).
 */
import { isObj, pickFields } from "./common";
import type { EntityAdapter, EntityFields, FieldValue, WireRequest } from "../types";

const EDITABLE = ["name", "type", "targetAmount", "currency", "deadline", "priority", "status", "note"] as const;
const str = (v: FieldValue | undefined): string | null => (v === null || v === undefined || v === "" ? null : String(v));

export const goalAdapter: EntityAdapter = {
  kind: "goal",
  basePath: "/api/goals",
  createFields: EDITABLE,
  editableFields: EDITABLE,
  refFields: [],
  cacheTable: null,
  canCreateOffline: true,
  canEditOffline: true,
  canDeleteOffline: true,
  dependsOn: ["account"],
  serialize(fields: EntityFields) {
    const body: Record<string, unknown> = { name: fields.name, type: fields.type, targetAmount: Number(fields.targetAmount) };
    if (str(fields.currency)) body.currency = str(fields.currency);
    if (str(fields.deadline)) body.deadline = str(fields.deadline);
    if (fields.priority !== null && fields.priority !== undefined) body.priority = Number(fields.priority);
    if (str(fields.status)) body.status = str(fields.status);
    if (fields.note !== null && fields.note !== undefined) body.note = String(fields.note);
    return body;
  },
  editRequest(serverId, _e, send): WireRequest {
    const body: Record<string, unknown> = { id: serverId };
    for (const [k, v] of Object.entries(send)) {
      if (k === "targetAmount" || k === "priority") body[k] = v === null ? undefined : Number(v);
      else if (k === "deadline" || k === "note") body[k] = v === null ? "" : String(v);
      else body[k] = v;
    }
    return { method: "PUT", url: "/api/goals", body };
  },
  fetchRequest: () => ({ method: "GET", url: "/api/goals" }),
  rowsOf: (body) => (Array.isArray(body) ? body.filter(isObj) : []),
  idOf: (row) => (typeof row.id === "number" ? row.id : null),
  updatedAtOf: (row) => (typeof row.updatedAt === "string" ? row.updatedAt : null),
  fieldsOf: (row) => pickFields(row, EDITABLE),
  rowFromEntry: (entry) => ({ id: entry.serverId ?? entry.rowId, ...entry.fields }),
};
