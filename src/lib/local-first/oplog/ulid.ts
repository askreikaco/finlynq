/**
 * Monotonic ULID (Crockford base32): 10 chars of 48-bit ms time + 16 chars of 80-bit randomness.
 * Time and randomness are injected. Within one ms the random part is incremented, and a clock
 * that goes backwards is clamped to the last issued time, so output is strictly increasing.
 */

const ENCODING = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const TIME_LEN = 10;
const RAND_BYTES = 10;
const MAX_TIME = 2 ** 48 - 1;

export interface UlidOptions {
  now?: () => number;
  random?: (n: number) => Uint8Array;
}

export function encodeTime(ms: number): string {
  if (!Number.isInteger(ms) || ms < 0 || ms > MAX_TIME) throw new RangeError(`ULID time out of range: ${ms}`);
  let t = ms;
  const out = new Array<string>(TIME_LEN);
  for (let i = TIME_LEN - 1; i >= 0; i--) {
    out[i] = ENCODING[t % 32];
    t = Math.floor(t / 32);
  }
  return out.join("");
}

export function encodeRandom(bytes: Uint8Array): string {
  if (bytes.length !== RAND_BYTES) throw new RangeError("ULID random must be 10 bytes");
  let out = "";
  let acc = 0;
  let bits = 0;
  for (const byte of bytes) {
    acc = (acc << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      out += ENCODING[(acc >>> bits) & 31];
    }
    acc &= (1 << bits) - 1;
  }
  return out;
}

function defaultRandom(n: number): Uint8Array {
  const b = new Uint8Array(n);
  globalThis.crypto.getRandomValues(b);
  return b;
}

export function createUlidFactory(opts: UlidOptions = {}): () => string {
  const now = opts.now ?? (() => Date.now());
  const random = opts.random ?? defaultRandom;
  let lastTime = -1;
  let lastRand: Uint8Array | null = null;

  return () => {
    const t = Math.max(now(), lastTime);
    if (t === lastTime && lastRand !== null) {
      // same ms (or clock regressed): increment the 80-bit random part
      let i = RAND_BYTES - 1;
      while (i >= 0 && lastRand[i] === 0xff) {
        lastRand[i] = 0;
        i--;
      }
      if (i < 0) throw new RangeError("ULID random overflow within one ms");
      lastRand[i]++;
    } else {
      const r = random(RAND_BYTES);
      if (r.length !== RAND_BYTES) throw new RangeError("ULID random source must return 10 bytes");
      lastRand = Uint8Array.from(r);
      lastTime = t;
    }
    return encodeTime(lastTime) + encodeRandom(lastRand);
  };
}
