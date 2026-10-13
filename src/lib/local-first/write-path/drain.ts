/**
 * Outbox drain (local-first L3): sends queued writes to each entity's server endpoints through its adapter (./entities).
 *
 * - Every mutating request carries `Idempotency-Key: <opId>`. Transactions: POST /api/transactions honours it (unique per
 *   user+key). Budgets: POST /api/budgets honours it through withIdempotency (request_idempotency table). PUT and DELETE
 *   do not need it (idempotent by nature). The client-side adopt step below stays as a belt-and-braces check for
 *   transaction creates (older servers, a key that was never stored): look for a row created after the first send with
 *   identical fields; if found, adopt it instead of POSTing again. Budget creates have no lookup: the POST is an upsert
 *   keyed by (user, category, month), so a re-send cannot make a second row.
 * - Deletes: fetch the server row; gone already (or DELETE 404) = success; changed since the baseline (updatedAt, else
 *   the field values) = failed 'Row changed on the server', never deleted silently; else DELETE.
 * - Edits: fetch the server row, resolve per field by HLC last-writer-wins (conflict.ts), send the winners through the
 *   adapter's edit request.
 * - Backoff: transient failure (network, 408, 429, 5xx) -> exponential, capped, jittered. 401/403/423 (signed out or
 *   locked) pauses the whole drain without counting an attempt. Other 4xx -> entry marked failed, never retried.
 * - A transient failure holds back later entries for the same row (order), other rows continue.
 * - An entry whose entity has no adapter is marked failed ('unknown entity'), never sent.
 * - Single-flight per drain function instance.
 */
import type { LocalRow, LocalStore } from "../store/types";
import { resolveEdit, type ServerTx } from "./conflict";
import { adapterFor, entityOf } from "./entities";
import type { OutboxStore } from "./outbox-store";
import type { EntityAdapter, EntityFields, FieldValue, OutboxEntry } from "./types";

export interface FetchInit {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}
export interface DrainResponse {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}
export type DrainFetch = (url: string, init?: FetchInit) => Promise<DrainResponse>;

export const BACKOFF_BASE_MS = 2_000;
export const BACKOFF_MAX_MS = 15 * 60_000;
export const MAX_ATTEMPTS = 12;

export interface DrainDeps {
  store: OutboxStore;
  fetchImpl: DrainFetch;
  /** Local store used to mirror synced rows (only entities with a cache table touch it). */
  cache?: Pick<LocalStore, "upsertRows" | "deleteRows">;
  now?: () => number;
  /** 0..1, injected for tests. */
  random?: () => number;
  allow?: () => boolean;
  /** Called with a server row's fields after a create/edit succeeded (to refresh other views). */
  onSynced?: (entry: OutboxEntry, serverId: number) => void;
  /** Fields that lost to a concurrent server change, with the server's values. Caller re-hydrates the row. */
  onConflict?: (entry: OutboxEntry, lost: string[], server: EntityFields) => void;
}

export interface DrainReport {
  sent: number;
  adopted: number;
  failed: number;
  retryLater: number;
  paused: boolean;
  /** Fields that lost to a concurrent server change, by opId. */
  lost: Record<string, string[]>;
  skipped: boolean;
}

export function backoffMs(attempts: number, random: number = Math.random()): number {
  const exp = Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** Math.max(0, attempts - 1));
  return Math.round(exp * (0.5 + random / 2));
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

async function readJson(r: DrainResponse): Promise<unknown> {
  try {
    return await r.json();
  } catch {
    return null;
  }
}

const headers = (opId: string): Record<string, string> => ({ "Content-Type": "application/json", "Idempotency-Key": opId });
const eq = (a: FieldValue | undefined, b: FieldValue | undefined): boolean => (a ?? null) === (b ?? null);

/** Message shown on a queued delete that was not sent because the row was edited on the server meanwhile. */
export const ROW_CHANGED_REASON = "Row changed on the server";

class Pause extends Error {}
class Transient extends Error {
  constructor(readonly status: number | null) {
    super(`transient ${status ?? "network"}`);
  }
}
class Permanent extends Error {
  constructor(message: string, readonly status: number | null = null) {
    super(message);
  }
}

function classify(status: number): "pause" | "transient" | "permanent" {
  if (status === 401 || status === 403 || status === 423) return "pause";
  if (status === 408 || status === 429 || status >= 500) return "transient";
  return "permanent";
}

async function call(f: DrainFetch, url: string, init?: FetchInit): Promise<DrainResponse> {
  let r: DrainResponse;
  try {
    r = await f(url, init);
  } catch {
    throw new Transient(null);
  }
  if (r.ok) return r;
  const c = classify(r.status);
  if (c === "pause") throw new Pause();
  if (c === "transient") throw new Transient(r.status);
  throw new Permanent(`http ${r.status}`, r.status);
}

/** Finds a row a lost-response create may have made: made after the first send, identical fields. Adapters without a lookup return null. */
async function findCreated(e: OutboxEntry, adapter: EntityAdapter, fetchImpl: DrainFetch): Promise<number | null> {
  if (e.firstSendAt === null || !adapter.lostCreateLookup || !adapter.matchesLostCreate) return null;
  const url = adapter.lostCreateLookup(e);
  if (url === null) return null;
  const r = await call(fetchImpl, url);
  const since = e.firstSendAt - 60_000;
  for (const row of adapter.rowsOf(await readJson(r))) {
    if (!adapter.matchesLostCreate(row, e, since)) continue;
    const id = adapter.idOf(row);
    if (id !== null) return id;
  }
  return null;
}

async function fetchServerRow(adapter: EntityAdapter, e: OutboxEntry, fetchImpl: DrainFetch, serverId: number, needUpdatedAt = true): Promise<(ServerTx & { updatedAt: string | null }) | null> {
  const req = adapter.fetchRequest(serverId, e);
  const r = await call(fetchImpl, req.url);
  const row = adapter.rowsOf(await readJson(r)).find((x) => adapter.idOf(x) === serverId);
  if (!row) return null;
  const updatedAt = adapter.updatedAtOf(row);
  const ms = updatedAt !== null ? Date.parse(updatedAt) : NaN;
  if (!Number.isFinite(ms) && needUpdatedAt) throw new Permanent("server row has no updatedAt");
  return { fields: adapter.fieldsOf(row), updatedAtMs: ms, updatedAt };
}

/** True when the server row differs from what the user saw when deleting (never delete silently over a newer edit). */
function changedSinceBaseline(e: OutboxEntry, row: ServerTx & { updatedAt: string | null }): boolean {
  if (e.baseUpdatedAt) {
    const baseMs = Date.parse(e.baseUpdatedAt);
    if (Number.isFinite(baseMs) && Number.isFinite(row.updatedAtMs)) return baseMs !== row.updatedAtMs;
  }
  return Object.keys(e.base).some((f) => !eq(row.fields[f], e.base[f]));
}

/** Builds a drain function. It is single-flight: a call while one runs returns that run's promise. */
export function createDrain(deps: DrainDeps): () => Promise<DrainReport> {
  const now = deps.now ?? Date.now;
  const random = deps.random ?? Math.random;
  let running: Promise<DrainReport> | null = null;

  async function swapCache(adapter: EntityAdapter, e: OutboxEntry, serverId: number): Promise<void> {
    if (!deps.cache || !adapter.cacheTable) return;
    if (e.kind === "delete") {
      await deps.cache.deleteRows(adapter.cacheTable, [e.rowId]);
      return;
    }
    if (e.kind === "create") {
      await deps.cache.deleteRows(adapter.cacheTable, [e.rowId]);
      await deps.cache.upsertRows(adapter.cacheTable, [adapter.rowFromEntry({ ...e, rowId: String(serverId), serverId }) as LocalRow]);
    }
  }

  async function sendOne(e: OutboxEntry, adapter: EntityAdapter, report: DrainReport): Promise<void> {
    if (e.kind === "create") {
      if (e.attempts > 0 && e.firstSendAt !== null) {
        const found = await findCreated(e, adapter, deps.fetchImpl);
        if (found !== null) {
          report.adopted++;
          await swapCache(adapter, e, found);
          await deps.store.remove(e.opId);
          deps.onSynced?.(e, found);
          return;
        }
      }
      if (e.firstSendAt === null) {
        e.firstSendAt = now();
        await deps.store.put(e); // persisted BEFORE the send: after a crash we know a send may have happened
      }
      const r = await call(deps.fetchImpl, adapter.basePath, { method: "POST", headers: headers(e.opId), body: JSON.stringify(adapter.serialize(e.fields)) });
      const body = await readJson(r);
      // Server responses come back as the row, or wrapped as { data: row }.
      const id = isObj(body) ? (adapter.idOf(body) ?? (isObj(body.data) ? adapter.idOf(body.data) : null)) : null;
      report.sent++;
      if (id !== null) await swapCache(adapter, e, id);
      await deps.store.remove(e.opId);
      if (id !== null) deps.onSynced?.(e, id);
      return;
    }
    if (e.kind === "delete") {
      const id = e.serverId as number;
      const row = await fetchServerRow(adapter, e, deps.fetchImpl, id, false);
      // Already gone (deleted elsewhere): the goal is met. Same for a 404 on the DELETE below.
      let gone = row === null;
      if (row) {
        if (changedSinceBaseline(e, row)) throw new Permanent(ROW_CHANGED_REASON);
        try {
          await call(deps.fetchImpl, `${adapter.basePath}?id=${id}`, { method: "DELETE", headers: headers(e.opId) });
          report.sent++;
        } catch (err) {
          if (!(err instanceof Permanent && err.status === 404)) throw err;
          gone = true;
        }
      }
      if (gone) report.adopted++;
      await swapCache(adapter, e, id);
      await deps.store.remove(e.opId);
      deps.onSynced?.(e, id);
      return;
    }
    // edit
    const serverId = e.serverId as number;
    const server = await fetchServerRow(adapter, e, deps.fetchImpl, serverId);
    if (!server) throw new Permanent("row no longer exists on the server");
    const res = resolveEdit(e, server);
    if (res.lost.length > 0) report.lost[e.opId] = res.lost;
    if (Object.keys(res.send).length > 0) {
      const req = adapter.editRequest(serverId, e, res.send, server.fields);
      await call(deps.fetchImpl, req.url, { method: req.method, headers: headers(e.opId), body: JSON.stringify(req.body) });
      report.sent++;
    }
    // Server is the source of truth: the cache still shows our optimistic value for lost fields, so tell the caller to re-read.
    if (res.lost.length > 0) deps.onConflict?.(e, res.lost, server.fields);
    await deps.store.remove(e.opId);
    deps.onSynced?.(e, serverId);
  }

  async function run(): Promise<DrainReport> {
    const report: DrainReport = { sent: 0, adopted: 0, failed: 0, retryLater: 0, paused: false, lost: {}, skipped: false };
    if (deps.allow && !deps.allow()) return { ...report, skipped: true };
    const blockedRows = new Set<string>();
    for (const e of await deps.store.list()) {
      if (deps.allow && !deps.allow()) {
        report.skipped = true;
        break;
      }
      if (e.status !== "pending" || e.nextAttemptAt > now() || blockedRows.has(e.rowId)) {
        if (e.status === "pending") blockedRows.add(e.rowId);
        continue;
      }
      const adapter = adapterFor(entityOf(e));
      if (!adapter) {
        e.status = "failed";
        e.failReason = "unknown entity";
        report.failed++;
        await deps.store.put(e);
        continue;
      }
      try {
        await sendOne(e, adapter, report);
      } catch (err) {
        if (err instanceof Pause) {
          report.paused = true;
          break;
        }
        if (err instanceof Transient) {
          e.attempts++;
          if (e.attempts >= MAX_ATTEMPTS) {
            e.status = "failed";
            e.failReason = "too many attempts";
            report.failed++;
          } else {
            e.nextAttemptAt = now() + backoffMs(e.attempts, random());
            report.retryLater++;
          }
          blockedRows.add(e.rowId);
          await deps.store.put(e);
          continue;
        }
        e.status = "failed";
        e.failReason = err instanceof Permanent ? err.message : "unexpected error";
        report.failed++;
        await deps.store.put(e);
      }
    }
    return report;
  }

  return () => {
    if (running) return running;
    running = run().finally(() => {
      running = null;
    });
    return running;
  };
}
