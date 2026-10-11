/**
 * Offline write queue facade (local-first L3). PROTOTYPE, flag off by default; nothing imports this yet.
 *
 * enqueueCreate / enqueueEdit: stamp per-field HLCs, persist the encrypted entry, apply optimistically to the
 * in-memory read cache. Edits to a row that already has a queued entry are coalesced into it (per-field newer
 * HLC wins), which is also the dedupe. replayPending re-applies queued entries to a freshly hydrated cache.
 * Every entry point is a no-op that returns null when the flag (or the live allow check) is off.
 */
import { createHlc, type HlcClock } from "../clock/hlc";
import type { LocalStore, TransactionRow } from "../store/types";
import { isLocalWriteQueueEnabled } from "./flag";
import { createOutboxStore, wipeOutboxUser, type OutboxStore } from "./outbox-store";
import { EDITABLE_FIELDS, type EditableField, type OutboxEntry, type TxFields } from "./types";

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
  /** Edit of a row that only exists locally (queued create): merged into that create, per-field newer wins. */
  enqueueEditLocal(rowId: string, patch: TxFields, cache?: ApplyStore): Promise<OutboxEntry | null>;
  replayPending(cache: ApplyStore, baseRows?: Map<string, TransactionRow>): Promise<number>;
  pending(): Promise<OutboxEntry[]>;
}

const isField = (k: string): k is EditableField => (EDITABLE_FIELDS as readonly string[]).includes(k);

function clean(fields: TxFields): TxFields {
  const out: TxFields = {};
  for (const [k, v] of Object.entries(fields)) {
    if (!isField(k)) throw new RangeError(`field not allowed offline: ${k}`);
    if (v !== undefined) out[k] = v;
  }
  return out;
}

const str = (v: unknown): string | null => (v === null || v === undefined ? null : String(v));

/** Local row for an entry, merged onto `base` when editing. */
export function rowFromEntry(entry: OutboxEntry, base?: TransactionRow): TransactionRow {
  const f = entry.fields;
  const b: TransactionRow = base ?? { id: entry.rowId, serverId: entry.serverId, date: "1970-01-01", accountId: null, categoryId: null, currency: null, amount: 0 };
  return {
    ...b,
    id: entry.rowId,
    serverId: entry.serverId,
    date: f.date !== undefined ? String(f.date) : b.date,
    amount: f.amount !== undefined ? Number(f.amount) : b.amount,
    accountId: f.accountId !== undefined ? str(f.accountId) : b.accountId,
    categoryId: f.categoryId !== undefined ? str(f.categoryId) : b.categoryId,
    currency: f.currency !== undefined ? str(f.currency) : b.currency,
    enteredAmount: f.enteredAmount !== undefined ? (f.enteredAmount === null ? null : Number(f.enteredAmount)) : b.enteredAmount,
    enteredCurrency: f.enteredCurrency !== undefined ? str(f.enteredCurrency) : b.enteredCurrency,
    payee: f.payee !== undefined ? str(f.payee) : b.payee,
    note: f.note !== undefined ? str(f.note) : b.note,
    tags: f.tags !== undefined ? str(f.tags) : b.tags,
  };
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

  function stamp(entry: OutboxEntry, fields: TxFields): void {
    const hlc = clock.send();
    for (const f of Object.keys(fields) as EditableField[]) {
      entry.fields[f] = fields[f] as string | number | null;
      entry.fieldHlc[f] = { ms: hlc.ms, counter: hlc.counter };
    }
  }

  return {
    get store() {
      return getStore();
    },
    clock,

    enqueueCreate(fields, cache) {
      return serial(async () => {
        if (!allow()) return null;
        const opId = newId();
        const entry: OutboxEntry = {
          opId, kind: "create", rowId: `local-${opId}`, serverId: null, fields: {}, fieldHlc: {}, base: {},
          createdAt: now(), attempts: 0, nextAttemptAt: 0, firstSendAt: null, status: "pending", failReason: null,
        };
        stamp(entry, clean(fields));
        await getStore().put(entry);
        if (cache) await cache.upsertRows("transactions", [rowFromEntry(entry)]);
        return entry;
      });
    },

    enqueueEdit(serverId, patch, current, cache) {
      return serial(async () => {
        if (!allow()) return null;
        const p = clean(patch);
        const rowId = String(serverId);
        const existing = (await getStore().list()).find((e) => e.kind === "edit" && e.rowId === rowId && e.status === "pending");
        let entry: OutboxEntry;
        if (existing) {
          entry = existing; // coalesce: newer local write wins per field; the baseline of an already-queued field stays
        } else {
          entry = {
            opId: newId(), kind: "edit", rowId, serverId, fields: {}, fieldHlc: {}, base: {},
            createdAt: now(), attempts: 0, nextAttemptAt: 0, firstSendAt: null, status: "pending", failReason: null,
          };
        }
        for (const f of Object.keys(p) as EditableField[]) {
          if (!(f in entry.base)) entry.base[f] = ((current as unknown as Record<string, unknown>)[f] ?? null) as string | number | null;
        }
        stamp(entry, p);
        await getStore().put(entry);
        if (cache) await cache.upsertRows("transactions", [rowFromEntry(entry, current)]);
        return entry;
      });
    },

    enqueueEditLocal(rowId, patch, cache) {
      return serial(async () => {
        if (!allow()) return null;
        const p = clean(patch);
        const entry = (await getStore().list()).find((e) => e.kind === "create" && e.rowId === rowId && e.status === "pending");
        if (!entry) return null;
        stamp(entry, p);
        await getStore().put(entry);
        if (cache) await cache.upsertRows("transactions", [rowFromEntry(entry)]);
        return entry;
      });
    },

    async replayPending(cache, baseRows) {
      if (!allow()) return 0;
      const entries = (await getStore().list()).filter((e) => e.status === "pending");
      for (const e of entries) {
        const base = e.kind === "edit" ? baseRows?.get(e.rowId) : undefined;
        if (e.kind === "edit" && !base) continue; // cache has no row to merge onto
        await cache.upsertRows("transactions", [rowFromEntry(e, base)]);
      }
      return entries.length;
    },

    pending() {
      return getStore().list();
    },
  };
}

export { wipeOutboxUser };
