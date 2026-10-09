/**
 * Per-field LWW register state. PROTOTYPE, unreviewed.
 *
 * Register key: `entity|rowId|field`. `_deleted` is an ordinary field (D7).
 *  - upsert op: writes each field in `fields` plus `_deleted = false`.
 *  - delete op: writes `_deleted = true` only; `fields` is ignored.
 * A write replaces the register only when its order key is greater (compareOrder).
 *
 * Applied set: per deviceId, sorted disjoint inclusive [from,to] seq ranges.
 * A duplicate (deviceId, seq) is a no-op: registers and ranges are left unchanged.
 */
import type { Hlc } from "../clock/hlc";
import { canonicalJson } from "../oplog/canon";
import type { JsonValue, Op } from "../oplog/types";
import { compareOrder } from "./compare";

export const DELETED_FIELD = "_deleted";

export interface Register {
  value: JsonValue;
  hlc: Hlc;
  deviceId: string;
  opId: string;
}

export type ApplyResult = "applied" | "duplicate";

export type SeqRange = [number, number];

export function regKey(entity: string, rowId: string, field: string): string {
  for (const part of [entity, rowId, field]) {
    if (part.includes("|")) throw new RangeError("register key part must not contain '|'");
  }
  return `${entity}|${rowId}|${field}`;
}

export function splitRegKey(key: string): { entity: string; rowId: string; field: string } {
  const parts = key.split("|");
  if (parts.length !== 3) throw new Error("malformed register key");
  return { entity: parts[0], rowId: parts[1], field: parts[2] };
}

function rangesContain(ranges: SeqRange[], seq: number): boolean {
  for (const [from, to] of ranges) {
    if (seq >= from && seq <= to) return true;
    if (from > seq) return false;
  }
  return false;
}

function addRange(ranges: SeqRange[], seq: number): void {
  let i = 0;
  while (i < ranges.length && ranges[i][1] + 1 < seq) i++;
  let lo = seq;
  let hi = seq;
  let j = i;
  while (j < ranges.length && ranges[j][0] <= hi + 1) {
    if (ranges[j][0] < lo) lo = ranges[j][0];
    if (ranges[j][1] > hi) hi = ranges[j][1];
    j++;
  }
  ranges.splice(i, j - i, [lo, hi]);
}

export class MergeState {
  private readonly regs = new Map<string, Register>();
  private readonly applied = new Map<string, SeqRange[]>();

  /** Applies one op. Returns "duplicate" (no change) when (deviceId, seq) was already applied. */
  apply(op: Op): ApplyResult {
    if (this.hasApplied(op.deviceId, op.seq)) return "duplicate";
    if (!Number.isInteger(op.seq) || op.seq < 0) throw new RangeError("seq must be a non-negative integer");

    const writes: Array<[string, JsonValue]> = [];
    if (op.kind === "delete") {
      writes.push([regKey(op.entity, op.rowId, DELETED_FIELD), true]);
    } else {
      for (const field of Object.keys(op.fields)) {
        if (field === DELETED_FIELD) throw new RangeError("upsert must not set _deleted directly");
        writes.push([regKey(op.entity, op.rowId, field), op.fields[field]]);
      }
      writes.push([regKey(op.entity, op.rowId, DELETED_FIELD), false]);
    }

    const cand = { hlc: op.hlc, deviceId: op.deviceId, opId: op.opId };
    for (const [key, value] of writes) {
      const cur = this.regs.get(key);
      if (cur === undefined || compareOrder(cand, cur) > 0) {
        this.regs.set(key, { value, hlc: { ms: op.hlc.ms, counter: op.hlc.counter }, deviceId: op.deviceId, opId: op.opId });
      }
    }
    this.markApplied(op.deviceId, op.seq);
    return "applied";
  }

  get(entity: string, rowId: string, field: string): Register | undefined {
    return this.regs.get(regKey(entity, rowId, field));
  }

  hasApplied(deviceId: string, seq: number): boolean {
    const ranges = this.applied.get(deviceId);
    return ranges !== undefined && rangesContain(ranges, seq);
  }

  /** Highest applied seq for a device, or -1. */
  maxSeq(deviceId: string): number {
    const ranges = this.applied.get(deviceId);
    return ranges && ranges.length > 0 ? ranges[ranges.length - 1][1] : -1;
  }

  private markApplied(deviceId: string, seq: number): void {
    let ranges = this.applied.get(deviceId);
    if (ranges === undefined) {
      ranges = [];
      this.applied.set(deviceId, ranges);
    }
    addRange(ranges, seq);
  }

  /** All registers keyed by `entity|rowId|field`. */
  exportRegisters(): Record<string, Register> {
    const out: Record<string, Register> = {};
    for (const key of Array.from(this.regs.keys()).sort()) {
      const r = this.regs.get(key) as Register;
      out[key] = { value: r.value, hlc: { ms: r.hlc.ms, counter: r.hlc.counter }, deviceId: r.deviceId, opId: r.opId };
    }
    return out;
  }

  exportApplied(): Record<string, SeqRange[]> {
    const out: Record<string, SeqRange[]> = {};
    for (const dev of Array.from(this.applied.keys()).sort()) {
      out[dev] = (this.applied.get(dev) as SeqRange[]).map(([a, b]) => [a, b] as SeqRange);
    }
    return out;
  }

  /** Rebuilds state from exported parts (no validation beyond shape; callers authenticate first). */
  static fromParts(registers: Record<string, Register>, applied: Record<string, SeqRange[]>): MergeState {
    const s = new MergeState();
    for (const key of Object.keys(registers)) {
      s.regs.set(key, registers[key]);
    }
    for (const dev of Object.keys(applied)) {
      s.applied.set(dev, applied[dev].map(([a, b]) => [a, b] as SeqRange));
    }
    return s;
  }

  /** sha256 (hex) over canonical JSON of the registers. Applied ranges are not hashed. */
  async hash(): Promise<string> {
    const bytes = new TextEncoder().encode(canonicalJson(this.exportRegisters()));
    const digest = new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", bytes));
    let hex = "";
    for (const b of digest) hex += b.toString(16).padStart(2, "0");
    return hex;
  }
}
