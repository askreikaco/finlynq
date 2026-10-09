/**
 * Hybrid logical clock. Wire form: 8 bytes, big-endian: 48-bit ms, then 16-bit counter.
 * Packed via DataView only (no bigint literals; tsconfig target is ES2017).
 * now() is injected. Remote timestamps more than MAX_DRIFT_MS ahead of local now are rejected.
 */

export interface Hlc {
  ms: number;
  counter: number;
}

export const MAX_DRIFT_MS = 24 * 60 * 60 * 1000;
const MAX_MS = 2 ** 48 - 1;
const MAX_COUNTER = 0xffff;
const TWO_POW_16 = 65536;

function checkHlc(h: Hlc): void {
  if (!Number.isInteger(h.ms) || h.ms < 0 || h.ms > MAX_MS) throw new RangeError(`HLC ms out of range: ${h.ms}`);
  if (!Number.isInteger(h.counter) || h.counter < 0 || h.counter > MAX_COUNTER) {
    throw new RangeError(`HLC counter out of range: ${h.counter}`);
  }
}

export function pack(h: Hlc): Uint8Array {
  checkHlc(h);
  const buf = new ArrayBuffer(8);
  const dv = new DataView(buf);
  dv.setUint32(0, Math.floor(h.ms / TWO_POW_16));
  dv.setUint16(4, h.ms % TWO_POW_16);
  dv.setUint16(6, h.counter);
  return new Uint8Array(buf);
}

export function unpack(bytes: Uint8Array): Hlc {
  if (bytes.length !== 8) throw new RangeError("HLC must be 8 bytes");
  const dv = new DataView(bytes.buffer, bytes.byteOffset, 8);
  const ms = dv.getUint32(0) * TWO_POW_16 + dv.getUint16(4);
  return { ms, counter: dv.getUint16(6) };
}

export function compareHlc(a: Hlc, b: Hlc): number {
  if (a.ms !== b.ms) return a.ms < b.ms ? -1 : 1;
  if (a.counter !== b.counter) return a.counter < b.counter ? -1 : 1;
  return 0;
}

export interface HlcClock {
  send(): Hlc;
  recv(remote: Hlc): Hlc;
  last(): Hlc;
}

export function createHlc(opts: { now: () => number; maxDriftMs?: number }): HlcClock {
  const maxDrift = opts.maxDriftMs ?? MAX_DRIFT_MS;
  let l: Hlc = { ms: 0, counter: 0 };

  const bump = (c: number): number => {
    if (c > MAX_COUNTER) throw new RangeError("HLC counter overflow");
    return c;
  };

  return {
    send(): Hlc {
      const pt = opts.now();
      if (pt > l.ms) {
        l = { ms: pt, counter: 0 };
      } else {
        l = { ms: l.ms, counter: bump(l.counter + 1) };
      }
      return { ...l };
    },
    recv(remote: Hlc): Hlc {
      checkHlc(remote);
      const pt = opts.now();
      if (remote.ms - pt > maxDrift) {
        throw new RangeError(`HLC remote is ${remote.ms - pt} ms ahead of local, over the ${maxDrift} ms limit`);
      }
      const newMs = Math.max(pt, l.ms, remote.ms);
      let counter: number;
      if (newMs === l.ms && newMs === remote.ms) {
        counter = bump(Math.max(l.counter, remote.counter) + 1);
      } else if (newMs === l.ms) {
        counter = bump(l.counter + 1);
      } else if (newMs === remote.ms) {
        counter = bump(remote.counter + 1);
      } else {
        counter = 0;
      }
      l = { ms: newMs, counter };
      return { ...l };
    },
    last(): Hlc {
      return { ...l };
    },
  };
}
