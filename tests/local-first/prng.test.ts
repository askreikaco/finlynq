import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Prng } from "@/lib/local-first/sim/prng";

// Known answers for seed 42 (cross-checked: Node splitmix32 run and an independent Python run).
const KAT_SEED_42 = [939911724, 3948730756, 321366731, 3317318717, 527392959];

describe("Prng known answers", () => {
  it("seed 42 first 5 outputs match the pinned values", () => {
    const p = new Prng(42);
    const out = [0, 1, 2, 3, 4].map(() => p.nextU32());
    expect(out).toEqual(KAT_SEED_42);
  });

  it("nextFloat is in [0,1) and int stays in bounds", () => {
    const p = new Prng(7);
    for (let i = 0; i < 1000; i++) {
      const f = p.nextFloat();
      expect(f >= 0 && f < 1).toBe(true);
      const n = p.int(3, 9);
      expect(Number.isInteger(n) && n >= 3 && n <= 9).toBe(true);
    }
    expect(() => p.int(5, 4)).toThrow(RangeError);
  });
});

describe("Prng independence", () => {
  it("(a) advancing one instance does not affect another instance with the same seed", () => {
    const a = new Prng(42);
    const b = new Prng(42);
    for (let i = 0; i < 100; i++) a.nextU32();
    expect(b.nextU32()).toBe(KAT_SEED_42[0]);
  });

  it("fork does not advance or share the parent state", () => {
    const parent = new Prng(42);
    const ref = new Prng(42);
    const child = parent.fork("dev0");
    for (let i = 0; i < 100; i++) child.nextU32();
    expect(parent.nextU32()).toBe(ref.nextU32());
  });

  it("(b) fork('dev0') and fork('dev1') produce different outputs", () => {
    const p = new Prng(42);
    const a = p.fork("dev0").nextU32();
    const b = p.fork("dev1").nextU32();
    expect(a).not.toBe(b);
    const c = p.fork("dev0").nextU32();
    expect(c).toBe(a);
  });
});

describe("lint: sim/ must not use ambient time or randomness", () => {
  const simDir = join(process.cwd(), "src/lib/local-first/sim");
  const banned = /Math\.random|Date\.now|performance\.now/;

  it("control: the banned pattern does match a sample", () => {
    expect(banned.test("const x = Math.random();")).toBe(true);
  });

  it("no src/lib/local-first/sim/*.ts file uses Math.random, Date.now or performance.now", () => {
    const files = readdirSync(simDir).filter((f) => f.endsWith(".ts"));
    expect(files.length).toBeGreaterThan(0);
    const hits: string[] = [];
    for (const f of files) {
      const src = readFileSync(join(simDir, f), "utf8");
      if (banned.test(src)) hits.push(f);
    }
    expect(hits).toEqual([]);
  });
});
