/**
 * Outbox drain (local-first L3): POST/PUT queued transaction writes to the existing /api/transactions endpoints.
 *
 * - Every request carries `Idempotency-Key: <opId>`. POST /api/transactions honours it (unique per user+key; a replay
 *   returns the existing row, no second insert), so a re-sent create whose response was lost cannot duplicate. The
 *   client-side adopt step below stays as a belt-and-braces check (older servers, a key that was never stored): look
 *   for a row created after the first send with identical fields; if found, adopt it instead of POSTing again.
 *   PUT does not use the key (an edit PUT is already idempotent: same fields, same result).
 * - Edits: fetch the server row (GET ?id=), resolve per field by HLC last-writer-wins (conflict.ts), PUT only the winners.
 * - Backoff: transient failure (network, 408, 429, 5xx) -> exponential, capped, jittered. 401/403/423 (signed out or
 *   locked) pauses the whole drain without counting an attempt. Other 4xx -> entry marked failed, never retried.
 * - A transient failure holds back later entries for the same row (order), other rows continue.
 * - Single-flight per drain function instance.
 */
import type { LocalStore } from "../store/types";
import { resolveEdit, type ServerTx } from "./conflict";
import type { OutboxStore } from "./outbox-store";
import { rowFromEntry } from "./queue";
import { EDITABLE_FIELDS, type EditableField, type FieldValue, type OutboxEntry, type TxFields } from "./types";

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
  cache?: Pick<LocalStore, "upsertRows" | "deleteRows">;
  now?: () => number;
  /** 0..1, injected for tests. */
  random?: () => number;
  allow?: () => boolean;
  /** Called with a server row's fields after a create/edit succeeded (to refresh other views). */
  onSynced?: (entry: OutboxEntry, serverId: number) => void;
  /** Fields that lost to a concurrent server change, with the server's values. Caller re-hydrates the row. */
  onConflict?: (entry: OutboxEntry, lost: EditableField[], server: TxFields) => void;
}

export interface DrainReport {
  sent: number;
  adopted: number;
  failed: number;
  retryLater: number;
  paused: boolean;
  /** Fields that lost to a concurrent server change, by opId. */
  lost: Record<string, EditableField[]>;
  skipped: boolean;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

export function backoffMs(attempts: number, random: number = Math.random()): number {
  const exp = Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** Math.max(0, attempts - 1));
  return Math.round(exp * (0.5 + random / 2));
}

function toFields(raw: Record<string, unknown>): TxFields {
  const out: TxFields = {};
  for (const f of EDITABLE_FIELDS) {
    if (!(f in raw)) continue;
    const v = raw[f];
    out[f] = v === undefined || v === null ? null : typeof v === "number" ? v : String(v);
  }
  return out;
}

function unwrapRows(body: unknown): Record<string, unknown>[] {
  let b = body;
  if (isObj(b) && "success" in b && "data" in b) b = b.data;
  if (isObj(b) && Array.isArray(b.data)) b = b.data;
  return Array.isArray(b) ? b.filter(isObj) : [];
}

const headers = (opId: string): Record<string, string> => ({ "Content-Type": "application/json", "Idempotency-Key": opId });
const eq = (a: FieldValue | undefined, b: FieldValue | undefined): boolean => (a ?? null) === (b ?? null);

class Pause extends Error {}
class Transient extends Error {
  constructor(readonly status: number | null) {
    super(`transient ${status ?? "network"}`);
  }
}
class Permanent extends Error {}

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
  throw new Permanent(`http ${r.status}`);
}

async function readJson(r: DrainResponse): Promise<unknown> {
  try {
    return await r.json();
  } catch {
    return null;
  }
}

/** Finds a row the lost-response POST may have created: made after the first send, identical fields. */
async function findCreated(deps: DrainDeps, e: OutboxEntry, fetchImpl: DrainFetch): Promise<number | null> {
  if (e.firstSendAt === null || typeof e.fields.date !== "string") return null;
  const r = await call(fetchImpl, `/api/transactions?startDate=${e.fields.date}&endDate=${e.fields.date}&limit=200`);
  const since = e.firstSendAt - 60_000;
  for (const row of unwrapRows(await readJson(r))) {
    const created = typeof row.createdAt === "string" ? Date.parse(row.createdAt) : NaN;
    if (!(created >= since) || typeof row.id !== "number") continue;
    const got = toFields(row);
    const same = (Object.keys(e.fields) as EditableField[]).every((k) => eq(got[k], e.fields[k]));
    if (same) return row.id;
  }
  return null;
}

async function fetchServerTx(fetchImpl: DrainFetch, serverId: number): Promise<ServerTx | null> {
  const r = await call(fetchImpl, `/api/transactions?id=${serverId}`);
  const row = unwrapRows(await readJson(r)).find((x) => x.id === serverId);
  if (!row) return null;
  const ms = typeof row.updatedAt === "string" ? Date.parse(row.updatedAt) : NaN;
  if (!Number.isFinite(ms)) throw new Permanent("server row has no updatedAt");
  return { fields: toFields(row), updatedAtMs: ms };
}

/** Builds a drain function. It is single-flight: a call while one runs returns that run's promise. */
export function createDrain(deps: DrainDeps): () => Promise<DrainReport> {
  const now = deps.now ?? Date.now;
  const random = deps.random ?? Math.random;
  let running: Promise<DrainReport> | null = null;

  async function swapCache(e: OutboxEntry, serverId: number): Promise<void> {
    if (!deps.cache) return;
    if (e.kind === "create") {
      await deps.cache.deleteRows("transactions", [e.rowId]);
      await deps.cache.upsertRows("transactions", [rowFromEntry({ ...e, rowId: String(serverId), serverId })]);
    }
  }

  async function sendOne(e: OutboxEntry, report: DrainReport): Promise<void> {
    if (e.kind === "create") {
      if (e.attempts > 0 && e.firstSendAt !== null) {
        const found = await findCreated(deps, e, deps.fetchImpl);
        if (found !== null) {
          report.adopted++;
          await swapCache(e, found);
          await deps.store.remove(e.opId);
          deps.onSynced?.(e, found);
          return;
        }
      }
      if (e.firstSendAt === null) {
        e.firstSendAt = now();
        await deps.store.put(e); // persisted BEFORE the send: after a crash we know a send may have happened
      }
      const r = await call(deps.fetchImpl, "/api/transactions", { method: "POST", headers: headers(e.opId), body: JSON.stringify(e.fields) });
      const body = await readJson(r);
      const id = isObj(body) && typeof body.id === "number" ? body.id : isObj(body) && isObj(body.data) && typeof body.data.id === "number" ? body.data.id : null;
      report.sent++;
      if (id !== null) await swapCache(e, id);
      await deps.store.remove(e.opId);
      if (id !== null) deps.onSynced?.(e, id);
      return;
    }
    // edit
    const serverId = e.serverId as number;
    const server = await fetchServerTx(deps.fetchImpl, serverId);
    if (!server) throw new Permanent("row no longer exists on the server");
    const res = resolveEdit(e, server);
    if (res.lost.length > 0) report.lost[e.opId] = res.lost;
    if (Object.keys(res.send).length > 0) {
      await call(deps.fetchImpl, "/api/transactions", { method: "PUT", headers: headers(e.opId), body: JSON.stringify({ id: serverId, ...res.send }) });
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
      try {
        await sendOne(e, report);
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
