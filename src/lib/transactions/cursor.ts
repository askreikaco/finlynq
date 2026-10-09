/**
 * Opaque paging cursor for GET /api/transactions (P2).
 *
 * Wire form: base64url(JSON). Payload fields:
 *   v  version (1)
 *   s  sort column id (SortableColumnId)
 *   d  direction "asc" | "desc"
 *   k  keyset value of the last returned row (date sort: "YYYY-MM-DD",
 *      amount sort: finite number). Keyset sorts only.
 *   id last returned row id (keyset sorts only; id is always DESC tiebreak)
 *   o  next offset (offset sorts only)
 *
 * Keyset is used only for date and amount (NOT NULL columns). Other sorts
 * carry an offset. Cursors are not signed: a tampered cursor can only page
 * the caller's own rows, because every query is scoped by user_id.
 */
import type { SortableColumnId } from "@/lib/transactions/columns";

export const CURSOR_VERSION = 1;

export type TxSortDirection = "asc" | "desc";

export const KEYSET_SORT_IDS = ["date", "amount"] as const;
export type KeysetSortId = (typeof KEYSET_SORT_IDS)[number];

export function isKeysetSortId(s: string): s is KeysetSortId {
  return (KEYSET_SORT_IDS as readonly string[]).includes(s);
}

export type TxKeysetCursor = {
  v: typeof CURSOR_VERSION;
  s: KeysetSortId;
  d: TxSortDirection;
  k: string | number;
  id: number;
};

export type TxOffsetCursor = {
  v: typeof CURSOR_VERSION;
  s: Exclude<SortableColumnId, KeysetSortId>;
  d: TxSortDirection;
  o: number;
};

export type TxCursor = TxKeysetCursor | TxOffsetCursor;

export class InvalidCursorError extends Error {
  constructor(message = "Invalid cursor") {
    super(message);
    this.name = "InvalidCursorError";
  }
}

const MAX_CURSOR_CHARS = 512;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const B64URL_RE = /^[A-Za-z0-9_-]+$/;

export function encodeCursor(cursor: TxCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

/**
 * Decode and validate a cursor against the request's sort + direction.
 * Throws InvalidCursorError on any malformed input or mismatch.
 */
export function decodeCursor(
  raw: string,
  expected: { sort: SortableColumnId; direction: TxSortDirection },
): TxCursor {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > MAX_CURSOR_CHARS) {
    throw new InvalidCursorError();
  }
  if (!B64URL_RE.test(raw)) throw new InvalidCursorError();

  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
  } catch {
    throw new InvalidCursorError();
  }
  if (!isPlainObject(parsed)) throw new InvalidCursorError();

  if (parsed.v !== CURSOR_VERSION) throw new InvalidCursorError();
  if (parsed.s !== expected.sort) throw new InvalidCursorError("Cursor does not match sort");
  if (parsed.d !== expected.direction) throw new InvalidCursorError("Cursor does not match direction");

  if (isKeysetSortId(expected.sort)) {
    if (!hasOnlyKeys(parsed, ["v", "s", "d", "k", "id"])) throw new InvalidCursorError();
    const { k, id } = parsed;
    if (typeof id !== "number" || !Number.isSafeInteger(id) || id <= 0) {
      throw new InvalidCursorError();
    }
    if (expected.sort === "date") {
      if (typeof k !== "string" || !isCalendarDate(k)) throw new InvalidCursorError();
    } else {
      if (typeof k !== "number" || !Number.isFinite(k)) throw new InvalidCursorError();
    }
    return {
      v: CURSOR_VERSION,
      s: expected.sort,
      d: expected.direction,
      k,
      id,
    } as TxKeysetCursor;
  }

  if (!hasOnlyKeys(parsed, ["v", "s", "d", "o"])) throw new InvalidCursorError();
  const { o } = parsed;
  if (typeof o !== "number" || !Number.isSafeInteger(o) || o < 0) {
    throw new InvalidCursorError();
  }
  return {
    v: CURSOR_VERSION,
    s: expected.sort as TxOffsetCursor["s"],
    d: expected.direction,
    o,
  };
}

function isCalendarDate(v: string): boolean {
  if (!DATE_RE.test(v)) return false;
  const [y, m, d] = v.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function hasOnlyKeys(obj: Record<string, unknown>, allowed: string[]): boolean {
  return Object.keys(obj).every((key) => allowed.includes(key));
}
