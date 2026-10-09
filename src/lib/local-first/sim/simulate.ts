/**
 * Seeded multi-device scenario generator. PROTOTYPE, unreviewed.
 *
 * Devices write through real Replicas (frame codec, log, HLC) on a virtual clock with per-device skew,
 * occasionally pulling a few frames from another device so that HLC receive matters. Every concern
 * (shape, quotas, skew, ids, scheduling, op content, sync, ulid randomness per device, delivery
 * dups/shuffle) draws from its own forked Prng. No wall clock, no ambient randomness.
 */
import { compareHlc, createHlc, type Hlc } from "../clock/hlc";
import type { LogKeys } from "../crypto/kdf";
import { MemoryLogStore } from "../oplog/log-store";
import { Replica } from "../oplog/replica";
import type { JsonValue, Op } from "../oplog/types";
import { createUlidFactory } from "../oplog/ulid";
import { Prng } from "./prng";

export const SIM_T0 = 1_700_000_000_000;
export const ENTITIES = ["accounts", "categories", "transactions"] as const;
export const ROWS_PER_ENTITY = 20;
export const FIELD_NAMES = ["name", "amount", "note", "tag"] as const;
const SKEW_MS = 120_000;

export interface Scenario {
  seed: number;
  deviceIds: string[];
  skews: number[];
  /** All unique ops in generation order, parallel to `frames`. */
  ops: Op[];
  frames: Uint8Array[];
  /** Writes whose HLC did not exceed everything the device had observed (must be 0). */
  causalViolations: number;
  /** Writes where the wall clock was at or behind an observed HLC, so recv had to lift it. */
  causalLifts: number;
  /** Largest wall time used; delivery replicas run at this time. */
  endMs: number;
  /** First outputs of two independent fork() calls with the same label, and parent-vs-fresh probe. */
  forkProbe: { a: number; b: number; parentNext: number; freshFirst: number };
}

function hex8(n: number): string {
  return n.toString(16).padStart(8, "0");
}

export function fisherYates<T>(arr: T[], prng: Prng): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = prng.int(0, i);
    const t = arr[i];
    arr[i] = arr[j];
    arr[j] = t;
  }
  return arr;
}

export async function generateScenario(seed: number, keys: LogKeys, logId: string): Promise<Scenario> {
  const root = new Prng(seed);
  const probeA = root.fork("probe").nextU32();
  const probeB = root.fork("probe").nextU32();
  // fork() must neither advance nor share the parent: the parent's next output is a fresh stream's first.
  const parentNext = root.nextU32();
  const freshFirst = new Prng(seed).nextU32();

  const shape = root.fork("shape");
  const n = shape.int(3, 5);
  const quotaRng = root.fork("quota");
  const skewRng = root.fork("skew");
  const sched = root.fork("sched");
  const content = root.fork("content");
  const sync = root.fork("sync");

  const deviceIds: string[] = [];
  const skews: number[] = [];
  const quota: number[] = [];
  for (let i = 0; i < n; i++) {
    deviceIds.push(`dev-${i}-${hex8(root.fork("devid:" + i).nextU32())}`);
    skews.push(skewRng.int(-SKEW_MS, SKEW_MS));
    quota.push(quotaRng.int(20, 200));
  }

  let t = 0;
  const replicas: Replica[] = [];
  const logs: MemoryLogStore[] = [];
  for (let i = 0; i < n; i++) {
    const now = () => SIM_T0 + t + skews[i];
    const ulidRng = root.fork("ulid:" + i);
    const newOpId = createUlidFactory({
      now,
      random: (k) => {
        const b = new Uint8Array(k);
        for (let j = 0; j < k; j++) b[j] = ulidRng.nextU32() & 0xff;
        return b;
      },
    });
    const log = new MemoryLogStore();
    logs.push(log);
    replicas.push(await Replica.open({ deviceId: deviceIds[i], logId, keys, log, clock: createHlc({ now }), newOpId }));
  }

  const ops: Op[] = [];
  const frames: Uint8Array[] = [];
  const perDevIdx: number[][] = deviceIds.map(() => []);
  const observed: Hlc[] = deviceIds.map(() => ({ ms: 0, counter: 0 }));
  let causalViolations = 0;
  let causalLifts = 0;
  let endMs = SIM_T0;

  const ids = deviceIds.map((_, i) => i);
  for (;;) {
    const live = ids.filter((i) => quota[i] > 0);
    if (live.length === 0) break;
    const d = live[sched.int(0, live.length - 1)];
    t += sched.int(1, 3000);

    if (sync.nextFloat() < 0.3) {
      const others = ids.filter((i) => i !== d && perDevIdx[i].length > 0);
      if (others.length > 0) {
        const o = others[sync.int(0, others.length - 1)];
        const k = sync.int(1, 3);
        for (let c = 0; c < k; c++) {
          const gi = perDevIdx[o][sync.int(0, perDevIdx[o].length - 1)];
          const res = await replicas[d].receive(frames[gi]);
          if (res === "applied" && compareHlc(ops[gi].hlc, observed[d]) > 0) observed[d] = { ...ops[gi].hlc };
        }
      }
    }

    const wall = SIM_T0 + t + skews[d];
    if (wall <= observed[d].ms) causalLifts++;
    const entity = ENTITIES[content.int(0, ENTITIES.length - 1)];
    const rowId = `r${content.int(0, ROWS_PER_ENTITY - 1)}`;
    const isDelete = content.nextFloat() < 0.1;
    const fields: { [key: string]: JsonValue } = {};
    if (!isDelete) {
      const cnt = content.int(1, 3);
      for (let f = 0; f < cnt; f++) {
        const name = FIELD_NAMES[content.int(0, FIELD_NAMES.length - 1)];
        fields[name] = name === "amount" ? content.int(-100000, 100000) : `v${content.int(0, 999)}`;
      }
    }
    const op = await replicas[d].localWrite(entity, rowId, isDelete ? "delete" : "upsert", fields);
    if (compareHlc(op.hlc, observed[d]) <= 0) causalViolations++;
    observed[d] = { ...op.hlc };
    const frame = await logs[d].get(op.deviceId, op.seq);
    if (frame === undefined) throw new Error("frame missing after localWrite");
    perDevIdx[d].push(ops.length);
    ops.push(op);
    frames.push(frame);
    quota[d]--;
    if (wall > endMs) endMs = wall;
  }

  return {
    seed,
    deviceIds,
    skews,
    ops,
    frames,
    causalViolations,
    causalLifts,
    endMs,
    forkProbe: { a: probeA, b: probeB, parentNext, freshFirst },
  };
}

/** Arrival order for one receiver: every frame at least once, 0-2 extra copies, Fisher-Yates shuffled. */
export function planDelivery(frameCount: number, prng: Prng): { order: number[]; duplicates: number } {
  const dups = prng.fork("dups");
  const order: number[] = [];
  let duplicates = 0;
  for (let i = 0; i < frameCount; i++) {
    // 0-2 extra copies, skewed towards few so the suite stays fast: P(0)=0.7, P(1)=0.2, P(2)=0.1
    const roll = dups.int(0, 9);
    const copies = 1 + (roll < 7 ? 0 : roll < 9 ? 1 : 2);
    duplicates += copies - 1;
    for (let c = 0; c < copies; c++) order.push(i);
  }
  fisherYates(order, prng.fork("shuffle"));
  return { order, duplicates };
}

/** Adjacent pairs in an arrival order where the later op sorts before the earlier one. */
export function outOfOrderPairs(order: number[], less: (a: number, b: number) => boolean): number {
  let n = 0;
  for (let i = 1; i < order.length; i++) if (less(order[i], order[i - 1])) n++;
  return n;
}

/** A receiving replica that never writes. */
export function openReceiver(sc: Scenario, label: string, keys: LogKeys, logId: string, log = new MemoryLogStore()): Promise<Replica> {
  const now = () => sc.endMs;
  return Replica.open({
    deviceId: "rx-" + label,
    logId,
    keys,
    log,
    clock: createHlc({ now }),
    newOpId: () => {
      throw new Error("receiver must not write");
    },
  });
}

/** Feeds frames in `order`; returns how many receives applied vs were reported duplicate. */
export async function deliver(r: Replica, sc: Scenario, order: number[]): Promise<{ applied: number; duplicate: number }> {
  let applied = 0;
  let duplicate = 0;
  for (const i of order) {
    if ((await r.receive(sc.frames[i])) === "applied") applied++;
    else duplicate++;
  }
  return { applied, duplicate };
}

/**
 * Mid-stream snapshot bootstrap: a receiver takes the first half of `order`, seals a snapshot at its log
 * offset, and a second replica opens from that snapshot and receives the rest.
 */
export async function bootstrapDeliver(
  sc: Scenario,
  order: number[],
  keys: LogKeys,
  logId: string,
): Promise<{ replica: Replica; appliedAfter: number; uniqueBefore: number }> {
  const mid = order.length >> 1;
  const log = new MemoryLogStore();
  const seedReplica = await openReceiver(sc, "seed", keys, logId, log);
  await deliver(seedReplica, sc, order.slice(0, mid));
  const bytes = await seedReplica.snapshot();
  const offset = await seedReplica.offset();
  const uniqueBefore = new Set(order.slice(0, mid)).size;
  const replica = await Replica.open({
    deviceId: "rx-boot",
    logId,
    keys,
    log,
    clock: createHlc({ now: () => sc.endMs }),
    newOpId: () => {
      throw new Error("receiver must not write");
    },
    snapshot: { bytes, offset },
  });
  const res = await deliver(replica, sc, order.slice(mid));
  return { replica, appliedAfter: res.applied, uniqueBefore };
}
