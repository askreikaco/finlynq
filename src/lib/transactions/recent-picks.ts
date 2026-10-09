// Per-browser "recently picked" account/category IDs for the New Transaction pickers.
// IDs only, never names. Every storage access is guarded; failures return [] / null.

export type RecentKind = "account" | "category";
export type RecentTxType = "E" | "I" | "T";

export const RECENT_MAX = 6;
const PREFIX = "finlynq:tx-recent:";
const LAST_ACCOUNT_KEY = `${PREFIX}last-account`;

function recentKey(kind: RecentKind, txType: RecentTxType): string {
  return `${PREFIX}${kind}:${txType}`;
}

function getStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage ?? null;
  } catch {
    return null;
  }
}

function toId(value: unknown): string | null {
  if (typeof value === "string") return value.length > 0 ? value : null;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function dedupeCap(ids: readonly string[]): string[] {
  const out: string[] = [];
  for (const id of ids) {
    if (!out.includes(id)) out.push(id);
    if (out.length >= RECENT_MAX) break;
  }
  return out;
}

export function getRecent(kind: RecentKind, txType: RecentTxType): string[] {
  try {
    const storage = getStorage();
    if (!storage) return [];
    const raw = storage.getItem(recentKey(kind, txType));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const ids: string[] = [];
    for (const v of parsed) {
      const id = toId(v);
      if (id !== null) ids.push(id);
    }
    return dedupeCap(ids);
  } catch {
    return [];
  }
}

export function pushRecent(kind: RecentKind, txType: RecentTxType, id: string | number): void {
  try {
    const storage = getStorage();
    if (!storage) return;
    const next = toId(id);
    if (next === null) return;
    const current = getRecent(kind, txType);
    const updated = dedupeCap([next, ...current.filter((x) => x !== next)]);
    storage.setItem(recentKey(kind, txType), JSON.stringify(updated));
  } catch {
    // storage unavailable or full: picker simply shows no recents
  }
}

/** Keeps only the recent IDs that exist in `listIds`, preserving recent order. */
export function filterRecent(recentIds: readonly string[], listIds: readonly string[]): string[] {
  const present = new Set(listIds);
  return dedupeCap(recentIds.filter((id) => present.has(id)));
}

export function getLastAccount(): string | null {
  try {
    const storage = getStorage();
    if (!storage) return null;
    const raw = storage.getItem(LAST_ACCOUNT_KEY);
    return raw ? toId(raw) : null;
  } catch {
    return null;
  }
}

export function setLastAccount(id: string | number): void {
  try {
    const storage = getStorage();
    if (!storage) return;
    const next = toId(id);
    if (next === null) return;
    storage.setItem(LAST_ACCOUNT_KEY, next);
  } catch {
    // ignore
  }
}
