/** Outbox entry types (local-first L3). Transaction field names are the /api/transactions body names. */
import type { Hlc } from "../clock/hlc";

/** Entities the offline write queue can carry. Each has an adapter in ./entities. */
export const ENTITY_KINDS = ["transaction", "budget", "goal", "rule", "account", "category"] as const;
export type EntityKind = (typeof ENTITY_KINDS)[number];

/** Fields the offline queue may write for a transaction. Anything else (splits, repeat, portfolio, subscription) is online-only in v1. */
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
/** Generic field bag for any entity (string keys). */
export type EntityFields = Record<string, FieldValue>;

export type EntryStatus =
  /** Waiting to send (maybe after backoff). */
  | "pending"
  /** Permanent server rejection (4xx) or row gone. Kept for review, never retried. */
  | "failed";

export interface OutboxEntry {
  /**
   * Entity the write targets. ABSENT on records sealed before the generalisation: absent = 'transaction'.
   * Read it through entityOf(), never directly.
   */
  entity?: EntityKind;
  /** Idempotency key and dedupe key. */
  opId: string;
  kind: "create" | "edit" | "delete";
  /**
   * Local row id: `local-<opId>` for a create; for an edit or delete, String(serverId) for a transaction and
   * `<entity>:<serverId>` for other entities (see rowIdFor in ./entities).
   */
  rowId: string;
  /** Server id: set for an edit at enqueue, for a create after the POST succeeded (then the entry is removed). */
  serverId: number | null;
  /** Identity fields the adapter needs to address the server row (e.g. budget categoryId + month). Not sent as values. */
  ref?: EntityFields;
  /** Values to write. */
  fields: EntityFields;
  /** Per-field HLC of the last local write of that field. */
  fieldHlc: Record<string, Hlc>;
  /** Delete only: the row's server updatedAt when the delete was made (concurrent-change baseline). Null/absent = compare `base`. */
  baseUpdatedAt?: string | null;
  /** Edit and delete: the server-confirmed values of the edited fields when the edit was made (conflict baseline). */
  base: EntityFields;
  createdAt: number;
  attempts: number;
  nextAttemptAt: number;
  /** Create only: set when a POST was sent but the outcome is unknown (lost response). */
  firstSendAt: number | null;
  status: EntryStatus;
  failReason: string | null;
}

/** An HTTP request the drain performs. */
export interface WireRequest {
  method: "GET" | "POST" | "PUT" | "DELETE";
  url: string;
  body?: unknown;
}

/**
 * Per-entity adapter (local-first L3). Everything entity-specific the generic drain / queue needs. Adding an entity =
 * one file in ./entities plus one line in the registry. Transaction behaviour is the reference implementation.
 */
export interface EntityAdapter {
  readonly kind: EntityKind;
  /** Collection path, e.g. /api/budgets. */
  readonly basePath: string;
  /** Fields a create may carry (POST body). */
  readonly createFields: readonly string[];
  /** Fields an edit may write. Conflict resolution works per field of this list. */
  readonly editableFields: readonly string[];
  /** Identity fields kept in `ref` (not editable, not sent as values). */
  readonly refFields: readonly string[];
  /** Local read-cache table the optimistic row lives in. null = no cache table (the list page overlays the outbox itself). */
  readonly cacheTable: "transactions" | null;
  readonly canCreateOffline: boolean;
  readonly canEditOffline: boolean;
  readonly canDeleteOffline: boolean;
  /** Hint only (not enforced yet): entities that must exist on the server before this one is sent. */
  readonly dependsOn: readonly EntityKind[];
  /** Create body (POST basePath) from the queued create fields. */
  serialize(fields: EntityFields): unknown;
  /** Request that writes the edit's winning fields. `server` = the current server values (for fields not in `send`). */
  editRequest(serverId: number, e: OutboxEntry, send: EntityFields, server: EntityFields): WireRequest;
  /** GET of the server row(s) that hold `serverId` (rows come back through rowsOf). */
  fetchRequest(serverId: number, e: OutboxEntry): WireRequest;
  /** Rows out of a GET response body. */
  rowsOf(body: unknown): Record<string, unknown>[];
  idOf(row: Record<string, unknown>): number | null;
  updatedAtOf(row: Record<string, unknown>): string | null;
  /** Editable field values of a server row, normalised (number, string or null). */
  fieldsOf(row: Record<string, unknown>): EntityFields;
  /** Optimistic local row for an entry, merged onto `base` when given. */
  rowFromEntry(entry: OutboxEntry, base?: unknown): unknown;
  /** Lost-response create: URL of the rows that may hold the create. Absent = the server dedupes by key (no lookup). */
  lostCreateLookup?(e: OutboxEntry): string | null;
  /** Lost-response create: whether a looked-up row is the one this entry created (made since `since`, same fields). */
  matchesLostCreate?(row: Record<string, unknown>, e: OutboxEntry, since: number): boolean;
}
