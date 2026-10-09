// PROTOTYPE, unreviewed. Seeded convergence fuzz against an independent oracle (sim/oracle.ts).
import { describe, it, expect, beforeAll } from "vitest";
import { deriveKeysFromPassphrase, type Argon2Params, type LogKeys } from "@/lib/local-first/crypto/kdf";
import { Prng } from "@/lib/local-first/sim/prng";
import {
  bootstrapDeliver,
  deliver,
  generateScenario,
  openReceiver,
  outOfOrderPairs,
  planDelivery,
  type Scenario,
} from "@/lib/local-first/sim/simulate";
import {
  compareOpOrder,
  conflictingRegisters,
  hashRegisters,
  opWrites,
  oracleHash,
  oracleRegisters,
  sha256Hex,
  type OracleRegister,
} from "@/lib/local-first/sim/oracle";
import type { Op } from "@/lib/local-first/oplog/types";

const TINY: Argon2Params = { m: 64, t: 1, p: 1, dkLen: 32 };
const SALT = new Uint8Array(16).map((_, i) => i + 21);
const LOG_ID = "log-convergence";
const TRIALS = 500;
const BASE_SEED = 0x5eed;

let keys: LogKeys;

beforeAll(async () => {
  keys = await deriveKeysFromPassphrase("convergence test passphrase", SALT, LOG_ID, TINY);
});

/** Control replica: applies in arrival order, overwrite on every write, no LWW comparison. */
async function controlHash(ops: readonly Op[], order: number[]): Promise<string> {
  const regs: Record<string, OracleRegister> = {};
  for (const i of order) {
    const op = ops[i];
    for (const w of opWrites(op)) {
      regs[w.key] = { value: w.value, hlc: { ms: op.hlc.ms, counter: op.hlc.counter }, deviceId: op.deviceId, opId: op.opId };
    }
  }
  return hashRegisters(regs);
}

interface Summary {
  trials: number;
  conflictTrials: number;
  distinctOracleHashes: number;
  duplicates: number;
  outOfOrder: number;
  outOfOrderMinTrial: number;
  controlDiverged: number;
  causalViolations: number;
  causalLifts: number;
  suiteHash: string;
}

interface TrialResult {
  line: string;
  oHash: string;
  conflict: boolean;
  duplicates: number;
  descents: number;
  controlDiverged: boolean;
  causalViolations: number;
  causalLifts: number;
}

async function runTrial(i: number): Promise<TrialResult> {
  const seed = BASE_SEED + i;
  const sc: Scenario = await generateScenario(seed, keys, LOG_ID);
  const tag = `trial ${i} seed ${seed}`;

  // closure-bug checks: unique opIds, distinct deviceIds == device count, independent forks
  expect(new Set(sc.ops.map((o) => o.opId)).size, `ASSERT opIds-unique ${tag}`).toBe(sc.ops.length);
  expect(new Set(sc.ops.map((o) => o.deviceId)).size, `ASSERT distinct-deviceIds-equal-device-count ${tag}`).toBe(sc.deviceIds.length);
  expect(new Set(sc.deviceIds).size, `ASSERT deviceIds-distinct ${tag}`).toBe(sc.deviceIds.length);
  expect(sc.forkProbe.a, `ASSERT fork-same-label-deterministic ${tag}`).toBe(sc.forkProbe.b);
  expect(sc.forkProbe.parentNext, `ASSERT fork-does-not-advance-parent ${tag}`).toBe(sc.forkProbe.freshFirst);
  expect(sc.causalViolations, `ASSERT hlc-causality-after-recv ${tag}`).toBe(0);

  const oHash = await oracleHash(sc.ops);

  const rootRng = new Prng(seed).fork("delivery");
  const p0 = planDelivery(sc.ops.length, rootRng.fork("p0"));
  const pb = planDelivery(sc.ops.length, rootRng.fork("boot"));
  const descents = outOfOrderPairs(p0.order, (a, b) => compareOpOrder(sc.ops[a], sc.ops[b]) < 0);

  const unique = sc.ops.length;
  const sumRanges = (r: Record<string, Array<[number, number]>>) =>
    Object.values(r).reduce((acc, rs) => acc + rs.reduce((a, [x, y]) => a + (y - x + 1), 0), 0);

  // replica A: shuffled + duplicated
  const ra = await openReceiver(sc, "a", keys, LOG_ID);
  const ta = await deliver(ra, sc, p0.order);
  const hashA = await ra.stateHash();
  expect(hashA, `ASSERT replica-equals-oracle (shuffled A) ${tag}`).toBe(oHash);
  expect(ta.applied, `ASSERT appliedOps-equals-unique-ops (A) ${tag}`).toBe(unique);
  expect(ta.duplicate, `ASSERT duplicates-reported (A) ${tag}`).toBe(p0.order.length - unique);
  expect(sumRanges(ra.state.exportApplied()), `ASSERT applied-ranges-equal-unique-ops (A) ${tag}`).toBe(unique);

  // replica C: reversed-order replay of A's arrival order
  const rc = await openReceiver(sc, "c", keys, LOG_ID);
  const tc = await deliver(rc, sc, p0.order.slice().reverse());
  const hashC = await rc.stateHash();
  expect(hashC, `ASSERT reversed-order-replay-equals-oracle ${tag}`).toBe(oHash);
  expect(tc.applied, `ASSERT appliedOps-equals-unique-ops (reversed) ${tag}`).toBe(unique);

  // replica D: mid-stream snapshot bootstrap
  const boot = await bootstrapDeliver(sc, pb.order, keys, LOG_ID);
  const hashD = await boot.replica.stateHash();
  expect(hashD, `ASSERT snapshot-bootstrap-replica-equals-oracle ${tag}`).toBe(oHash);
  expect(boot.appliedAfter, `ASSERT appliedOps-equals-unique-ops (bootstrap tail) ${tag}`).toBe(unique - boot.uniqueBefore);
  expect(sumRanges(boot.replica.state.exportApplied()), `ASSERT applied-ranges-equal-unique-ops (bootstrap) ${tag}`).toBe(unique);

  // re-applying every frame leaves the hash unchanged
  const again = await deliver(ra, sc, sc.ops.map((_, k) => k));
  expect(again.applied, `ASSERT reapply-applies-nothing ${tag}`).toBe(0);
  expect(await ra.stateHash(), `ASSERT reapply-hash-unchanged ${tag}`).toBe(oHash);

  // arrival-order control (no LWW comparison)
  const cHash = await controlHash(sc.ops, p0.order);

  return {
    line: [i, sc.deviceIds.length, unique, oHash, hashA, hashC, hashD, cHash, descents, p0.duplicates].join(":"),
    oHash,
    conflict: conflictingRegisters(sc.ops) > 0,
    duplicates: p0.duplicates + pb.duplicates,
    descents,
    controlDiverged: cHash !== oHash,
    causalViolations: sc.causalViolations,
    causalLifts: sc.causalLifts,
  };
}

const CONCURRENCY = 4;

async function runSuite(trials: number): Promise<Summary> {
  const results: TrialResult[] = new Array(trials);
  for (let start = 0; start < trials; start += CONCURRENCY) {
    const idx: number[] = [];
    for (let i = start; i < Math.min(trials, start + CONCURRENCY); i++) idx.push(i);
    const got = await Promise.all(idx.map((i) => runTrial(i)));
    got.forEach((r, k) => (results[idx[k]] = r));
  }
  return {
    trials,
    conflictTrials: results.filter((r) => r.conflict).length,
    distinctOracleHashes: new Set(results.map((r) => r.oHash)).size,
    duplicates: results.reduce((a, r) => a + r.duplicates, 0),
    outOfOrder: results.reduce((a, r) => a + r.descents, 0),
    outOfOrderMinTrial: Math.min(...results.map((r) => r.descents)),
    controlDiverged: results.filter((r) => r.controlDiverged).length,
    causalViolations: results.reduce((a, r) => a + r.causalViolations, 0),
    causalLifts: results.reduce((a, r) => a + r.causalLifts, 0),
    suiteHash: await sha256Hex(results.map((r) => r.line).join("\n")),
  };
}

function printMetrics(s: Summary): void {
  const m: Array<[string, number | string]> = [
    ["trials", s.trials],
    ["trials_with_conflicting_registers", s.conflictTrials],
    ["distinct_oracle_hashes", s.distinctOracleHashes],
    ["duplicates_delivered", s.duplicates],
    ["out_of_order_pairs", s.outOfOrder],
    ["out_of_order_pairs_min_trial", s.outOfOrderMinTrial],
    ["control_diverged_trials", s.controlDiverged],
    ["causal_lifts_needing_recv", s.causalLifts],
    ["causal_violations", s.causalViolations],
    ["suite_hash", s.suiteHash],
  ];
  for (const [k, v] of m) process.stderr.write(`METRIC ${k}=${v}\n`);
}

describe("positive controls (run before any negative assertion)", () => {
  it("PC1 oracle hash is sensitive to the op set", async () => {
    const sc = await generateScenario(BASE_SEED, keys, LOG_ID);
    const full = await oracleHash(sc.ops);
    const winner = sc.ops.slice().sort(compareOpOrder)[sc.ops.length - 1];
    const without = await oracleHash(sc.ops.filter((o) => o !== winner));
    expect(without).not.toBe(full);
  });

  it("PC2 control algorithm equals the oracle when fed ascending total order (so divergence is about order only)", async () => {
    const sc = await generateScenario(BASE_SEED + 1, keys, LOG_ID);
    const asc = sc.ops.map((_, k) => k).sort((a, b) => compareOpOrder(sc.ops[a], sc.ops[b]));
    expect(await controlHash(sc.ops, asc)).toBe(await oracleHash(sc.ops));
  });

  it("PC3 a replica fed ascending total order equals the oracle; a partial feed does not", async () => {
    const sc = await generateScenario(BASE_SEED + 2, keys, LOG_ID);
    const asc = sc.ops.map((_, k) => k).sort((a, b) => compareOpOrder(sc.ops[a], sc.ops[b]));
    const r = await openReceiver(sc, "pc3", keys, LOG_ID);
    await deliver(r, sc, asc.slice(0, asc.length >> 1));
    const half = await r.stateHash();
    await deliver(r, sc, asc.slice(asc.length >> 1));
    const full = await r.stateHash();
    expect(full).toBe(await oracleHash(sc.ops));
    expect(half).not.toBe(full);
    // so a later re-apply that leaves `full` unchanged is a real observation
    const re = await deliver(r, sc, asc);
    expect(re.applied).toBe(0);
    expect(await r.stateHash()).toBe(full);
  });

  it("PC4 oracle ignores duplicate ops and equals itself under shuffling of its input", async () => {
    const sc = await generateScenario(BASE_SEED + 3, keys, LOG_ID);
    const h = await oracleHash(sc.ops);
    const shuffled = sc.ops.concat(sc.ops.slice(0, 10)).reverse();
    expect(await oracleHash(shuffled)).toBe(h);
    expect(Object.keys(oracleRegisters(sc.ops)).length).toBeGreaterThan(0);
  });
});

describe("Prng independence", () => {
  it("(a) advancing one Prng(42) does not affect another", () => {
    const kat = new Prng(42).nextU32();
    const a = new Prng(42);
    const b = new Prng(42);
    for (let i = 0; i < 100; i++) a.nextU32();
    expect(b.nextU32(), "ASSERT prng-instances-independent").toBe(kat);
  });

  it("(b) fork(dev0) and fork(dev1) are distinct objects with different streams and do not advance the parent", () => {
    const parent = new Prng(7);
    const d0 = parent.fork("dev0");
    const d1 = parent.fork("dev1");
    expect(d0 === (parent as unknown), "ASSERT fork-returns-new-object").toBe(false);
    expect(d0 === d1, "ASSERT fork-labels-give-distinct-objects").toBe(false);
    expect(d0.nextU32(), "ASSERT fork-labels-differ").not.toBe(d1.nextU32());
    expect(parent.nextU32(), "ASSERT fork-leaves-parent-untouched").toBe(new Prng(7).nextU32());
    const x = new Prng(9).fork("l");
    const y = new Prng(9).fork("l");
    expect(x.nextU32(), "ASSERT fork-same-seed-same-label-reproducible").toBe(y.nextU32());
  });
});

describe("convergence fuzz", () => {
  let first: Summary;

  it(`converges across ${TRIALS} seeded trials with non-vacuity metrics`, async () => {
    first = await runSuite(TRIALS);
    printMetrics(first);
    expect(first.conflictTrials, "ASSERT metric conflicting-registers >=90% of trials").toBeGreaterThanOrEqual(Math.ceil(0.9 * TRIALS));
    expect(first.distinctOracleHashes, "ASSERT metric distinct-oracle-hashes >=0.9*trials").toBeGreaterThanOrEqual(0.9 * TRIALS);
    expect(first.duplicates, "ASSERT metric duplicates-delivered >0").toBeGreaterThan(0);
    expect(first.outOfOrder, "ASSERT metric out-of-order-pairs >0").toBeGreaterThan(0);
    expect(first.outOfOrderMinTrial, "ASSERT metric out-of-order-pairs >0 in every trial").toBeGreaterThan(0);
    expect(first.controlDiverged, "ASSERT metric arrival-order-control-diverges >=50% of trials").toBeGreaterThanOrEqual(Math.ceil(0.5 * TRIALS));
    expect(first.causalLifts, "ASSERT metric hlc-recv-was-exercised (causal lifts >0)").toBeGreaterThan(0);
    expect(first.causalViolations, "ASSERT hlc-causality-violations-zero").toBe(0);
  }, 300_000);

  it("is deterministic: a second in-process run gives the same suite hash", async () => {
    const second = await runSuite(TRIALS);
    process.stderr.write(`METRIC suite_hash_run2=${second.suiteHash}\n`);
    expect(second.suiteHash, "ASSERT suite-hash-deterministic").toBe(first.suiteHash);
  }, 300_000);
});
