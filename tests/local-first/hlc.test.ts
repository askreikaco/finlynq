import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createHlc, pack, unpack, compareHlc, MAX_DRIFT_MS } from "@/lib/local-first/clock/hlc";

describe("hlc pack/unpack", () => {
  it("packs 48-bit ms and 16-bit counter big-endian into 8 bytes", () => {
    const b = pack({ ms: 0x010203040506, counter: 0x0708 });
    expect(Array.from(b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("round-trips edge values", () => {
    const cases = [
      { ms: 0, counter: 0 },
      { ms: 1, counter: 65535 },
      { ms: 2 ** 48 - 1, counter: 65535 },
      { ms: 1_700_000_000_123, counter: 42 },
    ];
    for (const c of cases) expect(unpack(pack(c))).toEqual(c);
  });

  it("rejects out-of-range fields and wrong byte length", () => {
    expect(() => pack({ ms: 2 ** 48, counter: 0 })).toThrow(RangeError);
    expect(() => pack({ ms: 0, counter: 65536 })).toThrow(RangeError);
    expect(() => pack({ ms: -1, counter: 0 })).toThrow(RangeError);
    expect(() => unpack(new Uint8Array(7))).toThrow(RangeError);
  });

  it("source uses no bigint literals (ES2017 target)", () => {
    const src = readFileSync(join(process.cwd(), "src/lib/local-first/clock/hlc.ts"), "utf8");
    expect(/\b(0x[0-9a-fA-F]+|\d+)n\b/.test(src)).toBe(false);
    expect(/BigInt/.test(src)).toBe(false);
  });

  it("compareHlc orders by ms then counter", () => {
    expect(compareHlc({ ms: 1, counter: 9 }, { ms: 2, counter: 0 })).toBe(-1);
    expect(compareHlc({ ms: 2, counter: 1 }, { ms: 2, counter: 0 })).toBe(1);
    expect(compareHlc({ ms: 2, counter: 1 }, { ms: 2, counter: 1 })).toBe(0);
  });
});

describe("hlc send/recv", () => {
  it("send is strictly increasing when the clock is frozen or regresses", () => {
    let t = 1000;
    const c = createHlc({ now: () => t });
    const a = c.send();
    const b = c.send();
    t = 500; // regression
    const d = c.send();
    expect(compareHlc(b, a)).toBe(1);
    expect(compareHlc(d, b)).toBe(1);
    expect(d.ms).toBe(1000);
  });

  it("send resets the counter when physical time advances", () => {
    let t = 1000;
    const c = createHlc({ now: () => t });
    c.send();
    c.send();
    t = 1001;
    expect(c.send()).toEqual({ ms: 1001, counter: 0 });
  });

  it("recv result is strictly after both the local last value and the remote value", () => {
    const t = 1000;
    const c = createHlc({ now: () => t });
    c.send();
    const r = c.recv({ ms: 1000, counter: 5 });
    expect(compareHlc(r, { ms: 1000, counter: 5 })).toBe(1);
    expect(r).toEqual({ ms: 1000, counter: 6 });
  });

  it("recv takes the remote counter into account when ms ties (remote counter 5 gives 6)", () => {
    const t = 1000;
    const c = createHlc({ now: () => t });
    c.send(); // local last = {1000, 0}: remote ties local ms
    const r = c.recv({ ms: 1000, counter: 5 });
    expect(r.counter).toBe(6);
  });

  it("recv adopts a remote ms ahead of local and resets counter to remote+1", () => {
    const t = 1000;
    const c = createHlc({ now: () => t });
    expect(c.recv({ ms: 1500, counter: 3 })).toEqual({ ms: 1500, counter: 4 });
  });

  it("accepts a remote exactly 24h ahead and rejects one beyond it", () => {
    const t = 1_700_000_000_000;
    const c = createHlc({ now: () => t });
    expect(() => c.recv({ ms: t + MAX_DRIFT_MS, counter: 0 })).not.toThrow();
    expect(() => c.recv({ ms: t + MAX_DRIFT_MS + 1, counter: 0 })).toThrow(RangeError);
  });

  it("counter overflow throws", () => {
    const c = createHlc({ now: () => 1000 });
    c.send(); // counter 0
    for (let i = 1; i <= 65535; i++) c.send(); // counter reaches 65535
    expect(() => c.send()).toThrow(RangeError);
  });
});
