/**
 * Per-field last-writer-wins against the server row (local-first L3). Pure.
 *
 * The server stays the source of truth. The server row's updatedAt is the server's clock for any field that changed
 * since the edit's baseline: {ms: updatedAt, counter: 0}. (Transactions: the row's updatedAt. Budgets: updated_at.)
 * For each field the edit writes:
 *   server value == baseline            -> nobody else changed it: send.
 *   server value == the value we write  -> already there: drop (no-op).
 *   otherwise (concurrent change)       -> HLC LWW: local field HLC > server clock sends, else server wins and the field is dropped.
 */
import { compareHlc, type Hlc } from "../clock/hlc";
import type { EntityFields, FieldValue, OutboxEntry } from "./types";

export interface ServerTx {
  fields: EntityFields;
  updatedAtMs: number;
}

export interface Resolution {
  send: EntityFields;
  /** Fields where the server's concurrent value won. */
  lost: string[];
  /** Fields already equal on the server. */
  noop: string[];
}

const same = (a: FieldValue | undefined, b: FieldValue | undefined): boolean => (a ?? null) === (b ?? null);

export function resolveEdit(entry: Pick<OutboxEntry, "fields" | "fieldHlc" | "base">, server: ServerTx): Resolution {
  const serverClock: Hlc = { ms: server.updatedAtMs, counter: 0 };
  const res: Resolution = { send: {}, lost: [], noop: [] };
  for (const f of Object.keys(entry.fields)) {
    const mine = entry.fields[f] as FieldValue;
    const theirs = server.fields[f];
    if (same(theirs, entry.base[f])) {
      res.send[f] = mine;
    } else if (same(theirs, mine)) {
      res.noop.push(f);
    } else {
      const hlc = entry.fieldHlc[f];
      if (hlc && compareHlc(hlc, serverClock) > 0) res.send[f] = mine;
      else res.lost.push(f);
    }
  }
  return res;
}
