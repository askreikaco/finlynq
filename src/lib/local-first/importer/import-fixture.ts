/**
 * Fixture importer (local-first P1, PKG-09). PROTOTYPE, unreviewed. SYNTHETIC data only.
 *
 * READ-ONLY: reads the in-memory synthetic fixture (fixture/generate.ts) and writes only through
 * the Replica op path into a LocalStore. No network, no server imports (enforced by
 * tests/local-first/importer-isolation.test.ts).
 *
 * Per batch: Replica.localWrite (op) -> encodeFrame -> log.append -> MergeState.apply
 *            -> Replica.rows() (project) -> store.upsertRows (only rows touched in the batch).
 */
import { DEFAULT_N, DEFAULT_SEED, generate, type FixtureDataset } from "../fixture/generate";
import { createHlc } from "../clock/hlc";
import type { LogKeys } from "../crypto/kdf";
import { MemoryLogStore } from "../oplog/log-store";
import { Replica } from "../oplog/replica";
import { createUlidFactory } from "../oplog/ulid";
import type { JsonValue } from "../oplog/types";
import { Prng } from "../sim/prng";
import type { LocalRow, LocalStore, RowCounts, TableName } from "../store/types";

/** Fixed epoch for the importer HLC and op-id clock (no wall-clock read). */
export const IMPORT_EPOCH_MS = Date.UTC(2026, 0, 1);
export const DEFAULT_BATCH_SIZE = 500;

export interface ImportOptions {
  store: LocalStore;
  keys: LogKeys;
  /** Defaults to generate({ seed: DEFAULT_SEED, n: DEFAULT_N }). */
  dataset?: FixtureDataset;
  batchSize?: number;
  deviceId?: string;
  logId?: string;
}

export interface ImportResult {
  ops: number;
  batches: number;
  counts: RowCounts;
  stateHash: string;
}

interface WorkItem {
  table: TableName;
  id: string;
  fields: { [key: string]: JsonValue };
}

function randomBytesFrom(prng: Prng): (n: number) => Uint8Array {
  return (n: number) => {
    const b = new Uint8Array(n);
    for (let i = 0; i < n; i++) b[i] = prng.int(0, 255);
    return b;
  };
}

/** Row object -> op fields: every property except `id`, in the camelCase LocalRow shape. */
function fieldsOf(row: object): { [key: string]: JsonValue } {
  const rec = row as Record<string, unknown>;
  const out: { [key: string]: JsonValue } = {};
  for (const key of Object.keys(rec)) {
    if (key === "id") continue;
    const v = rec[key];
    if (v === undefined) throw new TypeError(`fixture field ${key} is undefined`);
    out[key] = v as JsonValue;
  }
  return out;
}

/** Ordered work list: accounts, categories, then transactions (7020 ops for the default fixture). */
export function fixtureWorkItems(data: FixtureDataset): WorkItem[] {
  const items: WorkItem[] = [];
  for (const a of data.accounts) items.push({ table: "accounts", id: a.id, fields: fieldsOf(a) });
  for (const c of data.categories) items.push({ table: "categories", id: c.id, fields: fieldsOf(c) });
  for (const t of data.transactions) items.push({ table: "transactions", id: t.id, fields: fieldsOf(t) });
  return items;
}

/** Loads the synthetic fixture into `store` through the op path, batch by batch. */
export async function importFixture(opts: ImportOptions): Promise<ImportResult> {
  const data = opts.dataset ?? generate({ seed: DEFAULT_SEED, n: DEFAULT_N });
  const batchSize = opts.batchSize ?? DEFAULT_BATCH_SIZE;
  if (!Number.isInteger(batchSize) || batchSize < 1) throw new RangeError("batchSize must be a positive integer");
  const deviceId = opts.deviceId ?? "importer-dev";
  const logId = opts.logId ?? "lf-proto-fixture";

  const prng = new Prng(DEFAULT_SEED);
  const replica = await Replica.open({
    deviceId,
    logId,
    keys: opts.keys,
    log: new MemoryLogStore(),
    clock: createHlc({ now: () => IMPORT_EPOCH_MS }),
    newOpId: createUlidFactory({ now: () => IMPORT_EPOCH_MS, random: randomBytesFrom(prng.fork("op-ids")) }),
  });

  const items = fixtureWorkItems(data);
  let ops = 0;
  let batches = 0;
  for (let start = 0; start < items.length; start += batchSize) {
    const batch = items.slice(start, start + batchSize);
    const touched: Record<TableName, Set<string>> = {
      accounts: new Set(),
      categories: new Set(),
      transactions: new Set(),
    };
    for (const item of batch) {
      await replica.localWrite(item.table, item.id, "upsert", item.fields);
      touched[item.table].add(item.id);
      ops++;
    }
    const projected = replica.rows();
    for (const table of ["accounts", "categories", "transactions"] as TableName[]) {
      const ids = touched[table];
      const rows = (projected[table] ?? []).filter((r) => ids.has(String(r.id))) as unknown as LocalRow[];
      await opts.store.upsertRows(table, rows);
    }
    batches++;
  }

  return {
    ops,
    batches,
    counts: await opts.store.counts(),
    stateHash: await replica.stateHash(),
  };
}
