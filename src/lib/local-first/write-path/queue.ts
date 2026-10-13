/**
 * Offline write queue (local-first L3). PROTOTYPE, flag off by default; nothing imports this yet.
 *
 * enqueue*: stamp per-field HLCs, persist the encrypted entry, apply optimistically to the in-memory read cache (for
 * entities with a cache table). Edits to a row that already has a queued entry are coalesced into it (per-field newer
 * HLC wins), which is also the dedupe. replayPending re-applies queued entries to a freshly hydrated cache.
 * Every entry point is a no-op that returns null when the flag (or the live allow check) is off.
 *
 * The transaction methods (enqueueCreate, enqueueEdit, ...) keep their original signatures. The enqueueEntity* methods
 * take an entity kind and dispatch field rules and the cache table through its adapter (./entities).
 */
import { createHlc, type HlcClock } from "../clock/hlc";
import type { LocalStore, LocalRow, TransactionRow } from "../store/types";
import { isLocalWriteQueueEnabled } from "./flag";
import { adapterFor, entityOf, rowIdFor } from "./entities";
import { createOutboxStore, wipeOutboxUser, type OutboxStore } from "./outbox-store";
import { rowFromEntry } from "./entities/transaction";
import type { EntityFields, EntityKind, FieldValue, OutboxEntry, TxFields } from "./types";

export { rowFromEntry };

export type ApplyStore = Pick<LocalStore, "upsertRows" | "deleteRows">;

export interface WriteQueueDeps {
  userId: string;
  deviceId: string;
  /** Live check, read at every call. Defaults to the opt-in flags. */
  allow?: () => boolean;
  store?: OutboxStore;
  now?: () => number;
  newId?: () => string;
}

export interface WriteQueue {
  readonly store: OutboxStore;
  readonly clock: HlcClock;
  enqueueCreate(fields: TxFields, cache?: ApplyStore): Promise<OutboxEntry | null>;
  /** `current` is the cached server-confirmed row (conflict baseline and optimistic base). */
  enqueueEdit(serverId: number, patch: TxFields, current: TransactionRow, cache?: ApplyStore): Promise<OutboxEntry | null>;
  /**
   * Delete of server row `serverId`. Supersedes (removes) any queued edit of that row. `current` carries the
   * cached server values and `updatedAt` (the baseline for "changed on the server since").
   */
  enqueueDelete(serverId: number, current: TransactionRow & { updatedAt?: string | null }, cache?: ApplyStore): Promise<OutboxEntry | null>;
  /**
   * Drops a queued create that is deleted before it synced. Null when there is no such entry, or when a send may
   * already be in flight (firstSendAt set): then the row may exist on the server and must be deleted there instead.
   */
  dequeueCreate(rowId: string, cache?: ApplyStore): Promise<OutboxEntry | null>;
  /** Edit of a row that only exists locally (queued create): merged into that create, per-field newer wins. */
  enqueueEditLocal(rowId: string, patch: TxFields, cache?: ApplyStore): Promise<OutboxEntry | null>;
  replayPending(cache: ApplyStore, baseRows?: Map<string, TransactionRow>): Promise<number>;
  pending(): Promise<OutboxEntry[]>;
  /** Generic create. `ref` = identity and display hints kept beside the entry (not sent as values). */
  enqueueEntityCreate(entity: EntityKind, fields: EntityFields, ref?: EntityFields, cache?: ApplyStore): Promise<OutboxEntry | null>;
  /** Generic edit. `current` = the server values the edit was made against (conflict baseline). */
  enqueueEntityEdit(entity: EntityKind, serverId: number, patch: EntityFields, current: EntityFields, ref?: EntityFields, cache?: ApplyStore): Promise<OutboxEntry | null>;
  /** Generic delete. `current` carries `updatedAt` as the concurrent-change baseline. */
  enqueueEntityDelete(entity: EntityKind, serverId: number, current: EntityFields & { updatedAt?: string | null }, ref?: EntityFields, cache?: ApplyStore): Promise<OutboxEntry | null>;
}

/** Field names of an entity the queue may write for a given operation. Unknown entity or field = RangeError. */
function allowed(entity: EntityKind, names: "createFields" | "editableFields"): readonly string[] {
  const a = adapterFor(entity);
  if (!a) throw new RangeError(`no offline adapter for entity: ${entity}`);
  return a[names];
}

function clean(fields: EntityFields, names: readonly string[]): EntityFields {
  const out: EntityFields = {};
  for (const [k, v] of Object.entries(fields)) {
    if (!names.includes(k)) throw new RangeError(`field not allowed offline: ${k}`);
    if (v !== undefined) out[k] = v;
  }
  return out;
}

export function createWriteQueue(deps: WriteQueueDeps): WriteQueue {
  const now = deps.now ?? Date.now;
  const allow = deps.allow ?? (() => isLocalWriteQueueEnabled());
  const newId = deps.newId ?? (() => globalThis.crypto.randomUUID());
  const clock = createHlc({ now });
  let store: OutboxStore | null = deps.store ?? null;
  const getStore = (): OutboxStore => (store ??= createOutboxStore(deps.userId, deps.deviceId));
  /** Serialises enqueue so coalescing reads see the previous write. */
  let chain: Promise<unknown> = Promise.resolve();
  const serial = <T>(fn: () => Promise<T>): Promise<T> => {
    const run = chain.then(fn, fn);
    chain = run.catch(() => undefined);
    return run;
  };

  function stamp(entry: OutboxEntry, fields: EntityFields): void {
    const hlc = clock.send();
    for (const f of Object.keys(fields)) {
      entry.fields[f] = fields[f];
      entry.fieldHlc[f] = { ms: hlc.ms, counter: hlc.counter };
    }
  }

  const newEntry = (fields: Partial<OutboxEntry> & Pick<OutboxEntry, "kind" | "rowId" | "serverId" | "entity">): OutboxEntry => ({
    opId: newId(), fields: {}, fieldHlc: {}, base: {},
    createdAt: now(), attempts: 0, nextAttemptAt: 0, firstSendAt: null, status: "pending", failReason: null,
    ...fields,
  });

  async function enqueueCreate(entity: EntityKind, fields: EntityFields, ref: EntityFields | undefined, cache: ApplyStore | undefined): Promise<OutboxEntry | null> {
    if (!allow()) return null;
    const adapter = adapterFor(entity);
    if (!adapter) throw new RangeError(`no offline adapter for entity: ${entity}`);
    if (!adapter.canCreateOffline) throw new RangeError(`create is online-only for ${entity}`);
    const entry = newEntry({ entity, kind: "create", rowId: "", serverId: null });
    entry.rowId = `local-${entry.opId}`;
    stamp(entry, clean(fields, allowed(entity, "createFields")));
    if (ref && Object.keys(ref).length > 0) entry.ref = ref;
    await getStore().put(entry);
    if (cache && adapter.cacheTable) await cache.upsertRows(adapter.cacheTable, [adapter.rowFromEntry(entry) as LocalRow]);
    return entry;
  }

  async function enqueueEdit(entity: EntityKind, serverId: number, patch: EntityFields, current: Record<string, unknown>, ref: EntityFields | undefined, cache: ApplyStore | undefined): Promise<OutboxEntry | null> {
    if (!allow()) return null;
    const adapter = adapterFor(entity);
    if (!adapter) throw new RangeError(`no offline adapter for entity: ${entity}`);
    if (!adapter.canEditOffline) throw new RangeError(`edit is online-only for ${entity}`);
    const p = clean(patch, allowed(entity, "editableFields"));
    const rowId = rowIdFor(entity, serverId);
    const existing = (await getStore().list()).find((e) => e.kind === "edit" && e.rowId === rowId && e.status === "pending" && entityOf(e) === entity);
    const entry = existing ?? newEntry({ entity, kind: "edit", rowId, serverId });
    if (!existing && ref && Object.keys(ref).length > 0) entry.ref = ref;
    for (const f of Object.keys(p)) {
      if (!(f in entry.base)) entry.base[f] = ((current[f] ?? null) as FieldValue);
    }
    stamp(entry, p);
    await getStore().put(entry);
    if (cache && adapter.cacheTable) await cache.upsertRows(adapter.cacheTable, [adapter.rowFromEntry(entry, current) as LocalRow]);
    return entry;
  }

  async function enqueueDelete(entity: EntityKind, serverId: number, current: Record<string, unknown>, ref: EntityFields | undefined, cache: ApplyStore | undefined): Promise<OutboxEntry | null> {
    if (!allow()) return null;
    const adapter = adapterFor(entity);
    if (!adapter) throw new RangeError(`no offline adapter for entity: ${entity}`);
    if (!adapter.canDeleteOffline) throw new RangeError(`delete is online-only for ${entity}`);
    const rowId = rowIdFor(entity, serverId);
    const all = await getStore().list();
    const dup = all.find((e) => e.kind === "delete" && e.rowId === rowId && e.status === "pending" && entityOf(e) === entity);
    if (dup) return dup;
    // A pending edit of the same row is moot once the row is deleted; a failed one stays for review.
    for (const e of all) if (e.kind === "edit" && e.rowId === rowId && e.status === "pending" && entityOf(e) === entity) await getStore().remove(e.opId);
    const base: EntityFields = {};
    for (const f of adapter.editableFields) {
      const v = current[f];
      if (v !== undefined) base[f] = (v === null || v === "" ? null : typeof v === "number" ? v : String(v)) as FieldValue;
    }
    const entry = newEntry({ entity, kind: "delete", rowId, serverId, base, baseUpdatedAt: (current.updatedAt as string | null | undefined) ?? null });
    if (ref && Object.keys(ref).length > 0) entry.ref = ref;
    await getStore().put(entry);
    if (cache && adapter.cacheTable) await cache.deleteRows(adapter.cacheTable, [rowId]);
    return entry;
  }

  return {
    get store() {
      return getStore();
    },
    clock,

    enqueueCreate(fields, cache) {
      return serial(() => enqueueCreate("transaction", fields, undefined, cache));
    },

    enqueueEdit(serverId, patch, current, cache) {
      return serial(() => enqueueEdit("transaction", serverId, patch, current as unknown as Record<string, unknown>, undefined, cache));
    },

    enqueueDelete(serverId, current, cache) {
      return serial(() => enqueueDelete("transaction", serverId, current as unknown as Record<string, unknown>, undefined, cache));
    },

    dequeueCreate(rowId, cache) {
      return serial(async () => {
        if (!allow()) return null;
        const entry = (await getStore().list()).find((e) => e.kind === "create" && e.rowId === rowId);
        if (!entry || entry.firstSendAt !== null) return null;
        await getStore().remove(entry.opId);
        const adapter = adapterFor(entityOf(entry));
        if (cache && adapter?.cacheTable) await cache.deleteRows(adapter.cacheTable, [rowId]);
        return entry;
      });
    },

    enqueueEditLocal(rowId, patch, cache) {
      return serial(async () => {
        if (!allow()) return null;
        const entry = (await getStore().list()).find((e) => e.kind === "create" && e.rowId === rowId && e.status === "pending");
        if (!entry) return null;
        const entity = entityOf(entry);
        const adapter = adapterFor(entity);
        if (!adapter) return null;
        const p = clean(patch, adapter.createFields);
        stamp(entry, p);
        // A create has no baseline: a cleared field (null) simply is not part of the POST body.
        for (const f of Object.keys(p)) {
          if (p[f] === null) {
            delete entry.fields[f];
            delete entry.fieldHlc[f];
          }
        }
        await getStore().put(entry);
        if (cache && adapter.cacheTable) await cache.upsertRows(adapter.cacheTable, [adapter.rowFromEntry(entry) as LocalRow]);
        return entry;
      });
    },

    async replayPending(cache, baseRows) {
      if (!allow()) return 0;
      const entries = (await getStore().list()).filter((e) => e.status === "pending");
      for (const e of entries) {
        const adapter = adapterFor(entityOf(e));
        if (!adapter?.cacheTable) continue; // no local table for this entity: nothing to re-apply
        if (e.kind === "delete") {
          await cache.deleteRows(adapter.cacheTable, [e.rowId]);
          continue;
        }
        const base = e.kind === "edit" ? baseRows?.get(e.rowId) : undefined;
        if (e.kind === "edit" && !base) continue; // cache has no row to merge onto
        await cache.upsertRows(adapter.cacheTable, [adapter.rowFromEntry(e, base) as LocalRow]);
      }
      return entries.length;
    },

    pending() {
      return getStore().list();
    },

    enqueueEntityCreate(entity, fields, ref, cache) {
      return serial(() => enqueueCreate(entity, fields, ref, cache));
    },

    enqueueEntityEdit(entity, serverId, patch, current, ref, cache) {
      return serial(() => enqueueEdit(entity, serverId, patch, current, ref, cache));
    },

    enqueueEntityDelete(entity, serverId, current, ref, cache) {
      return serial(() => enqueueDelete(entity, serverId, current, ref, cache));
    },
  };
}

export { wipeOutboxUser };
