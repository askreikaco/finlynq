/**
 * Account adapter (local-first L3). Server: /api/accounts. OFFLINE: edit only (rename, alias, group, note, archive,
 * invisible). Create and delete stay online: queued transactions reference account ids, so an offline create would need
 * dependency ordering. Reorder: none (accounts have no order field). Conflict clock: accounts.updated_at.
 * Fetch uses includeArchived=1 so an archived account is still found when its edit is drained.
 */
import { isObj, pickFields } from "./common";
import type { EntityAdapter, EntityFields, WireRequest } from "../types";

const EDITABLE = ["name", "alias", "group", "note", "archived", "invisible"] as const;
const BOOL = new Set(["archived", "invisible"]);

export const accountAdapter: EntityAdapter = {
  kind: "account",
  basePath: "/api/accounts",
  createFields: [],
  editableFields: EDITABLE,
  refFields: [],
  cacheTable: null,
  canCreateOffline: false,
  canEditOffline: true,
  canDeleteOffline: false,
  dependsOn: [],
  serialize: () => {
    throw new RangeError("account create is online-only");
  },
  editRequest(serverId, _e, send): WireRequest {
    const body: Record<string, unknown> = { id: serverId };
    for (const [k, v] of Object.entries(send)) {
      if (BOOL.has(k)) body[k] = v === 1 || v === "1" || v === "true";
      else if (k === "alias") body[k] = v === null || v === "" ? null : String(v);
      else body[k] = v === null ? "" : v;
    }
    return { method: "PUT", url: "/api/accounts", body };
  },
  fetchRequest: () => ({ method: "GET", url: "/api/accounts?includeArchived=1" }),
  rowsOf: (body) => (Array.isArray(body) ? body.filter(isObj) : []),
  idOf: (row) => (typeof row.id === "number" ? row.id : null),
  updatedAtOf: (row) => (typeof row.updatedAt === "string" ? row.updatedAt : null),
  fieldsOf(row) {
    const out: EntityFields = pickFields(row, ["name", "alias", "group", "note"]);
    if (row.archived !== undefined) out.archived = row.archived ? 1 : 0;
    if (row.invisible !== undefined) out.invisible = row.invisible ? 1 : 0;
    return out;
  },
  rowFromEntry: (entry) => ({ id: entry.serverId ?? entry.rowId, ...entry.fields }),
};
