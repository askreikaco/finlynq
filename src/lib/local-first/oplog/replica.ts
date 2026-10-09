/**
 * Replica: local write path and receive path over the frame codec, log store and MergeState.
 * PROTOTYPE, unreviewed. Not wired into any live path.
 *
 * Write:   hlc tick -> op -> encodeFrame -> log.append -> state.apply
 * Receive: decodeFrame (AuthError rejects) -> skip if applied -> clock.recv -> log.append -> state.apply
 * Open:    optional snapshot at log offset k, then replay log frames from k (applied ones skipped).
 *
 * The snapshot's log offset k is supplied by the caller; the snapshot envelope does not store it.
 */
import type { HlcClock, Hlc } from "../clock/hlc";
import type { LogKeys } from "../crypto/kdf";
import { MergeState } from "../merge/state";
import { project, type RowSets } from "../merge/project";
import { AppendOnlyViolation } from "./errors";
import { decodeFrame, encodeFrame } from "./frame";
import type { LogStore } from "./log-store";
import { openSnapshot, sealSnapshot } from "./snapshot";
import type { JsonValue, Op, OpKind } from "./types";

export interface ReplicaOptions {
  deviceId: string;
  logId: string;
  keys: LogKeys;
  log: LogStore;
  clock: HlcClock;
  /** Returns a fresh 26-char ULID text. */
  newOpId: () => string;
}

export interface OpenOptions extends ReplicaOptions {
  snapshot?: { bytes: Uint8Array; offset: number };
}

export type ReceiveResult = "applied" | "duplicate";

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

export class Replica {
  private nextSeq: number;

  private constructor(
    private readonly opts: ReplicaOptions,
    readonly state: MergeState,
  ) {
    this.nextSeq = state.maxSeq(opts.deviceId) + 1;
  }

  static async open(opts: OpenOptions): Promise<Replica> {
    let state: MergeState;
    let offset = 0;
    if (opts.snapshot !== undefined) {
      state = (await openSnapshot(opts.snapshot.bytes, opts.keys, opts.logId)).state;
      offset = opts.snapshot.offset;
    } else {
      state = new MergeState();
    }
    const replica = new Replica(opts, state);
    const tail = await opts.log.readFrom(offset);
    for (const entry of tail) {
      const op = await decodeFrame(entry.bytes, opts.keys, opts.logId);
      if (state.hasApplied(op.deviceId, op.seq)) continue;
      opts.clock.recv(op.hlc);
      state.apply(op);
    }
    replica.nextSeq = state.maxSeq(opts.deviceId) + 1;
    return replica;
  }

  /** Local edit. Returns the op that was logged and applied. */
  async localWrite(entity: string, rowId: string, kind: OpKind, fields: { [key: string]: JsonValue }): Promise<Op> {
    const hlc: Hlc = this.opts.clock.send();
    const seq = this.nextSeq;
    const op: Op = {
      entity,
      rowId,
      kind,
      fields,
      deviceId: this.opts.deviceId,
      opId: this.opts.newOpId(),
      seq,
      hlc,
    };
    const frame = await encodeFrame(op, this.opts.keys, this.opts.logId);
    await this.opts.log.append(this.opts.deviceId, seq, frame);
    this.state.apply(op);
    this.nextSeq = seq + 1;
    return op;
  }

  /** Receive path for one frame from any device. AuthError and RangeError reject with no write. */
  async receive(frame: Uint8Array): Promise<ReceiveResult> {
    const op = await decodeFrame(frame, this.opts.keys, this.opts.logId);
    if (this.state.hasApplied(op.deviceId, op.seq)) return "duplicate";
    this.opts.clock.recv(op.hlc);
    try {
      await this.opts.log.append(op.deviceId, op.seq, frame);
    } catch (e) {
      // Logged earlier but not applied (crash between append and apply): accept only identical bytes.
      if (!(e instanceof AppendOnlyViolation)) throw e;
      const existing = await this.opts.log.get(op.deviceId, op.seq);
      if (existing === undefined || !bytesEqual(existing, frame)) throw e;
    }
    this.state.apply(op);
    return "applied";
  }

  async snapshot(): Promise<Uint8Array> {
    return sealSnapshot(this.state, this.opts.keys, this.opts.logId, this.opts.clock.last(), this.opts.deviceId);
  }

  offset(): Promise<number> {
    return this.opts.log.count();
  }

  stateHash(): Promise<string> {
    return this.state.hash();
  }

  rows(): RowSets {
    return project(this.state);
  }
}
