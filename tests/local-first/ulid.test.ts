import { describe, it, expect } from "vitest";
import { createUlidFactory, encodeTime } from "@/lib/local-first/oplog/ulid";
import { Prng } from "@/lib/local-first/sim/prng";

const CROCKFORD = /^[0-9A-HJKMNP-TV-Z]{26}$/;

describe("ulid", () => {
  it("encodes 48-bit time as 10 chars, decodable back to ms", () => {
    expect(encodeTime(0)).toBe("0000000000");
    expect(encodeTime(1)).toBe("0000000001");
    expect(encodeTime(32)).toBe("0000000010");
    expect(encodeTime(2 ** 48 - 1)).toBe("7ZZZZZZZZZ");
    expect(() => encodeTime(-1)).toThrow(RangeError);
    expect(() => encodeTime(2 ** 48)).toThrow(RangeError);
  });

  it("issues 26-char Crockford ids with the injected time prefix", () => {
    const rng = new Prng(1);
    const next = createUlidFactory({
      now: () => 1_700_000_000_000,
      random: (n) => Uint8Array.from({ length: n }, () => rng.nextU32() & 0xff),
    });
    const id = next();
    expect(id).toMatch(CROCKFORD);
    expect(id.slice(0, 10)).toBe(encodeTime(1_700_000_000_000));
  });

  it("100k ids are unique and strictly monotonic even when the clock regresses", () => {
    const rng = new Prng(0x5eed);
    let i = 0;
    // clock advances, repeats, and jumps backwards every 7th call
    const now = () => {
      i++;
      if (i % 7 === 0) return 1_700_000_000_000 + (i % 50) - 500;
      return 1_700_000_000_000 + Math.floor(i / 3);
    };
    const next = createUlidFactory({
      now,
      random: (n) => Uint8Array.from({ length: n }, () => rng.nextU32() & 0xff),
    });
    const ids: string[] = [];
    for (let k = 0; k < 100_000; k++) ids.push(next());
    expect(new Set(ids).size).toBe(100_000);
    let monotonic = true;
    for (let k = 1; k < ids.length; k++) {
      if (!(ids[k] > ids[k - 1])) {
        monotonic = false;
        break;
      }
    }
    expect(monotonic).toBe(true);
  });

  it("throws on random overflow within one ms (all 0xff)", () => {
    const next = createUlidFactory({
      now: () => 5,
      random: (n) => new Uint8Array(n).fill(0xff),
    });
    next();
    expect(() => next()).toThrow(RangeError);
  });
});
