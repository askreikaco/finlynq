"use client";
/**
 * App-side facade for the opt-in offline write queue (local-first L3). Default OFF.
 *
 * Lives under src/lib/data (not src/components or src/app) so app code never names the local-first package
 * directly (tests/local-first/inventory-absence.test.ts), like local-read-cache-wipe.ts.
 *
 * With the flag off (finlynq.lf.write != "1", or no read-cache opt-in) every export is an inert no-op:
 * nothing is created, IndexedDB is never opened and queueOffline* return false.
 * start/stop are driven by DataProvider (trusted + unlocked) and by the wipe triggers in local-read-cache-wipe.ts.
 */
import { useEffect, useRef, useState } from "react";
import { createWriteQueue, type WriteQueue } from "@/lib/local-first/write-path/queue";
import { createDrain } from "@/lib/local-first/write-path/drain";
import { createDrainScheduler, type DrainScheduler } from "@/lib/local-first/write-path/scheduler";
import { isLocalWriteQueueEnabled, setLocalWriteQueueEnabled } from "@/lib/local-first/write-path/flag";
import { setLocalReadCacheEnabled } from "@/lib/local-first/read-cache/optin";
import { deviceKeys, type DeviceKeyMeta } from "@/lib/local-first/crypto/device-key-provider";
import { maybeAutoRotateKeys, rotateOnDeviceKeys, type RotationReport } from "@/lib/local-first/crypto/rotation";
import { wipeUser as wipePersistedDataCache } from "./persist";
import { forgetOfflineIdentity, rememberOfflineIdentity } from "./offline-identity";
import { fetchTrustedDeviceId } from "./trusted-device";
import { getSessionInfo } from "./session-info";
import { entityOf } from "@/lib/local-first/write-path/entities";
import type { EntityKind, OutboxEntry, TxFields } from "@/lib/local-first/write-path/types";
import { EMPTY_PENDING_BUDGETS, isPendingBudgetsEmpty, toPendingBudgetView, type PendingBudgetView } from "@/lib/budgets/pending-overlay";
import { EMPTY_ENTITY_VIEW, isEntityViewEmpty, toEntityPendingView, type EntityPendingView } from "@/lib/local-first/write-path/entity-view";

/** Re-exported for UI lists (UI code reaches the outbox only through this facade). */
export { overlayRows } from "@/lib/local-first/write-path/entity-view";
import type { TransactionRow } from "@/lib/local-first/store/types";
import { EMPTY_PENDING, type PendingFields, type PendingTxView } from "@/lib/transactions/pending-overlay";

interface Running {
  userId: string;
  queue: WriteQueue;
  scheduler: DrainScheduler;
}

let running: Running | null = null;
let unlocked = true;
let onSynced: (() => void) | null = null;
const listeners = new Set<() => void>();
const notify = () => {
  for (const l of listeners) l();
};

/** Called by a mounted component (inside SWRConfig) to refresh lists after queued writes reach the server. */
export function setLocalWriteSyncedHandler(fn: (() => void) | null): void {
  onSynced = fn;
}

/** Starts the queue + drain scheduler for a trusted, unlocked device. No-op (and no IndexedDB) while the flag is off. */
export function startLocalWriteQueue(userId: string, deviceId: string): boolean {
  if (!isLocalWriteQueueEnabled()) return false;
  if (running && running.userId === userId) return true;
  stopLocalWriteQueue();
  try {
    unlocked = true;
    const allow = () => unlocked && isLocalWriteQueueEnabled();
    const queue = createWriteQueue({ userId, deviceId, allow });
    const drainOnce = createDrain({
      store: queue.store,
      allow,
      fetchImpl: (url, init) => fetch(url, { credentials: "same-origin", ...init }),
      onSynced: () => {
        notify();
        onSynced?.();
      },
      onConflict: () => onSynced?.(),
    });
    // Every run can change an entry's state (failed, backoff): tell the live views, not only when something synced.
    const drain = async () => {
      try {
        return await drainOnce();
      } finally {
        notify();
      }
    };
    const scheduler = createDrainScheduler({ drain, list: () => queue.store.list(), allow });
    running = { userId, queue, scheduler };
    scheduler.start();
    // Key hygiene: a key older than 90 days (or of unknown age) rotates by itself, only when nothing is queued.
    void maybeAutoRotateKeys(userId, { outbox: queue.store, clearDataCache: wipePersistedDataCache })
      .then((r) => r && notify())
      .catch((err) => console.warn("[local-first] automatic key rotation skipped", err));
    notify();
    return true;
  } catch (err) {
    console.warn("[local-first] write queue unavailable", err);
    running = null;
    return false;
  }
}

/** Stops the scheduler (lock, logout, untrusted device). Does not delete the outbox: the wipe triggers do that. */
export function stopLocalWriteQueue(): void {
  unlocked = false;
  running?.scheduler.stop();
  running = null;
  notify();
}

/** The opt-in flag alone (the queue may still be starting). */
export function isLocalWriteQueueOn(): boolean {
  return isLocalWriteQueueEnabled();
}

export function isLocalWriteQueueActive(): boolean {
  return running !== null && isLocalWriteQueueEnabled();
}

async function enqueue(fn: (q: WriteQueue) => Promise<OutboxEntry | null>): Promise<boolean> {
  const r = running;
  if (!r || !isLocalWriteQueueEnabled()) return false;
  try {
    const entry = await fn(r.queue);
    if (!entry) return false;
    notify();
    void r.scheduler.kick();
    return true;
  } catch (err) {
    console.warn("[local-first] enqueue failed", err);
    return false;
  }
}

/** Queues a create. False = not queued (flag off, queue not running, or error): the caller keeps its normal error path. */
export function queueOfflineCreate(fields: TxFields): Promise<boolean> {
  return enqueue((q) => q.enqueueCreate(fields));
}

/** Queues an edit of server row `serverId`. `current` = the server values the form was opened with (conflict baseline). */
export function queueOfflineEdit(serverId: number, patch: TxFields, current: Record<string, unknown>): Promise<boolean> {
  return enqueue((q) => q.enqueueEdit(serverId, patch, { id: String(serverId), serverId, ...current } as unknown as TransactionRow));
}

/**
 * Queues a delete of server row `serverId` (the DELETE request failed with a network error). `current` = the row as the
 * list shows it, with `updatedAt`: the baseline the drain compares against so a newer server edit is never deleted over.
 */
export function queueOfflineDelete(serverId: number, current: Record<string, unknown>): Promise<boolean> {
  return enqueue((q) => q.enqueueDelete(serverId, { id: String(serverId), serverId, ...current } as unknown as TransactionRow & { updatedAt?: string | null }));
}

/** Deletes a queued create that never synced: just drops the outbox entry. False = nothing dropped (a send may be in flight). */
export async function discardQueuedCreate(opId: string): Promise<boolean> {
  const r = running;
  if (!r || !isLocalWriteQueueEnabled()) return false;
  try {
    const e = await r.queue.dequeueCreate(`local-${opId}`);
    if (!e) return false;
    notify();
    return true;
  } catch (err) {
    console.warn("[local-first] discard queued create failed", err);
    return false;
  }
}

/** Fields of a queued (still pending) create, to prefill the entry screen. Null while the flag is off or it already synced. */
export async function getQueuedCreate(opId: string): Promise<PendingFields | null> {
  const r = running;
  if (!r || !isLocalWriteQueueEnabled()) return null;
  try {
    const e = (await r.queue.store.list()).find((x) => x.opId === opId && x.kind === "create" && x.status === "pending");
    return e ? { ...e.fields } : null;
  } catch {
    return null;
  }
}

/** Saves an edit made on the entry screen back into the queued create (merged; null clears a field). */
export function saveQueuedCreate(opId: string, patch: TxFields): Promise<boolean> {
  return enqueue((q) => q.enqueueEditLocal(`local-${opId}`, patch));
}

/** Shape of a server budget row the queue needs (identity, amount, currency and the server clock). */
export interface BudgetQueueRow {
  id: number;
  categoryId: number;
  month: string;
  amount: number;
  currency?: string | null;
  updatedAt?: string | null;
  categoryName?: string;
  categoryGroup?: string;
}

const budgetIdentity = (r: BudgetQueueRow) => ({ categoryId: r.categoryId, month: r.month });

/** Queues a new budget (set for a category and month that has no server row). False = not queued. */
export function queueOfflineBudgetCreate(input: {
  categoryId: number;
  month: string;
  amount: number;
  currency?: string | null;
  categoryName?: string;
  categoryGroup?: string;
}): Promise<boolean> {
  return enqueue((q) =>
    q.enqueueEntityCreate(
      "budget",
      { categoryId: input.categoryId, month: input.month, amount: input.amount, currency: input.currency ?? null },
      { categoryId: input.categoryId, month: input.month, categoryName: input.categoryName ?? null, categoryGroup: input.categoryGroup ?? null },
    ),
  );
}

/** Queues an edit of an existing server budget (amount and/or currency). `row` = the server row the edit was made against. */
export function queueOfflineBudgetEdit(row: BudgetQueueRow, patch: { amount?: number; currency?: string | null }): Promise<boolean> {
  const current: Record<string, unknown> = { amount: row.amount, currency: row.currency ?? null };
  const p: Record<string, string | number | null> = {};
  if (patch.amount !== undefined) p.amount = patch.amount;
  if (patch.currency !== undefined) p.currency = patch.currency;
  return enqueue((q) => q.enqueueEntityEdit("budget", row.id, p, current as Record<string, string | number | null>, budgetIdentity(row)));
}

/** Queues a delete of a server budget (the DELETE request failed with a network error). */
export function queueOfflineBudgetDelete(row: BudgetQueueRow): Promise<boolean> {
  return enqueue((q) =>
    q.enqueueEntityDelete(
      "budget",
      row.id,
      { amount: row.amount, currency: row.currency ?? null, updatedAt: row.updatedAt ?? null },
      budgetIdentity(row),
    ),
  );
}

/**
 * Save of a budget set for one category and month (the form's upsert). Merges into a queued create of the same
 * category and month; else edits the server row when one is known (`serverRow`, the conflict baseline); else creates.
 */
export function queueOfflineBudgetSet(
  input: { categoryId: number; month: string; amount: number; currency: string; categoryName?: string; categoryGroup?: string },
  serverRow: BudgetQueueRow | undefined,
): Promise<boolean> {
  return enqueue(async (q) => {
    const queued = (await q.store.list()).find(
      (e) => e.kind === "create" && e.status === "pending" && entityOf(e) === "budget" && e.ref?.categoryId === input.categoryId && e.ref?.month === input.month,
    );
    if (queued) return q.enqueueEditLocal(queued.rowId, { amount: input.amount, currency: input.currency });
    if (serverRow) {
      return q.enqueueEntityEdit("budget", serverRow.id, { amount: input.amount, currency: input.currency }, { amount: serverRow.amount, currency: serverRow.currency ?? null }, budgetIdentity(serverRow));
    }
    return q.enqueueEntityCreate(
      "budget",
      { categoryId: input.categoryId, month: input.month, amount: input.amount, currency: input.currency },
      { categoryId: input.categoryId, month: input.month, categoryName: input.categoryName ?? null, categoryGroup: input.categoryGroup ?? null },
    );
  });
}

/**
 * Live queue state for the budgets list. Always the shared EMPTY_PENDING_BUDGETS (and nothing opened) while the flag is
 * off. `onSettled` runs when a queued budget leaves the outbox (synced, or discarded): the caller reloads the list.
 */
export function usePendingBudgets(onSettled?: () => void): PendingBudgetView {
  const [view, setView] = useState<PendingBudgetView>(EMPTY_PENDING_BUDGETS);
  const settledRef = useRef(onSettled);
  useEffect(() => {
    settledRef.current = onSettled;
  });
  useEffect(() => {
    if (!isLocalWriteQueueEnabled()) return;
    let alive = true;
    let last = "";
    let lastCount = -1;
    const refresh = () => {
      const r = running;
      if (!r || !isLocalWriteQueueEnabled()) {
        if (last !== "") {
          last = "";
          if (alive) setView(EMPTY_PENDING_BUDGETS);
        }
        return;
      }
      void r.queue.store
        .list()
        .then((l) => {
          if (!alive) return;
          const count = l.filter((e) => entityOf(e) === "budget").length;
          if (lastCount > count) settledRef.current?.();
          lastCount = count;
          const next = toPendingBudgetView(l);
          const key = JSON.stringify(next);
          if (key === last) return;
          last = key;
          setView(isPendingBudgetsEmpty(next) ? EMPTY_PENDING_BUDGETS : next);
        })
        .catch(() => undefined);
    };
    listeners.add(refresh);
    refresh();
    const t = setInterval(refresh, 15_000);
    return () => {
      alive = false;
      listeners.delete(refresh);
      clearInterval(t);
    };
  }, []);
  return view;
}

/** Generic queue entry points for goals, rules, accounts and categories (same rules as the budget ones). False = not queued. */
export function queueOfflineEntityCreate(entity: EntityKind, fields: Record<string, string | number | null>, ref?: Record<string, string | number | null>): Promise<boolean> {
  return enqueue((q) => q.enqueueEntityCreate(entity, fields, ref));
}

export function queueOfflineEntityEdit(
  entity: EntityKind,
  serverId: number,
  patch: Record<string, string | number | null>,
  current: Record<string, string | number | null>,
  ref?: Record<string, string | number | null>,
): Promise<boolean> {
  return enqueue((q) => q.enqueueEntityEdit(entity, serverId, patch, current, ref));
}

export function queueOfflineEntityDelete(entity: EntityKind, serverId: number, current: Record<string, string | number | null | undefined>, ref?: Record<string, string | number | null>): Promise<boolean> {
  return enqueue((q) => q.enqueueEntityDelete(entity, serverId, current as Record<string, string | number | null>, ref));
}

/**
 * Live queue state for one entity list (goals, rules, accounts, categories). The shared EMPTY_ENTITY_VIEW and nothing
 * opened while the flag is off. `onSettled` runs when a queued change of this entity leaves the outbox (synced).
 */
export function usePendingEntity(entity: EntityKind, onSettled?: () => void): EntityPendingView {
  const [view, setView] = useState<EntityPendingView>(EMPTY_ENTITY_VIEW);
  const settledRef = useRef(onSettled);
  useEffect(() => {
    settledRef.current = onSettled;
  });
  useEffect(() => {
    if (!isLocalWriteQueueEnabled()) return;
    let alive = true;
    let last = "";
    let lastCount = -1;
    const refresh = () => {
      const r = running;
      if (!r || !isLocalWriteQueueEnabled()) {
        if (last !== "") {
          last = "";
          if (alive) setView(EMPTY_ENTITY_VIEW);
        }
        return;
      }
      void r.queue.store
        .list()
        .then((l) => {
          if (!alive) return;
          const count = l.filter((e) => entityOf(e) === entity).length;
          if (lastCount > count) settledRef.current?.();
          lastCount = count;
          const next = toEntityPendingView(l, entity);
          const key = JSON.stringify(next);
          if (key === last) return;
          last = key;
          setView(isEntityViewEmpty(next) ? EMPTY_ENTITY_VIEW : next);
        })
        .catch(() => undefined);
    };
    listeners.add(refresh);
    refresh();
    const t = setInterval(refresh, 15_000);
    return () => {
      alive = false;
      listeners.delete(refresh);
      clearInterval(t);
    };
  }, [entity]);
  return view;
}

export interface PendingSyncItem {
  opId: string;
  entity: EntityKind;
  kind: "create" | "edit" | "delete";
  status: "pending" | "failed";
  failReason: string | null;
  attempts: number;
  createdAt: number;
  summary: string;
}

const toItem = (e: OutboxEntry): PendingSyncItem => {
  const entity = entityOf(e);
  const f = e.kind === "delete" ? e.base : e.fields;
  const parts =
    entity === "budget"
      ? [e.ref?.categoryName ?? (e.ref?.categoryId !== undefined ? `Category #${e.ref.categoryId}` : null), e.ref?.month ?? f.month, f.amount]
      : entity === "transaction"
        ? [f.date, f.payee, f.enteredAmount ?? f.amount]
        : [f.name ?? f.alias ?? (e.serverId !== null ? `${entity} #${e.serverId}` : null), f.type ?? null, f.targetAmount ?? null];
  return {
    opId: e.opId,
    entity,
    kind: e.kind,
    status: e.status,
    failReason: e.failReason,
    attempts: e.attempts,
    createdAt: e.createdAt,
    summary: parts.filter((v) => v !== undefined && v !== null && v !== "").join(" · "),
  };
};

export async function listPendingSync(): Promise<PendingSyncItem[]> {
  if (!running || !isLocalWriteQueueEnabled()) return [];
  try {
    return (await running.queue.store.list()).map(toItem);
  } catch {
    return [];
  }
}

/** Failed entry back to pending, drained now. */
export async function retryPendingSync(opId: string): Promise<void> {
  const r = running;
  if (!r) return;
  const e = (await r.queue.store.list()).find((x) => x.opId === opId);
  if (!e || e.status !== "failed") return;
  e.status = "pending";
  e.failReason = null;
  e.attempts = 0;
  e.nextAttemptAt = 0;
  await r.queue.store.put(e);
  notify();
  void r.scheduler.kick();
}

/** Drops an entry for good (the write is lost). */
export async function discardPendingSync(opId: string): Promise<void> {
  if (!running) return;
  await running.queue.store.remove(opId);
  notify();
}

/** Live list for the Settings indicator. Always [] (and nothing opened) while the flag is off. */
export function usePendingSync(): { items: PendingSyncItem[]; enabled: boolean } {
  const [items, setItems] = useState<PendingSyncItem[]>([]);
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    if (!isLocalWriteQueueEnabled()) return;
    setEnabled(true);
    let alive = true;
    const refresh = () => void listPendingSync().then((l) => alive && setItems(l));
    listeners.add(refresh);
    refresh();
    const t = setInterval(refresh, 15_000);
    return () => {
      alive = false;
      listeners.delete(refresh);
      clearInterval(t);
    };
  }, []);
  return { items, enabled };
}

/** Outbox entries as the transactions list shows them. Pure. */
export function toPendingTxView(entries: OutboxEntry[]): PendingTxView {
  const view: PendingTxView = { creates: [], edits: {}, deletes: {} };
  for (const e of entries) {
    if (entityOf(e) !== "transaction") continue; // budgets and other entities have their own views
    const base = { opId: e.opId, status: e.status, failReason: e.failReason };
    if (e.kind === "create") view.creates.push({ ...base, createdAt: e.createdAt, fields: { ...e.fields } });
    else if (e.serverId === null) continue;
    else if (e.kind === "edit") view.edits[e.serverId] = { ...base, fields: { ...e.fields } };
    else view.deletes[e.serverId] = base;
  }
  return view;
}

/**
 * Live queue state for the transactions list. Always the shared EMPTY_PENDING (and nothing opened) while the flag is off.
 * Refreshes when the queue changes (enqueue, drain, retry, discard) and every 15 s.
 */
export function usePendingTransactions(): PendingTxView {
  const [view, setView] = useState<PendingTxView>(EMPTY_PENDING);
  useEffect(() => {
    if (!isLocalWriteQueueEnabled()) return;
    let alive = true;
    let last = "";
    const refresh = () => {
      const r = running;
      if (!r || !isLocalWriteQueueEnabled()) {
        if (last !== "") {
          last = "";
          if (alive) setView(EMPTY_PENDING);
        }
        return;
      }
      void r.queue.store
        .list()
        .then((l) => {
          const next = toPendingTxView(l);
          const key = JSON.stringify(next);
          if (!alive || key === last) return;
          last = key;
          setView(l.length === 0 ? EMPTY_PENDING : next);
        })
        .catch(() => undefined);
    };
    listeners.add(refresh);
    refresh();
    const t = setInterval(refresh, 15_000);
    return () => {
      alive = false;
      listeners.delete(refresh);
      clearInterval(t);
    };
  }, []);
  return view;
}

/**
 * Rotates the on-device key now: queued writes are re-sealed under a new key (none are lost), saved copies of server
 * data are cleared and refill. Returns null when offline mode is not running.
 */
export async function rotateOfflineKeys(): Promise<RotationReport | null> {
  const r = running;
  if (!r || !isLocalWriteQueueEnabled()) return null;
  const report = await rotateOnDeviceKeys(r.userId, { outbox: r.queue.store, clearDataCache: wipePersistedDataCache });
  notify();
  return report;
}

/** Age info for the current on-device key; null when offline mode is not running or no key exists yet. */
export async function getOfflineKeyInfo(): Promise<DeviceKeyMeta | null> {
  const r = running;
  if (!r || !isLocalWriteQueueEnabled()) return null;
  try {
    return await deviceKeys.getKeyMeta(r.userId);
  } catch {
    return null;
  }
}

/** Number of queued (pending or failed) entries; 0 when the queue is not running. */
export async function countUnsyncedWrites(): Promise<number> {
  return (await listPendingSync()).length;
}

/**
 * In-app switch ON: the queue needs the read-cache opt-in (no separate Settings control exists for it), so both
 * on-device flags are set, then the queue starts for this trusted device. Returns whether the queue is running.
 */
export function enableOfflineMode(userId: string | null, deviceId: string | null): boolean {
  setLocalReadCacheEnabled(true);
  setLocalWriteQueueEnabled(true);
  notify();
  if (!userId || !deviceId) return false;
  rememberOfflineIdentity({ userId, deviceId }); // so the app can open with no network from now on
  return startLocalWriteQueue(userId, deviceId);
}

/** In-app switch OFF: stops the scheduler, clears the flag and deletes every on-device outbox (unsynced writes are lost). */
export function disableOfflineMode(): void {
  forgetOfflineIdentity();
  stopLocalWriteQueue();
  setLocalWriteQueueEnabled(false);
}

export interface OfflineModeState {
  /** Real flag state (write key and read-cache opt-in). False until read on the client. */
  enabled: boolean;
  /** null while the trusted-device check is in flight. */
  trusted: boolean | null;
  deviceId: string | null;
  userId: string | null;
  setEnabled: (on: boolean) => void;
}

/** State for the Settings "Offline mode (beta)" switch. Reads the flag after mount; never opens IndexedDB. */
export function useOfflineMode(): OfflineModeState {
  const [enabled, setEnabledState] = useState(false);
  const [trusted, setTrusted] = useState<boolean | null>(null);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const userId = getSessionInfo()?.userId ?? null;
  useEffect(() => {
    setEnabledState(isLocalWriteQueueEnabled());
    let alive = true;
    void fetchTrustedDeviceId().then((id) => {
      if (!alive) return;
      setDeviceId(id);
      setTrusted(id !== null);
    });
    return () => {
      alive = false;
    };
  }, []);
  const setEnabled = (on: boolean) => {
    if (on) enableOfflineMode(userId, deviceId);
    else disableOfflineMode();
    setEnabledState(isLocalWriteQueueEnabled());
  };
  return { enabled, trusted, deviceId, userId, setEnabled };
}

export interface OfflineKeyState {
  info: DeviceKeyMeta | null;
  busy: boolean;
  /** Result of the last rotation attempt: "ok", "failed", or null before any. */
  last: "ok" | "failed" | null;
  rotate: () => Promise<void>;
}

/** State for the Settings "rotate key" control. Reads key age after mount (only when `enabled`); never opens IndexedDB when off. */
export function useOfflineKey(enabled: boolean): OfflineKeyState {
  const [info, setInfo] = useState<DeviceKeyMeta | null>(null);
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<"ok" | "failed" | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    const load = () => void getOfflineKeyInfo().then((m) => alive && setInfo(m));
    load();
    listeners.add(load);
    return () => {
      alive = false;
      listeners.delete(load);
    };
  }, [enabled]);
  const rotate = async () => {
    setBusy(true);
    try {
      const r = await rotateOfflineKeys();
      setLast(r?.rotated ? "ok" : "failed");
      setInfo(await getOfflineKeyInfo());
    } catch {
      setLast("failed");
    } finally {
      setBusy(false);
    }
  };
  return { info, busy, last, rotate };
}
