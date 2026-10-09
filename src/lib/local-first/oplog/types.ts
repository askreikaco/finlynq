/**
 * Op types for the local-first op log. PROTOTYPE, unreviewed.
 * `Op` is the decoded form of one frame. Header fields (deviceId, opId, seq, hlc) travel in the
 * frame header, not in the encrypted payload; the payload carries the OpBody.
 */
import type { Hlc } from "../clock/hlc";

export type OpKind = "upsert" | "delete";

export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

export interface OpBody {
  entity: string;
  rowId: string;
  kind: OpKind;
  fields: { [key: string]: JsonValue };
}

export interface Op extends OpBody {
  /** UTF-8, 1..16 bytes. */
  deviceId: string;
  /** 26 ASCII chars (ULID text). */
  opId: string;
  /** Per-device sequence number, u32. */
  seq: number;
  hlc: Hlc;
}
