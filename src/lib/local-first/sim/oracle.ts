/**
 * Convergence oracle. PROTOTYPE, unreviewed.
 *
 * An INDEPENDENT algorithm: collect every unique op, expand it into register writes, sort the writes
 * of each register by the total order (hlc.ms, hlc.counter, deviceId, opId) and keep the maximum.
 * No incremental apply, no import from merge/ (comparator and key format are re-implemented here).
 */
import { canonicalJson } from "../oplog/canon";
import type { JsonValue, Op } from "../oplog/types";

export interface OracleRegister {
  value: JsonValue;
  hlc: { ms: number; counter: number };
  deviceId: string;
  opId: string;
}

interface Write {
  key: string;
  value: JsonValue;
  op: Op;
}

/** Total order on ops: -1, 0 or 1. */
export function compareOpOrder(a: Op, b: Op): number {
  if (a.hlc.ms !== b.hlc.ms) return a.hlc.ms < b.hlc.ms ? -1 : 1;
  if (a.hlc.counter !== b.hlc.counter) return a.hlc.counter < b.hlc.counter ? -1 : 1;
  if (a.deviceId !== b.deviceId) return a.deviceId < b.deviceId ? -1 : 1;
  if (a.opId !== b.opId) return a.opId < b.opId ? -1 : 1;
  return 0;
}

/** Register writes of one op: upsert = its fields + _deleted:false; delete = _deleted:true only. */
export function opWrites(op: Op): Array<{ key: string; value: JsonValue }> {
  const base = `${op.entity}|${op.rowId}|`;
  if (op.kind === "delete") return [{ key: base + "_deleted", value: true }];
  const out: Array<{ key: string; value: JsonValue }> = [];
  for (const f of Object.keys(op.fields)) out.push({ key: base + f, value: op.fields[f] });
  out.push({ key: base + "_deleted", value: false });
  return out;
}

/** Final register map for a set of ops (duplicates by opId are collapsed). */
export function oracleRegisters(ops: readonly Op[]): Record<string, OracleRegister> {
  const seen = new Set<string>();
  const byKey = new Map<string, Write[]>();
  for (const op of ops) {
    if (seen.has(op.opId)) continue;
    seen.add(op.opId);
    for (const w of opWrites(op)) {
      let list = byKey.get(w.key);
      if (list === undefined) {
        list = [];
        byKey.set(w.key, list);
      }
      list.push({ key: w.key, value: w.value, op });
    }
  }
  const out: Record<string, OracleRegister> = {};
  for (const key of Array.from(byKey.keys()).sort()) {
    const sorted = (byKey.get(key) as Write[]).slice().sort((x, y) => compareOpOrder(x.op, y.op));
    const win = sorted[sorted.length - 1];
    out[key] = {
      value: win.value,
      hlc: { ms: win.op.hlc.ms, counter: win.op.hlc.counter },
      deviceId: win.op.deviceId,
      opId: win.op.opId,
    };
  }
  return out;
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
  let hex = "";
  for (const b of digest) hex += b.toString(16).padStart(2, "0");
  return hex;
}

/** Same digest recipe as MergeState.hash(): sha256 of canonical JSON of the register map. */
export function hashRegisters(regs: Record<string, OracleRegister>): Promise<string> {
  return sha256Hex(canonicalJson(regs));
}

export function oracleHash(ops: readonly Op[]): Promise<string> {
  return hashRegisters(oracleRegisters(ops));
}

/** Registers written by two or more distinct devices. */
export function conflictingRegisters(ops: readonly Op[]): number {
  const writers = new Map<string, Set<string>>();
  for (const op of ops) {
    for (const w of opWrites(op)) {
      let s = writers.get(w.key);
      if (s === undefined) {
        s = new Set<string>();
        writers.set(w.key, s);
      }
      s.add(op.deviceId);
    }
  }
  let n = 0;
  for (const s of writers.values()) if (s.size >= 2) n++;
  return n;
}
