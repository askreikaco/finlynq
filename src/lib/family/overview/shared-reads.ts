/**
 * Short-lived, in-process sharing of the overview's heavy, period-independent reads
 * (account balances, investment + cash snapshot history) per owner.
 *
 * The /family page fires two overview requests at once (the selected range and "all"
 * for the lifetime charts), and each member section used to run the same queries —
 * ~20k snapshot rows read twice concurrently on a small box. Concurrent / back-to-back
 * builds now share ONE in-flight promise per (read, owner, day).
 *
 * Freshness: an entry is reused for at most 60s; a Refresh (?refresh=1) only reuses an
 * entry started within the last 5s (i.e. its sibling request), so a manual refresh always
 * reads current data. Failed reads are dropped immediately. Production only — tests mock
 * the query layer per test and must never see a previous test's rows.
 */
type Entry = { at: number; promise: Promise<unknown> };

const MAX_AGE_MS = 60_000;
const REFRESH_MAX_AGE_MS = 5_000;
const entries = new Map<string, Entry>();

export function sharedReadsEnabled(): boolean {
  return process.env.NODE_ENV === "production" && process.env.FAMILY_OVERVIEW_CACHE !== "off";
}

export function sharedRead<T>(
  kind: string,
  ownerId: string,
  today: string,
  opts: { refresh?: boolean },
  load: () => Promise<T>,
): Promise<T> {
  if (!sharedReadsEnabled()) return load();
  const now = Date.now();
  // prune expired entries so memory stays bounded
  for (const [k, e] of entries) if (now - e.at > MAX_AGE_MS) entries.delete(k);

  const key = `${kind}:${ownerId}:${today}`;
  const hit = entries.get(key);
  const maxAge = opts.refresh ? REFRESH_MAX_AGE_MS : MAX_AGE_MS;
  if (hit && now - hit.at <= maxAge) return hit.promise as Promise<T>;

  const promise = load();
  entries.set(key, { at: now, promise });
  promise.catch(() => {
    if (entries.get(key)?.promise === promise) entries.delete(key);
  });
  return promise;
}

/** Test helper. */
export function clearSharedReads(): void {
  entries.clear();
}
