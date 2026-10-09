/**
 * Server-side encrypted-text filtering for the Transactions list (plan 2.4, D1=S).
 *
 * payee / note / tags are ciphertext at rest, so SQL cannot search them. When a
 * text needle is present the server decrypts ONLY those three columns for the
 * rows that pass the SQL filters, applies `matchTxText`, and pushes the matching
 * id set back into SQL as an `ids` filter. The browser never receives the whole
 * ledger.
 *
 * Plaintext rules:
 *   - Decrypted plaintext is never logged and never cached. The memo stores
 *     id lists only.
 *   - Memo keys are per user and per data_version. Entries never cross users.
 */
import { createHash } from "crypto";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { buildTxFilterConditions, type TxSortFilter } from "@/lib/queries";
import { decryptName, decryptTxRow } from "@/lib/crypto/encrypted-columns";
import { getDataVersion } from "@/lib/data-version";
import { securitiesReadEnabledForUser } from "@/lib/securities/flag";

const CIPHERTEXT_PREFIX = "v1:";

/** Text needles (plan 2.5 rules). Every present needle must match (AND). */
export type TxTextNeedles = {
  /** Free-text search over payee, note, tags and String(amount). Trimmed, case-insensitive substring (2.5 a). */
  search?: string | null;
  /** `tag` param: comma list, exact token match, case-insensitive, OR across tokens (2.5 b). */
  tag?: string | null;
  /** `filter_payee`: case-insensitive substring on payee. */
  payee?: string | null;
  /** `filter_note`: case-insensitive substring on note. */
  note?: string | null;
  /** `filter_tags`: case-insensitive substring on the raw tags string. */
  tags?: string | null;
  /**
   * true when the row values are plaintext (DEK available and decrypted).
   * Default false: any value starting with `v1:` is treated as unreadable
   * ciphertext and never matches.
   */
  hasDek?: boolean;
};

/** Plaintext-or-ciphertext row shape read by the predicate. */
export type TxTextRow = {
  payee?: string | null;
  note?: string | null;
  tags?: string | null;
  amount?: number | string | null;
};

/** Returns the lowercased value, or null when it is unreadable ciphertext. */
function readable(v: string | null | undefined, hasDek: boolean): string | null {
  if (v == null) return "";
  const s = String(v);
  if (!hasDek && s.startsWith(CIPHERTEXT_PREFIX)) return null;
  return s.toLowerCase();
}

/** Needle normalisation shared by every substring rule: trim + lowercase. */
function normNeedle(v: string | null | undefined): string {
  return (v ?? "").toLowerCase().trim();
}

function tagTokens(raw: string): string[] {
  return raw
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

/**
 * Pure predicate: does one transaction row satisfy every text needle?
 * Empty needles are no-ops. Unreadable (ciphertext, no DEK) values never match.
 */
export function matchTxText(row: TxTextRow, needles: TxTextNeedles): boolean {
  const hasDek = needles.hasDek === true;
  const payee = readable(row.payee, hasDek);
  const note = readable(row.note, hasDek);
  const tags = readable(row.tags, hasDek);

  const search = normNeedle(needles.search);
  if (search) {
    const amountStr = row.amount != null ? String(row.amount).toLowerCase() : "";
    const hit =
      (payee !== null && payee.includes(search)) ||
      (note !== null && note.includes(search)) ||
      (tags !== null && tags.includes(search)) ||
      amountStr.includes(search);
    if (!hit) return false;
  }

  const tagNeedles = tagTokens(normNeedle(needles.tag));
  if (tagNeedles.length > 0) {
    if (tags === null) return false;
    const rowTokens = tagTokens(tags);
    if (!tagNeedles.some((t) => rowTokens.includes(t))) return false;
  }

  const payeeNeedle = normNeedle(needles.payee);
  if (payeeNeedle) {
    if (payee === null || !payee.includes(payeeNeedle)) return false;
  }

  const noteNeedle = normNeedle(needles.note);
  if (noteNeedle) {
    if (note === null || !note.includes(noteNeedle)) return false;
  }

  const tagsNeedle = normNeedle(needles.tags);
  if (tagsNeedle) {
    if (tags === null || !tags.includes(tagsNeedle)) return false;
  }

  return true;
}

// ─── canonical hashing for memo keys ─────────────────────────────────────────

function canonicalize(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(canonicalize);
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v as Record<string, unknown>).sort()) {
      const val = (v as Record<string, unknown>)[k];
      if (val !== undefined) out[k] = canonicalize(val);
    }
    return out;
  }
  return v;
}

function digestOf(needles: unknown, sqlFilters: unknown): string {
  const json = JSON.stringify(canonicalize({ needles, sqlFilters }));
  return createHash("sha256").update(json, "utf8").digest("hex");
}

// ─── in-process memo (id lists only) ─────────────────────────────────────────

export const TEXT_FILTER_MEMO_TTL_MS = 60_000;
export const TEXT_FILTER_MEMO_MAX_ENTRIES = 20;

type MemoEntry = { userId: string; dataVersion: number; ids: number[]; expiresAt: number };

/** Insertion-ordered Map used as an LRU (oldest first). */
const memo = new Map<string, MemoEntry>();

function memoKey(userId: string, dataVersion: number, hasDek: boolean, digest: string): string {
  return `${userId}\u0000${dataVersion}\u0000${hasDek ? 1 : 0}\u0000${digest}`;
}

function memoGet(key: string): number[] | undefined {
  const entry = memo.get(key);
  if (!entry) return undefined;
  if (Date.now() >= entry.expiresAt) {
    memo.delete(key);
    return undefined;
  }
  // refresh LRU position
  memo.delete(key);
  memo.set(key, entry);
  return entry.ids.slice();
}

function memoSet(key: string, userId: string, dataVersion: number, ids: number[]): void {
  // Invalidate every entry for this user at another data_version.
  for (const [k, e] of memo) {
    if (e.userId === userId && e.dataVersion !== dataVersion) memo.delete(k);
  }
  memo.delete(key);
  memo.set(key, {
    userId,
    dataVersion,
    ids: ids.slice(),
    expiresAt: Date.now() + TEXT_FILTER_MEMO_TTL_MS,
  });
  while (memo.size > TEXT_FILTER_MEMO_MAX_ENTRIES) {
    const oldest = memo.keys().next().value;
    if (oldest === undefined) break;
    memo.delete(oldest);
  }
}

/** Test hook: drop every memo entry. */
export function clearTextFilterMemo(): void {
  memo.clear();
}

/** Test hook: number of live memo entries. */
export function textFilterMemoSize(): number {
  return memo.size;
}

// ─── resolvers ───────────────────────────────────────────────────────────────

/** SQL filters without the paging-only fields. */
function stripPaging(f: TxSortFilter | undefined): TxSortFilter {
  const out: TxSortFilter = { ...(f ?? {}) };
  delete out.cursor;
  delete out.limit;
  delete out.offset;
  return out;
}

/**
 * Returns the ids of the user's transactions that match the SQL filters AND
 * every text needle. No limit is applied. Decrypts only payee, note and tags.
 *
 * Pass `dataVersion` when the caller already has it (checkETag returns it).
 * It is read before the query, so a write that lands mid-request can only
 * leave a stale entry under an old version, which is never hit again.
 */
export async function resolveTextFilterIds(args: {
  userId: string;
  dek: Buffer | null;
  sqlFilters: TxSortFilter;
  needles: Omit<TxTextNeedles, "hasDek">;
  dataVersion?: number;
}): Promise<number[]> {
  const { userId, dek } = args;
  const hasDek = !!dek;
  const sqlFilters = stripPaging(args.sqlFilters);
  const needles: Omit<TxTextNeedles, "hasDek"> = { ...args.needles };

  const dataVersion = args.dataVersion ?? (await getDataVersion(userId));
  const digest = digestOf(needles, sqlFilters);
  const key = memoKey(userId, dataVersion, hasDek, digest);
  const cached = memoGet(key);
  if (cached) return cached;

  const rows = await db
    .select({
      id: schema.transactions.id,
      payee: schema.transactions.payee,
      note: schema.transactions.note,
      tags: schema.transactions.tags,
      amount: schema.transactions.amount,
    })
    .from(schema.transactions)
    .where(and(...buildTxFilterConditions(userId, sqlFilters)));

  const ids: number[] = [];
  for (const r of rows) {
    const dec = decryptTxRow(dek, { payee: r.payee, note: r.note, tags: r.tags });
    // decryptTxRow passes ciphertext through on auth-tag failure. Null those
    // out so a failed decrypt can never match.
    const clean = hasDek
      ? {
          payee: stripCipher(dec.payee),
          note: stripCipher(dec.note),
          tags: stripCipher(dec.tags),
        }
      : dec;
    if (matchTxText({ ...clean, amount: r.amount }, { ...needles, hasDek })) {
      ids.push(r.id);
    }
  }

  memoSet(key, userId, dataVersion, ids);
  return ids;
}

function stripCipher(v: string | null | undefined): string | null {
  if (v == null) return null;
  return v.startsWith(CIPHERTEXT_PREFIX) ? null : v;
}

/**
 * Account ids whose decrypted name or alias contains `needle` (trimmed,
 * case-insensitive). No DEK → []. Empty needle → [] (callers skip empty input).
 */
export async function resolveAccountTextIds(args: {
  userId: string;
  dek: Buffer | null;
  needle: string;
  fields?: ReadonlyArray<"name" | "alias">;
}): Promise<number[]> {
  const needle = normNeedle(args.needle);
  if (!needle || !args.dek) return [];
  const fields = args.fields ?? ["name", "alias"];
  const rows = await db
    .select({
      id: schema.accounts.id,
      nameCt: schema.accounts.nameCt,
      aliasCt: schema.accounts.aliasCt,
    })
    .from(schema.accounts)
    .where(eq(schema.accounts.userId, args.userId));
  const ids: number[] = [];
  for (const a of rows) {
    const name = fields.includes("name") ? decryptName(a.nameCt, args.dek, null) : null;
    const alias = fields.includes("alias") ? decryptName(a.aliasCt, args.dek, null) : null;
    if ((name && name.toLowerCase().includes(needle)) || (alias && alias.toLowerCase().includes(needle))) {
      ids.push(a.id);
    }
  }
  return ids;
}

/**
 * Portfolio-holding ids whose decrypted name contains `needle`. When the
 * securities read flag is on, the displayed name is the linked security's
 * name, so that name is matched too (same preference as the route's display).
 * No DEK → []. Empty needle → [].
 */
export async function resolveHoldingTextIds(args: {
  userId: string;
  dek: Buffer | null;
  needle: string;
}): Promise<number[]> {
  const needle = normNeedle(args.needle);
  if (!needle || !args.dek) return [];
  const securitiesRead = await securitiesReadEnabledForUser(args.userId);
  const rows = await db
    .select({
      id: schema.portfolioHoldings.id,
      nameCt: schema.portfolioHoldings.nameCt,
      securityNameCt: schema.securities.nameCt,
    })
    .from(schema.portfolioHoldings)
    .leftJoin(schema.securities, eq(schema.portfolioHoldings.securityId, schema.securities.id))
    .where(eq(schema.portfolioHoldings.userId, args.userId));
  const ids: number[] = [];
  for (const h of rows) {
    const name = decryptName(h.nameCt, args.dek, null);
    const secName = securitiesRead ? decryptName(h.securityNameCt, args.dek, null) : null;
    if ((name && name.toLowerCase().includes(needle)) || (secName && secName.toLowerCase().includes(needle))) {
      ids.push(h.id);
    }
  }
  return ids;
}
