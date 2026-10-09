// PROTOTYPE, unreviewed. Per-field LWW merge state, dedupe, projection.
import { describe, it, expect } from "vitest";
import { MergeState, regKey } from "@/lib/local-first/merge/state";
import { project } from "@/lib/local-first/merge/project";
import { compareOrder } from "@/lib/local-first/merge/compare";
import type { Op, OpKind } from "@/lib/local-first/oplog/types";

const OP_A = "01AAAAAAAAAAAAAAAAAAAAAAAA";
const OP_B = "01BBBBBBBBBBBBBBBBBBBBBBBB";
const OP_C = "01CCCCCCCCCCCCCCCCCCCCCCCC";
const T0 = 1_700_000_000_000;

function mk(
  deviceId: string,
  opId: string,
  seq: number,
  ms: number,
  kind: OpKind,
  rowId: string,
  fields: Op["fields"],
  counter = 0,
): Op {
  return { entity: "transactions", rowId, kind, fields, deviceId, opId, seq, hlc: { ms: T0 + ms, counter } };
}

function applyAll(ops: Op[]): MergeState {
  const s = new MergeState();
  for (const o of ops) s.apply(o);
  return s;
}

describe("per-field LWW", () => {
  it("higher HLC wins when the newer op arrives first and the older op arrives later", () => {
    const s = applyAll([mk("dev-a", OP_B, 1, 20, "upsert", "r1", { note: "new" }), mk("dev-a", OP_A, 0, 10, "upsert", "r1", { note: "old" })]);
    expect(s.get("transactions", "r1", "note")?.value).toBe("new");
  });

  it("a stale write does not overwrite a newer register (arrival order: older first)", () => {
    const s = applyAll([mk("dev-a", OP_A, 0, 10, "upsert", "r1", { note: "old" }), mk("dev-a", OP_B, 1, 20, "upsert", "r1", { note: "new" })]);
    expect(s.get("transactions", "r1", "note")?.value).toBe("new");
    const stale = applyAll([mk("dev-a", OP_B, 1, 20, "upsert", "r1", { note: "new" })]);
    stale.apply(mk("dev-b", OP_C, 0, 5, "upsert", "r1", { note: "stale" }));
    expect(stale.get("transactions", "r1", "note")?.value).toBe("new");
  });

  it("per-field: edits to different fields of one row both survive", () => {
    const s = applyAll([
      mk("dev-a", OP_A, 0, 10, "upsert", "r1", { amount: 5 }),
      mk("dev-b", OP_B, 0, 11, "upsert", "r1", { note: "lunch" }),
    ]);
    expect(s.get("transactions", "r1", "amount")?.value).toBe(5);
    expect(s.get("transactions", "r1", "note")?.value).toBe("lunch");
  });

  it("same HLC: deviceId breaks the tie, in both arrival orders", () => {
    // opId of dev-a is larger than opId of dev-b, so only the deviceId comparison can pick dev-b.
    const opA = mk("dev-a", "01ZZZZZZZZZZZZZZZZZZZZZZZZ", 0, 10, "upsert", "r1", { note: "from-a" });
    const opB = mk("dev-b", "01AAAAAAAAAAAAAAAAAAAAAAAA", 0, 10, "upsert", "r1", { note: "from-b" });
    expect(applyAll([opA, opB]).get("transactions", "r1", "note")?.value).toBe("from-b");
    expect(applyAll([opB, opA]).get("transactions", "r1", "note")?.value).toBe("from-b");
    expect(compareOrder(opA, opB)).toBe(-1);
  });

  it("same HLC and deviceId: opId breaks the tie", () => {
    const lo = mk("dev-a", OP_A, 0, 10, "upsert", "r1", { note: "lo" });
    const hi = mk("dev-a", OP_B, 1, 10, "upsert", "r1", { note: "hi" });
    expect(applyAll([hi, lo]).get("transactions", "r1", "note")?.value).toBe("hi");
    expect(applyAll([lo, hi]).get("transactions", "r1", "note")?.value).toBe("hi");
  });

  it("delete vs concurrent edit: later delete wins and the row is omitted", () => {
    const s = applyAll([
      mk("dev-a", OP_A, 0, 10, "upsert", "r1", { note: "edit" }),
      mk("dev-b", OP_B, 0, 11, "delete", "r1", {}),
    ]);
    expect(s.get("transactions", "r1", "_deleted")?.value).toBe(true);
    expect(project(s)).toEqual({});
  });

  it("delete vs concurrent edit: later edit wins over an earlier delete and the row is present", () => {
    const s = applyAll([
      mk("dev-b", OP_B, 0, 10, "delete", "r1", {}),
      mk("dev-a", OP_A, 0, 11, "upsert", "r1", { note: "back" }),
    ]);
    expect(s.get("transactions", "r1", "_deleted")?.value).toBe(false);
    expect(project(s)).toEqual({ transactions: [{ id: "r1", note: "back" }] });
  });
});

describe("convergence and dedupe", () => {
  it("state hash is the same for all 6 arrival orders of 3 ops", async () => {
    const ops = [
      mk("dev-a", OP_A, 0, 10, "upsert", "r1", { note: "x", amount: 1 }),
      mk("dev-b", OP_B, 0, 10, "upsert", "r1", { note: "y" }),
      mk("dev-c", OP_C, 0, 12, "delete", "r1", {}),
    ];
    const perms = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];
    const hashes = new Set<string>();
    for (const p of perms) hashes.add(await applyAll(p.map((i) => ops[i])).hash());
    expect(hashes.size).toBe(1);
  });

  it("duplicate op is a no-op: result, registers and applied ranges are unchanged", async () => {
    const s = new MergeState();
    const op = mk("dev-a", OP_A, 0, 10, "upsert", "r1", { note: "x" });
    expect(s.apply(op)).toBe("applied");
    const before = await s.hash();
    const ranges = JSON.stringify(s.exportApplied());
    expect(s.apply(op)).toBe("duplicate");
    expect(await s.hash()).toBe(before);
    expect(JSON.stringify(s.exportApplied())).toBe(ranges);
  });

  it("applied ranges merge adjacent and overlapping seqs per device", () => {
    const s = new MergeState();
    for (const seq of [0, 1, 2, 5]) s.apply(mk("dev-a", "01" + String(seq).padStart(24, "0"), seq, 10 + seq, "upsert", "r" + seq, { n: seq }));
    expect(s.exportApplied()).toEqual({ "dev-a": [[0, 2], [5, 5]] });
    s.apply(mk("dev-a", "01" + "3".repeat(24), 3, 13, "upsert", "r3", { n: 3 }));
    s.apply(mk("dev-a", "01" + "4".repeat(24), 4, 14, "upsert", "r4", { n: 4 }));
    expect(s.exportApplied()).toEqual({ "dev-a": [[0, 5]] });
    expect(s.maxSeq("dev-a")).toBe(5);
    expect(s.maxSeq("dev-x")).toBe(-1);
  });
});

describe("projection and guards", () => {
  it("project sorts rows, omits deleted rows, and sets id from rowId", () => {
    const s = applyAll([
      mk("dev-a", OP_A, 0, 10, "upsert", "r2", { amount: 2 }),
      mk("dev-a", OP_B, 1, 11, "upsert", "r1", { amount: 1 }),
      mk("dev-a", OP_C, 2, 12, "upsert", "r3", { amount: 3 }),
      mk("dev-b", "01DDDDDDDDDDDDDDDDDDDDDDDD", 0, 13, "delete", "r2", {}),
    ]);
    expect(project(s)).toEqual({
      transactions: [
        { id: "r1", amount: 1 },
        { id: "r3", amount: 3 },
      ],
    });
  });

  it("stateHash changes when a register value changes", async () => {
    const s = applyAll([mk("dev-a", OP_A, 0, 10, "upsert", "r1", { note: "x" })]);
    const h1 = await s.hash();
    s.apply(mk("dev-a", OP_B, 1, 20, "upsert", "r1", { note: "y" }));
    expect(await s.hash()).not.toBe(h1);
  });

  it("regKey rejects '|' in any part", () => {
    expect(() => regKey("tx|x", "r1", "note")).toThrow(RangeError);
    expect(() => regKey("transactions", "r|1", "note")).toThrow(RangeError);
    expect(() => regKey("transactions", "r1", "no|te")).toThrow(RangeError);
  });

  it("upsert rejects a field named _deleted and applies nothing", () => {
    const s = new MergeState();
    expect(() => s.apply(mk("dev-a", OP_A, 0, 10, "upsert", "r1", { _deleted: true }))).toThrow(RangeError);
    expect(s.exportRegisters()).toEqual({});
    expect(s.hasApplied("dev-a", 0)).toBe(false);
  });

  it("delete op writes only _deleted and ignores fields", () => {
    const s = applyAll([mk("dev-a", OP_A, 0, 10, "delete", "r1", { note: "ignored" })]);
    expect(Object.keys(s.exportRegisters())).toEqual(["transactions|r1|_deleted"]);
  });
});
