/**
 * Projects register state into row sets per entity. PROTOTYPE, unreviewed.
 * A row is omitted when its `_deleted` register is true. Rows are sorted by id.
 * Each row is `{ ...fields, id: rowId }`; a field named `id` is overwritten by rowId.
 */
import type { JsonValue } from "../oplog/types";
import { DELETED_FIELD, splitRegKey, type MergeState } from "./state";

export type Row = Record<string, JsonValue>;
export type RowSets = Record<string, Row[]>;

export function project(state: MergeState): RowSets {
  const rows = new Map<string, { entity: string; rowId: string; fields: Row; deleted: boolean }>();
  const registers = state.exportRegisters();
  for (const key of Object.keys(registers)) {
    const { entity, rowId, field } = splitRegKey(key);
    const id = entity + "|" + rowId;
    let row = rows.get(id);
    if (row === undefined) {
      row = { entity, rowId, fields: {}, deleted: false };
      rows.set(id, row);
    }
    const value = registers[key].value;
    if (field === DELETED_FIELD) row.deleted = value === true;
    else row.fields[field] = value;
  }

  const out: RowSets = {};
  const ordered = Array.from(rows.values()).sort((a, b) =>
    a.entity < b.entity ? -1 : a.entity > b.entity ? 1 : a.rowId < b.rowId ? -1 : a.rowId > b.rowId ? 1 : 0,
  );
  for (const row of ordered) {
    if (row.deleted) continue;
    if (out[row.entity] === undefined) out[row.entity] = [];
    out[row.entity].push({ ...row.fields, id: row.rowId });
  }
  return out;
}
