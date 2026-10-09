/**
 * Deterministic 32-bit PRNG (splitmix32 core). Per-instance state only; no module-level state.
 * fork(label) derives the child seed from the parent's ORIGINAL seed, so it neither advances
 * nor shares the parent's state. Used by the convergence simulator and fixtures (sim/ only).
 */

const GOLDEN_GAMMA = 0x9e3779b9;
const TWO_POW_32 = 4294967296;

function fnv1a32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function mix32(z: number): number {
  z = Math.imul(z ^ (z >>> 16), 0x85ebca6b);
  z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35);
  return (z ^ (z >>> 16)) >>> 0;
}

/** splitmix32 output for input x (x is taken mod 2^32). */
export function splitmix32(x: number): number {
  return mix32((x + GOLDEN_GAMMA) >>> 0);
}

export class Prng {
  private readonly seed0: number;
  private state: number;

  constructor(seed: number) {
    if (!Number.isInteger(seed)) throw new TypeError("Prng seed must be an integer");
    this.seed0 = seed >>> 0;
    this.state = this.seed0;
  }

  /** Next unsigned 32-bit integer. */
  nextU32(): number {
    this.state = (this.state + GOLDEN_GAMMA) >>> 0;
    return mix32(this.state);
  }

  /** Next float in [0, 1). */
  nextFloat(): number {
    return this.nextU32() / TWO_POW_32;
  }

  /** Integer in [lo, hi] inclusive. */
  int(lo: number, hi: number): number {
    if (!Number.isInteger(lo) || !Number.isInteger(hi)) throw new TypeError("Prng.int bounds must be integers");
    if (lo > hi) throw new RangeError(`Prng.int: lo ${lo} > hi ${hi}`);
    const span = hi - lo + 1;
    if (span > TWO_POW_32) throw new RangeError("Prng.int: span exceeds 2^32");
    return lo + (this.nextU32() % span);
  }

  /** Child generator. Does not advance or share this generator's state. */
  fork(label: string): Prng {
    if (typeof label !== "string") throw new TypeError("Prng.fork label must be a string");
    return new Prng(splitmix32(this.seed0 ^ fnv1a32(label)));
  }
}
