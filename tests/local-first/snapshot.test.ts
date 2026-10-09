// PROTOTYPE, unreviewed. Snapshot envelope, replay-from-snapshot, dedupe after restore, replica paths.
import { describe, it, expect, beforeAll } from "vitest";
import { deriveKeysFromPassphrase, type Argon2Params, type LogKeys } from "@/lib/local-first/crypto/kdf";
import { AuthError } from "@/lib/local-first/crypto/aead";
import { createHlc, MAX_DRIFT_MS } from "@/lib/local-first/clock/hlc";
import { createUlidFactory } from "@/lib/local-first/oplog/ulid";
import { encodeFrame } from "@/lib/local-first/oplog/frame";
import { AppendOnlyViolation, UnsupportedVersionError } from "@/lib/local-first/oplog/errors";
import { MemoryLogStore, type LogStore } from "@/lib/local-first/oplog/log-store";
import { sealSnapshot, openSnapshot } from "@/lib/local-first/oplog/snapshot";
import { Replica } from "@/lib/local-first/oplog/replica";
import { MergeState } from "@/lib/local-first/merge/state";
import { project } from "@/lib/local-first/merge/project";
import { Prng } from "@/lib/local-first/sim/prng";
import type { Op } from "@/lib/local-first/oplog/types";

const TINY: Argon2Params = { m: 64, t: 1, p: 1, dkLen: 32 };
const SALT = new Uint8Array(16).map((_, i) => i + 9);
const LOG_ID = "log-snap";
const T0 = 1_700_000_000_000;
const DAY = 24 * 60 * 60 * 1000;

let keys: LogKeys;

beforeAll(async () => {
  keys = await deriveKeysFromPassphrase("snapshot test passphrase", SALT, LOG_ID, TINY);
});

function makeReplica(deviceId: string, log: LogStore, nowFn: () => number, rnd: Prng, logId = LOG_ID): Promise<Replica> {
  const clock = createHlc({ now: nowFn });
  const ulid = createUlidFactory({
    now: nowFn,
    random: (n) => {
      const b = new Uint8Array(n);
      for (let i = 0; i < n; i++) b[i] = rnd.nextU32() & 0xff;
      return b;
    },
  });
  return Replica.open({ deviceId, logId, keys, log, clock, newOpId: ulid });
}

function stepClock(base: number, skew: number): () => number {
  let t = base + skew;
  return () => t++;
}

/** Two writers, shuffled arrival log. Returns the genesis receiver and its log, plus frames in arrival order. */
async function buildHistory(): Promise<{ frames: Uint8Array[]; genesis: Replica; genesisLog: MemoryLogStore }> {
  const rnd = new Prng(42);
  const logA = new MemoryLogStore();
  const logB = new MemoryLogStore();
  const wA = await makeReplica("dev-a", logA, stepClock(T0, 0), new Prng(1));
  const wB = await makeReplica("dev-b", logB, stepClock(T0, 500), new Prng(2));
  for (let i = 0; i < 20; i++) {
    const rowId = "r" + rnd.int(1, 4);
    const del = rnd.nextFloat() < 0.2;
    await wA.localWrite("transactions", rowId, del ? "delete" : "upsert", del ? {} : { note: "a" + i, amount: i });
    const rowB = "r" + rnd.int(1, 4);
    const delB = rnd.nextFloat() < 0.2;
    await wB.localWrite("transactions", rowB, delB ? "delete" : "upsert", delB ? {} : { note: "b" + i, amount: -i });
    // Unique rows: each such frame is the only write to its registers, so dropping it changes the state.
    await wA.localWrite("transactions", "ua" + i, "upsert", { note: "ua" + i });
    await wB.localWrite("transactions", "ub" + i, "upsert", { note: "ub" + i });
  }
  const fa = (await logA.readFrom(0)).map((f) => f.bytes);
  const fb = (await logB.readFrom(0)).map((f) => f.bytes);
  const interleaved: Uint8Array[] = [];
  for (let i = 0; i < Math.max(fa.length, fb.length); i++) {
    if (i < fa.length) interleaved.push(fa[i]);
    if (i < fb.length) interleaved.push(fb[i]);
  }
  // Fisher-Yates with the seeded PRNG: the receiver sees out-of-order arrival.
  for (let i = interleaved.length - 1; i > 0; i--) {
    const j = rnd.int(0, i);
    [interleaved[i], interleaved[j]] = [interleaved[j], interleaved[i]];
  }
  const genesisLog = new MemoryLogStore();
  const genesis = await makeReplica("dev-g", genesisLog, stepClock(T0, 1000), new Prng(3));
  for (const f of interleaved) await genesis.receive(f);
  return { frames: interleaved, genesis, genesisLog };
}

describe("snapshot envelope", () => {
  it("round trip keeps registers, applied ranges, writer deviceId and createdHlc", async () => {
    const { genesis } = await buildHistory();
    const bytes = await genesis.snapshot();
    const opened = await openSnapshot(bytes, keys, LOG_ID);
    expect(await opened.state.hash()).toBe(await genesis.stateHash());
    expect(opened.state.exportApplied()).toEqual(genesis.state.exportApplied());
    expect(opened.deviceId).toBe("dev-g");
    const direct = await sealSnapshot(genesis.state, keys, LOG_ID, { ms: T0 + 7, counter: 3 }, "dev-g");
    const directOpened = await openSnapshot(direct, keys, LOG_ID);
    expect(directOpened.createdHlc).toEqual({ ms: T0 + 7, counter: 3 });
    expect(directOpened.deviceId).toBe("dev-g");
  });

  it("replay(snapshot at offset k + tail) hash equals genesis replay for 13 offsets", async () => {
    const { frames, genesis, genesisLog } = await buildHistory();
    const want = await genesis.stateHash();
    const n = frames.length;
    const offsets = [0, 1, 2, 5, 10, 20, 30, 40, 50, 60, 70, n - 1, n];
    let checked = 0;
    for (const k of offsets) {
      const partial = await makeReplica("dev-p", new MemoryLogStore(), stepClock(T0, 2000), new Prng(4));
      for (let i = 0; i < k; i++) await partial.receive(frames[i]);
      const snap = await partial.snapshot();
      const restored = await Replica.open({
        deviceId: "dev-r",
        logId: LOG_ID,
        keys,
        log: genesisLog,
        clock: createHlc({ now: stepClock(T0, 3000) }),
        newOpId: createUlidFactory({ now: stepClock(T0, 3000), random: () => new Uint8Array(10) }),
        snapshot: { bytes: snap, offset: k },
      });
      expect(await restored.stateHash()).toBe(want);
      checked++;
    }
    expect(checked).toBe(13);
    expect(n).toBeGreaterThan(70);
  });

  it("snapshot keeps _deleted registers: restored state still omits deleted rows", async () => {
    const rnd = new Prng(5);
    const log = new MemoryLogStore();
    const r = await makeReplica("dev-a", log, stepClock(T0, 0), rnd);
    await r.localWrite("transactions", "gone", "upsert", { note: "x" });
    await r.localWrite("transactions", "gone", "delete", {});
    await r.localWrite("transactions", "kept", "upsert", { note: "y" });
    const bytes = await r.snapshot();
    const opened = await openSnapshot(bytes, keys, LOG_ID);
    expect(opened.state.get("transactions", "gone", "_deleted")?.value).toBe(true);
    expect(project(opened.state)).toEqual({ transactions: [{ id: "kept", note: "y" }] });
  });

  it("header tamper (kind, createdHlc, devLen, deviceId) gives AuthError", async () => {
    const { genesis } = await buildHistory();
    const bytes = await genesis.snapshot();
    const headerEnd = 11 + 5; // "dev-g" is 5 bytes
    for (const off of [1, 3, 10, headerEnd - 1]) {
      const t = bytes.slice();
      t[off] ^= 0x01;
      await expect(openSnapshot(t, keys, LOG_ID)).rejects.toBeInstanceOf(AuthError);
    }
  });

  it("ciphertext, nonce and tag tamper gives AuthError", async () => {
    const { genesis } = await buildHistory();
    const bytes = await genesis.snapshot();
    const headerEnd = 11 + 5;
    for (const off of [headerEnd, headerEnd + 12, bytes.length - 1]) {
      const t = bytes.slice();
      t[off] ^= 0x80;
      await expect(openSnapshot(t, keys, LOG_ID)).rejects.toBeInstanceOf(AuthError);
    }
  });

  it("version byte other than 1 gives UnsupportedVersionError", async () => {
    const { genesis } = await buildHistory();
    const bytes = await genesis.snapshot();
    const t = bytes.slice();
    t[0] = 2;
    await expect(openSnapshot(t, keys, LOG_ID)).rejects.toBeInstanceOf(UnsupportedVersionError);
  });

  it("opening under a different logId gives AuthError (logId is bound in the AAD)", async () => {
    const { genesis } = await buildHistory();
    const bytes = await genesis.snapshot();
    await expect(openSnapshot(bytes, keys, "log-other")).rejects.toBeInstanceOf(AuthError);
  });

  it("snapshot is sealed under the snapshot key, not the oplog key", async () => {
    const swapped: LogKeys = { oplogKey: keys.snapshotKey, snapshotKey: keys.oplogKey };
    const st = new MergeState();
    const bytes = await sealSnapshot(st, keys, LOG_ID, { ms: T0, counter: 0 }, "dev-a");
    await expect(openSnapshot(bytes, swapped, LOG_ID)).rejects.toBeInstanceOf(AuthError);
    expect((await openSnapshot(bytes, keys, LOG_ID)).state.exportRegisters()).toEqual({});
  });

  it("dedupe survives snapshot restore: frames already in the snapshot are no-ops", async () => {
    const { frames, genesis, genesisLog } = await buildHistory();
    const k = 20;
    const partial = await makeReplica("dev-p", new MemoryLogStore(), stepClock(T0, 2000), new Prng(4));
    for (let i = 0; i < k; i++) await partial.receive(frames[i]);
    const restored = await Replica.open({
      deviceId: "dev-r",
      logId: LOG_ID,
      keys,
      log: genesisLog,
      clock: createHlc({ now: stepClock(T0, 3000) }),
      newOpId: createUlidFactory({ now: stepClock(T0, 3000), random: () => new Uint8Array(10) }),
      snapshot: { bytes: await partial.snapshot(), offset: k },
    });
    const before = await restored.stateHash();
    const logCount = await restored.offset();
    let dup = 0;
    for (let i = 0; i < k; i++) if ((await restored.receive(frames[i])) === "duplicate") dup++;
    expect(dup).toBe(k);
    expect(await restored.stateHash()).toBe(before);
    expect(await restored.offset()).toBe(logCount);
    expect(before).toBe(await genesis.stateHash());
  });
});

describe("replica paths", () => {
  it("localWrite logs one frame per write with consecutive seq and applies it", async () => {
    const log = new MemoryLogStore();
    const r = await makeReplica("dev-a", log, stepClock(T0, 0), new Prng(6));
    const op1 = await r.localWrite("transactions", "r1", "upsert", { note: "one" });
    const op2 = await r.localWrite("transactions", "r1", "upsert", { note: "two" });
    expect([op1.seq, op2.seq]).toEqual([0, 1]);
    expect(await r.offset()).toBe(2);
    expect(r.state.get("transactions", "r1", "note")?.value).toBe("two");
  });

  it("receive of a tampered frame gives AuthError and changes neither log nor state", async () => {
    const { frames, genesisLog } = await buildHistory();
    const fresh = await makeReplica("dev-f", new MemoryLogStore(), stepClock(T0, 0), new Prng(7));
    const before = await fresh.stateHash();
    const t = frames[0].slice();
    t[t.length - 1] ^= 0x01;
    await expect(fresh.receive(t)).rejects.toBeInstanceOf(AuthError);
    expect(await fresh.offset()).toBe(0);
    expect(await fresh.stateHash()).toBe(before);
    expect(await genesisLog.count()).toBe(frames.length);
  });

  it("receive of a frame more than 24 h ahead gives RangeError and no write", async () => {
    const log = new MemoryLogStore();
    const r = await makeReplica("dev-f", log, stepClock(T0, 0), new Prng(8));
    const far: Op = {
      entity: "transactions",
      rowId: "r1",
      kind: "upsert",
      fields: { note: "future" },
      deviceId: "dev-z",
      opId: "01ZZZZZZZZZZZZZZZZZZZZZZZZ",
      seq: 0,
      hlc: { ms: T0 + 2 * DAY, counter: 0 },
    };
    expect(MAX_DRIFT_MS).toBe(DAY);
    const frame = await encodeFrame(far, keys, LOG_ID);
    await expect(r.receive(frame)).rejects.toBeInstanceOf(RangeError);
    expect(await r.offset()).toBe(0);
    expect(r.state.hasApplied("dev-z", 0)).toBe(false);
  });

  it("receive of an already-applied frame returns duplicate and leaves the log unchanged", async () => {
    const { frames, genesisLog } = await buildHistory();
    const r = await makeReplica("dev-f", new MemoryLogStore(), stepClock(T0, 0), new Prng(9));
    expect(await r.receive(frames[0])).toBe("applied");
    expect(await r.receive(frames[0])).toBe("duplicate");
    expect(await r.offset()).toBe(1);
    expect(await genesisLog.count()).toBe(frames.length);
  });

  it("frame logged but not applied (crash between append and apply) is applied on receive", async () => {
    const log = new MemoryLogStore();
    const r = await makeReplica("dev-f", log, stepClock(T0, 0), new Prng(10));
    const op: Op = {
      entity: "transactions",
      rowId: "r9",
      kind: "upsert",
      fields: { note: "pending" },
      deviceId: "dev-z",
      opId: "01YYYYYYYYYYYYYYYYYYYYYYYY",
      seq: 0,
      hlc: { ms: T0 + 5, counter: 0 },
    };
    const frame = await encodeFrame(op, keys, LOG_ID);
    await log.append("dev-z", 0, frame);
    expect(await r.receive(frame)).toBe("applied");
    expect(await r.offset()).toBe(1);
    expect(r.state.get("transactions", "r9", "note")?.value).toBe("pending");
    // Logged but unapplied frame under seq 1, then a different frame with the same key: refused.
    const stored = await encodeFrame({ ...op, opId: "01XXXXXXXXXXXXXXXXXXXXXXXX", seq: 1 }, keys, LOG_ID);
    await log.append("dev-z", 1, stored);
    const conflicting = await encodeFrame({ ...op, opId: "01WWWWWWWWWWWWWWWWWWWWWWWW", seq: 1, fields: { note: "other" } }, keys, LOG_ID);
    await expect(r.receive(conflicting)).rejects.toBeInstanceOf(AppendOnlyViolation);
    expect(await log.count()).toBe(2);
    expect(r.state.hasApplied("dev-z", 1)).toBe(false);
  });

  it("restart from the log alone reproduces the hash and continues seq numbering", async () => {
    const log = new MemoryLogStore();
    const r1 = await makeReplica("dev-a", log, stepClock(T0, 0), new Prng(11));
    await r1.localWrite("transactions", "r1", "upsert", { note: "a" });
    await r1.localWrite("transactions", "r2", "delete", {});
    const hash = await r1.stateHash();
    const r2 = await makeReplica("dev-a", log, stepClock(T0, 100), new Prng(12));
    expect(await r2.stateHash()).toBe(hash);
    const op = await r2.localWrite("transactions", "r3", "upsert", { note: "c" });
    expect(op.seq).toBe(2);
    expect(await r2.offset()).toBe(3);
  });
});
