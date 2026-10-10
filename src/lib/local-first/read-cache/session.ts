/**
 * Per-page-load session for the in-memory read cache (local-first L2a, persistence L2b). Not React.
 * One memory-only PGlite store per page load and owner (user), hydrated once, single-flight on refresh.
 *
 * Persistence (L2b) runs only when the caller passes `persist`. Then, at the first hydrate of a session:
 *   1. seed the store from the encrypted on-device snapshot (if allowed and still valid),
 *      and call onSnapshot so the caller can paint at once,
 *   2. hydrate from the APIs,
 *   3. after a successful hydrate, save the snapshot (trailing debounce, one save per hydrate).
 * Every IndexedDB touch is gated by persist.allowPersist(), checked live at each step.
 */
import type { AccountRow, BalanceRow, CategoryRow, LocalRow, LocalStore, TableName, TransactionRow } from "../store/types";
import { hydrateFromApi, type FetchLike, type HydrateResult, type UpsertStore } from "./hydrate";
import { loadSnapshot, saveSnapshot, snapshotAgeMs, wipeUser } from "./persist-store";
import type { SnapshotRows, SnapshotTable } from "./snapshot-codec";
import { SNAPSHOT_TABLES } from "./snapshot-codec";

/** Bumped when the snapshot row shape changes. A mismatch wipes the snapshot (decode fails). */
export const READ_CACHE_SCHEMA_VER = 1;
/**
 * Mirrors the server default of PF_TRUSTED_DEVICE_DAYS (src/lib/auth/trusted-device.ts). The server env
 * is not visible to client code, so this constant must be kept in step with that default by hand.
 */
export const TRUSTED_DEVICE_DAYS = 30;
export const TRUSTED_DEVICE_LIFETIME_MS = TRUSTED_DEVICE_DAYS * 24 * 60 * 60 * 1000;
export const SNAPSHOT_SAVE_DEBOUNCE_MS = 5_000;

export interface SnapshotPersistDeps {
  userId: string;
  deviceId: string;
  build: string;
  schemaVer?: number;
  /** Live check: opted in AND trusted AND unlocked. Read at every seed and every save, never cached. */
  allowPersist: () => boolean;
  debounceMs?: number;
  /** Snapshots older than this are wiped instead of seeded. Defaults to the trusted-device lifetime. */
  maxAgeMs?: number;
  now?: () => number;
}

export interface ReadCacheDeps {
  createStore: () => Promise<LocalStore>;
  fetchImpl: FetchLike;
  persist?: SnapshotPersistDeps;
}

export interface HydrateOpts {
  force?: boolean;
  /** Called once, after the snapshot is in the store and before the network hydrate. Not called when there is no usable snapshot. */
  onSnapshot?: () => void;
}

/** Opens a PGlite store on memory:// only. PGlite is loaded lazily, so it is not in the bundle path while off. */
export async function createMemoryStore(): Promise<LocalStore> {
  const { PgliteStore } = await import("../store/pglite-store");
  const store = new PgliteStore({ backend: "memory" });
  await store.open();
  return store;
}

type RowBuckets = { [T in SnapshotTable]: Map<string, LocalRow> };

interface Session {
  owner: string | null;
  store: LocalStore;
  hydrated: HydrateResult | null;
  inFlight: Promise<HydrateResult> | null;
  seeded: boolean;
  /** Every row upserted this session, by table and id. Only kept when persist is set; it is the save source. */
  rows: RowBuckets | null;
  saveTimer: ReturnType<typeof setTimeout> | null;
  disposed: boolean;
}

let current: Promise<Session> | null = null;
let currentOwner: string | null = null;

function emptyBuckets(): RowBuckets {
  return { accounts: new Map(), categories: new Map(), transactions: new Map() };
}

function isSnapshotTable(table: TableName): table is SnapshotTable {
  return (SNAPSHOT_TABLES as readonly string[]).includes(table);
}

function getSession(deps: ReadCacheDeps): Promise<Session> {
  const owner = deps.persist?.userId ?? null;
  // Another owner (account switch): drop the previous memory store. Its data is never shared with the new owner.
  if (current && currentOwner !== owner) void disposeReadCache();
  if (!current) {
    currentOwner = owner;
    const created = deps.createStore().then((store) => ({
      owner,
      store,
      hydrated: null,
      inFlight: null,
      seeded: false,
      rows: deps.persist ? emptyBuckets() : null,
      saveTimer: null,
      disposed: false,
    }));
    current = created;
    // A failed open must not poison the page: the next call tries again.
    created.catch(() => {
      if (current === created) {
        current = null;
        currentOwner = null;
      }
    });
  }
  return current;
}

/** Writes into the store and, when persisting, into the save source. */
function recordingStore(s: Session): UpsertStore {
  return {
    upsertRows: async (table: TableName, rows: LocalRow[]) => {
      await s.store.upsertRows(table, rows);
      if (s.rows && isSnapshotTable(table)) {
        const bucket = s.rows[table];
        for (const r of rows) bucket.set(r.id, r);
      }
    },
  };
}

async function seedFromSnapshot(p: SnapshotPersistDeps, s: Session): Promise<boolean> {
  const now = p.now ?? Date.now;
  const ctx = { build: p.build, schemaVer: p.schemaVer ?? READ_CACHE_SCHEMA_VER };
  try {
    const age = await snapshotAgeMs(p.userId, now());
    if (age !== null && age > (p.maxAgeMs ?? TRUSTED_DEVICE_LIFETIME_MS)) {
      await wipeUser(p.userId).catch(() => undefined);
      return false;
    }
    if (!p.allowPersist()) return false;
    const rows: SnapshotRows | null = await loadSnapshot(p.userId, p.deviceId, ctx);
    if (!rows || !p.allowPersist()) return false;
    const sink = recordingStore(s);
    for (const table of SNAPSHOT_TABLES) await sink.upsertRows(table, rows[table] as LocalRow[]);
    return true;
  } catch (err) {
    console.warn("[local-first] snapshot seed skipped", err);
    return false;
  }
}

async function saveNow(p: SnapshotPersistDeps, s: Session): Promise<void> {
  if (s.disposed || !s.rows || !p.allowPersist()) return;
  const r = s.rows;
  const rows: SnapshotRows = {
    accounts: [...r.accounts.values()] as AccountRow[],
    categories: [...r.categories.values()] as CategoryRow[],
    transactions: [...r.transactions.values()] as TransactionRow[],
  };
  try {
    await saveSnapshot(p.userId, p.deviceId, rows, { build: p.build, schemaVer: p.schemaVer ?? READ_CACHE_SCHEMA_VER, now: p.now });
    // Lock or opt-out may land while the write is in flight: remove what was just written.
    if (!p.allowPersist()) await wipeUser(p.userId).catch(() => undefined);
  } catch (err) {
    console.warn("[local-first] snapshot save failed", err);
  }
}

function scheduleSave(p: SnapshotPersistDeps, s: Session): void {
  if (s.saveTimer !== null) clearTimeout(s.saveTimer);
  s.saveTimer = setTimeout(() => {
    s.saveTimer = null;
    void saveNow(p, s);
  }, p.debounceMs ?? SNAPSHOT_SAVE_DEBOUNCE_MS);
}

async function runHydrate(deps: ReadCacheDeps, s: Session, opts: HydrateOpts): Promise<HydrateResult> {
  const p = deps.persist;
  if (p && !s.seeded) {
    s.seeded = true;
    if (p.allowPersist() && (await seedFromSnapshot(p, s))) opts.onSnapshot?.();
  }
  const result = await hydrateFromApi(deps.fetchImpl, p ? recordingStore(s) : s.store);
  if (p) scheduleSave(p, s);
  return result;
}

/**
 * Hydrates the store once per page load. Concurrent calls share one request chain.
 * force=true re-reads the APIs (upserts over the existing rows).
 */
export async function hydrateReadCache(deps: ReadCacheDeps, opts: HydrateOpts = {}): Promise<HydrateResult> {
  const s = await getSession(deps);
  if (s.inFlight) return s.inFlight;
  if (s.hydrated && !opts.force) return s.hydrated;
  s.inFlight = runHydrate(deps, s, opts)
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

/** Closes the store, cancels a pending save and drops the data from memory. Safe when nothing is open. */
export async function disposeReadCache(): Promise<void> {
  const pending = current;
  current = null;
  currentOwner = null;
  if (!pending) return;
  let s: Session;
  try {
    s = await pending;
  } catch {
    return; // the open never finished: nothing to release
  }
  s.disposed = true;
  s.rows = null;
  if (s.saveTimer !== null) clearTimeout(s.saveTimer);
  s.saveTimer = null;
  try {
    await s.store.close();
  } catch {
    // already closed
  }
}
