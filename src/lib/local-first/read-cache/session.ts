/**
 * Per-page-load session for the in-memory read cache (local-first L2a). Not React.
 * One memory-only PGlite store per page load, hydrated once, single-flight on refresh.
 * Nothing here touches IndexedDB, OPFS or localStorage: the data lives only in this JS heap.
 */
import type { BalanceRow, LocalStore } from "../store/types";
import { hydrateFromApi, type FetchLike, type HydrateResult } from "./hydrate";

export interface ReadCacheDeps {
  createStore: () => Promise<LocalStore>;
  fetchImpl: FetchLike;
}

/** Opens a PGlite store on memory:// only. PGlite is loaded lazily, so it is not in the bundle path while off. */
export async function createMemoryStore(): Promise<LocalStore> {
  const { PgliteStore } = await import("../store/pglite-store");
  const store = new PgliteStore({ backend: "memory" });
  await store.open();
  return store;
}

interface Session {
  store: LocalStore;
  hydrated: HydrateResult | null;
  inFlight: Promise<HydrateResult> | null;
}

let current: Promise<Session> | null = null;

function getSession(deps: ReadCacheDeps): Promise<Session> {
  if (!current) {
    current = deps.createStore().then((store) => ({ store, hydrated: null, inFlight: null }));
    // A failed open must not poison the page: the next call tries again.
    current.catch(() => {
      current = null;
    });
  }
  return current;
}

/**
 * Hydrates the store once per page load. Concurrent calls share one request chain.
 * force=true re-reads the APIs (upserts over the existing rows).
 */
export async function hydrateReadCache(deps: ReadCacheDeps, opts: { force?: boolean } = {}): Promise<HydrateResult> {
  const s = await getSession(deps);
  if (s.inFlight) return s.inFlight;
  if (s.hydrated && !opts.force) return s.hydrated;
  s.inFlight = hydrateFromApi(deps.fetchImpl, s.store)
    .then((r) => {
      s.hydrated = r;
      return r;
    })
    .finally(() => {
      s.inFlight = null;
    });
  return s.inFlight;
}

/** Account balances from the local store. Archived and invisible accounts are excluded, as the server default does. */
export async function readLocalBalances(deps: ReadCacheDeps): Promise<BalanceRow[]> {
  const s = await getSession(deps);
  return s.store.accountBalances({ includeArchived: false, includeInvisible: false });
}

/** Closes the store and drops the data from memory. Safe when nothing is open. */
export async function disposeReadCache(): Promise<void> {
  const pending = current;
  current = null;
  if (!pending) return;
  try {
    const s = await pending;
    await s.store.close();
  } catch {
    // Nothing to release if the open never finished.
  }
}
