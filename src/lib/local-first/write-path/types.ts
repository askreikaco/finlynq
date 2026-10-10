/** Outbox entry types (local-first L3). Field names are the /api/transactions body names. */
import type { Hlc } from "../clock/hlc";

/** Fields the offline queue may write. Anything else (splits, repeat, portfolio, subscription) is online-only in v1. */
export const EDITABLE_FIELDS = [
  "date",
  "amount",
  "accountId",
  "categoryId",
  "currency",
  "enteredAmount",
  "enteredCurrency",
  "payee",
  "note",
  "tags",
] as const;
export type EditableField = (typeof EDITABLE_FIELDS)[number];
export type FieldValue = string | number | null;
export type TxFields = Partial<Record<EditableField, FieldValue>>;

export type EntryStatus =
  /** Waiting to send (maybe after backoff). */
  | "pending"
  /** Permanent server rejection (4xx) or row gone. Kept for review, never retried. */
  | "failed";

export interface OutboxEntry {
  /** Idempotency key and dedupe key. */
  opId: string;
  kind: "create" | "edit";
  /** Local row id in the read cache: `local-<opId>` for a create, String(serverId) for an edit. */
  rowId: string;
  /** Server id: set for an edit at enqueue, for a create after the POST succeeded (then the entry is removed). */
  serverId: number | null;
  /** Values to write. */
  fields: TxFields;
  /** Per-field HLC of the last local write of that field. */
  fieldHlc: Partial<Record<EditableField, Hlc>>;
  /** Edit only: the server-confirmed values of the edited fields when the edit was made (conflict baseline). */
  base: TxFields;
  createdAt: number;
  attempts: number;
  nextAttemptAt: number;
  /** Create only: set when a POST was sent but the outcome is unknown (lost response). */
  firstSendAt: number | null;
  status: EntryStatus;
  failReason: string | null;
}
