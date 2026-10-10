/**
 * One-way hydrate of the in-memory local read cache from the app's existing JSON APIs (local-first L2a).
 * Read only: GET requests, no writes to the server. Pure mapping plus an injected fetch, so tests run without a network.
 *
 * API shapes (checked against the routes, 2026-10-10):
 *  - GET /api/accounts?includeArchived=1  -> bare JSON array (archived rows included so balances match the server)
 *  - GET /api/categories                  -> bare JSON array
 *  - GET /api/transactions?limit=N&cursor=  -> cursor mode: { data, nextCursor, hasMore, total? }, first page cursor=""
 * A {success, data} envelope is also accepted (MCP-style) and unwrapped.
 */
import type { AccountRow, CategoryRow, LocalRow, LocalStore, TableName, TransactionRow } from "../store/types";

/** Minimal fetch surface: the global fetch satisfies it, and tests pass fakes. */
export interface FetchResponseLike {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}
export type FetchLike = (url: string) => Promise<FetchResponseLike>;

/** Only the store method hydration needs. */
export type UpsertStore = Pick<LocalStore, "upsertRows">;

export interface HydrateCounts {
  accounts: number;
  categories: number;
  transactions: number;
}

export interface HydrateResult {
  /** Rows mapped and upserted. */
  loaded: HydrateCounts;
  /** Rows returned by the API that could not be mapped to the local schema. */
  skipped: HydrateCounts;
  /** Transaction pages fetched. */
  pages: number;
}

export class HydrateError extends Error {
  readonly status: number | null;
  constructor(message: string, status: number | null = null) {
    super(message);
    this.name = "HydrateError";
    this.status = status;
  }
}

export const HYDRATE_BATCH = 500;
export const TX_PAGE_LIMIT = 200; // server cap is 200
const MAX_TX_PAGES = 10_000;

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

/** Number, or a numeric string (tolerant: the API has returned money as text in other routes). Null otherwise. */
function toNum(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

const strOrNull = (v: unknown): string | null | undefined => (v === null || v === undefined ? null : typeof v === "string" ? v : undefined);
const boolOrFalse = (v: unknown): boolean | undefined => (v === null || v === undefined ? false : typeof v === "boolean" ? v : undefined);
/** Optional number: null/undefined -> null; present but not numeric -> undefined (unmappable). */
const optNum = (v: unknown): number | null | undefined => (v === null || v === undefined ? null : toNum(v) ?? undefined);

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Maps one API account. Returns null when the row cannot be represented locally. */
export function mapAccount(raw: unknown): AccountRow | null {
  if (!isObj(raw)) return null;
  const id = toNum(raw.id);
  const type = strOrNull(raw.type);
  const group = strOrNull(raw.group);
  const currency = strOrNull(raw.currency);
  const name = strOrNull(raw.name);
  const archived = boolOrFalse(raw.archived);
  const isInvestment = boolOrFalse(raw.isInvestment);
  const invisible = boolOrFalse(raw.invisible);
  if (id === null || type === undefined || group === undefined || currency === undefined || name === undefined) return null;
  if (archived === undefined || isInvestment === undefined || invisible === undefined) return null;
  return { id: String(id), serverId: id, type, group, currency, name, archived, isInvestment, invisible };
}

/** Maps one API category. Returns null when the row cannot be represented locally. */
export function mapCategory(raw: unknown): CategoryRow | null {
  if (!isObj(raw)) return null;
  const id = toNum(raw.id);
  const type = strOrNull(raw.type);
  const group = strOrNull(raw.group);
  const name = strOrNull(raw.name);
  if (id === null || type === undefined || group === undefined || name === undefined) return null;
  return { id: String(id), serverId: id, type, group, name };
}

/** Maps one API transaction. Returns null when id, date or amount are missing or malformed. */
export function mapTransaction(raw: unknown): TransactionRow | null {
  if (!isObj(raw)) return null;
  const id = toNum(raw.id);
  const date = typeof raw.date === "string" && DATE_RE.test(raw.date) ? raw.date : null;
  const amount = toNum(raw.amount);
  const accountId = optNum(raw.accountId);
  const categoryId = optNum(raw.categoryId);
  const currency = strOrNull(raw.currency);
  const enteredCurrency = strOrNull(raw.enteredCurrency);
  const enteredAmount = optNum(raw.enteredAmount);
  const enteredFxRate = optNum(raw.enteredFxRate);
  const payee = strOrNull(raw.payee);
  const note = strOrNull(raw.note);
  const tags = strOrNull(raw.tags);
  const linkId = strOrNull(raw.linkId);
  if (id === null || date === null || amount === null) return null;
  if (accountId === undefined || categoryId === undefined || enteredAmount === undefined || enteredFxRate === undefined) return null;
  if (currency === undefined || enteredCurrency === undefined || payee === undefined || note === undefined || tags === undefined || linkId === undefined) return null;
  return {
    id: String(id),
    serverId: id,
    date,
    accountId: accountId === null ? null : String(accountId),
    categoryId: categoryId === null ? null : String(categoryId),
    currency,
    amount,
    enteredCurrency,
    enteredAmount,
    enteredFxRate,
    payee,
    note,
    tags,
    linkId,
  };
}

/** Unwraps a {success, data} envelope when present; throws on success:false. */
function unwrap(body: unknown, path: string): unknown {
  if (isObj(body) && "success" in body && "data" in body) {
    if (body.success === false) throw new HydrateError(`${path}: API reported failure`);
    return body.data;
  }
  return body;
}

async function getJson(fetchImpl: FetchLike, path: string): Promise<unknown> {
  const res = await fetchImpl(path);
  if (!res.ok) throw new HydrateError(`${path} failed with HTTP ${res.status}`, res.status);
  return unwrap(await res.json(), path);
}

/** Accepts a bare array or { data: [...] }. Anything else is an unexpected shape. */
function rowsOf(body: unknown, path: string): unknown[] {
  if (Array.isArray(body)) return body;
  if (isObj(body) && Array.isArray(body.data)) return body.data;
  throw new HydrateError(`${path}: unexpected response shape`);
}

async function flush(store: UpsertStore, table: TableName, rows: LocalRow[]): Promise<void> {
  for (let i = 0; i < rows.length; i += HYDRATE_BATCH) {
    await store.upsertRows(table, rows.slice(i, i + HYDRATE_BATCH));
  }
}

/**
 * Fetches accounts (incl. archived), categories and every transaction page, maps them and upserts them.
 * Unmappable rows are skipped and counted. A failed request throws HydrateError and leaves earlier batches in place.
 */
export async function hydrateFromApi(fetchImpl: FetchLike, store: UpsertStore): Promise<HydrateResult> {
  const loaded: HydrateCounts = { accounts: 0, categories: 0, transactions: 0 };
  const skipped: HydrateCounts = { accounts: 0, categories: 0, transactions: 0 };

  const accPath = "/api/accounts?includeArchived=1";
  const accounts: AccountRow[] = [];
  for (const raw of rowsOf(await getJson(fetchImpl, accPath), accPath)) {
    const row = mapAccount(raw);
    if (row) accounts.push(row);
    else skipped.accounts++;
  }
  await flush(store, "accounts", accounts);
  loaded.accounts = accounts.length;

  const catPath = "/api/categories";
  const categories: CategoryRow[] = [];
  for (const raw of rowsOf(await getJson(fetchImpl, catPath), catPath)) {
    const row = mapCategory(raw);
    if (row) categories.push(row);
    else skipped.categories++;
  }
  await flush(store, "categories", categories);
  loaded.categories = categories.length;

  let pages = 0;
  let cursor = "";
  const seen = new Set<string>();
  const pending: TransactionRow[] = [];
  for (;;) {
    if (pages >= MAX_TX_PAGES) throw new HydrateError("transactions: too many pages");
    const path = `/api/transactions?limit=${TX_PAGE_LIMIT}&cursor=${encodeURIComponent(cursor)}`;
    const page = await getJson(fetchImpl, path);
    pages++;
    if (!isObj(page) || !Array.isArray(page.data)) throw new HydrateError("/api/transactions: unexpected page shape");
    for (const raw of page.data) {
      const row = mapTransaction(raw);
      if (row) pending.push(row);
      else skipped.transactions++;
    }
    while (pending.length >= HYDRATE_BATCH) {
      const batch = pending.splice(0, HYDRATE_BATCH);
      await flush(store, "transactions", batch);
      loaded.transactions += batch.length;
    }
    const next = page.nextCursor;
    if (typeof next !== "string" || next === "" || page.hasMore === false) break;
    if (seen.has(next)) throw new HydrateError("transactions: cursor repeated");
    seen.add(next);
    cursor = next;
  }
  await flush(store, "transactions", pending);
  loaded.transactions += pending.length;

  return { loaded, skipped, pages };
}
