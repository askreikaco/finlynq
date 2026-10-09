import { describe, it, expect, beforeAll } from "vitest";
import { deriveKeysFromPassphrase, type Argon2Params, type LogKeys } from "@/lib/local-first/crypto/kdf";
import { encodeFrame, decodeFrame, MAX_FRAMES_PER_KEY } from "@/lib/local-first/oplog/frame";
import { AuthError, TruncatedFrameError, UnsupportedVersionError } from "@/lib/local-first/oplog/errors";
import { canonicalJson } from "@/lib/local-first/oplog/canon";
import type { Op } from "@/lib/local-first/oplog/types";

const TINY: Argon2Params = { m: 64, t: 1, p: 1, dkLen: 32 };
const SALT = new Uint8Array(16).map((_, i) => i + 7);
const LOG_ID = "log-A";
const enc = new TextEncoder();

let keys: LogKeys;

beforeAll(async () => {
  keys = await deriveKeysFromPassphrase("frame test passphrase", SALT, LOG_ID, TINY);
});

function opOf(i: number): Op {
  return {
    deviceId: String.fromCharCode(97 + (i % 26)).repeat(1 + (i % 16)),
    opId: ("0".repeat(26) + i.toString(32)).slice(-26).toUpperCase(),
    seq: i,
    hlc: { ms: 1_700_000_000_000 + i, counter: i % 65536 },
    entity: i % 2 === 0 ? "transactions" : "accounts",
    rowId: `row-${i % 20}`,
    kind: i % 5 === 0 ? "delete" : "upsert",
    fields: i % 5 === 0 ? {} : { n: i, s: "x".repeat(i % 7), b: i % 2 === 0, z: null },
  };
}

/** Small fixed op: deviceId of 5 bytes, plaintext well under 128 bytes. */
const SMALL: Op = {
  deviceId: "dev-5",
  opId: "01HZZZZZZZZZZZZZZZZZZZZZZZ",
  seq: 0x01020304,
  hlc: { ms: 1_700_000_000_123, counter: 9 },
  entity: "accounts",
  rowId: "r1",
  kind: "upsert",
  fields: { n: 1 },
};
const D = 5;
// Header offsets for devLen = D (see frame.ts layout).
const VER = 4;
const DEVLEN = 5;
const DEV = 6;
const OPID = 6 + D; // 11
const SEQ = 32 + D; // 37
const HLC = 36 + D; // 41
const NONCE = 44 + D; // 49
const CT = 56 + D; // 61

function flip(frame: Uint8Array, at: number, xor = 0x01): Uint8Array {
  const c = frame.slice();
  c[at] ^= xor;
  return c;
}

async function rejectsWith(p: Promise<unknown>, cls: new (...a: never[]) => Error): Promise<void> {
  let caught: unknown;
  try {
    await p;
  } catch (e) {
    caught = e;
  }
  expect(caught).toBeInstanceOf(cls);
}

describe("frame v2: round trip and layout", () => {
  it("1000-op round trip with deviceId lengths 1..16", async () => {
    const lens = new Set<number>();
    for (let i = 0; i < 1000; i++) {
      const op = opOf(i);
      lens.add(enc.encode(op.deviceId).length);
      const frame = await encodeFrame(op, keys, LOG_ID);
      expect(await decodeFrame(frame, keys, LOG_ID)).toEqual(op);
    }
    expect(lens.size).toBe(16);
  });

  it("header field sizes match the layout (devLen 5)", async () => {
    const ptLen = enc.encode(
      canonicalJson({ entity: SMALL.entity, rowId: SMALL.rowId, kind: SMALL.kind, fields: SMALL.fields }),
    ).length;
    const frame = await encodeFrame(SMALL, keys, LOG_ID);
    const dv = new DataView(frame.buffer);
    expect(dv.getUint32(0)).toBe(frame.length - 4); // len prefix
    expect(frame[VER]).toBe(2); // ver: 1 byte
    expect(frame[DEVLEN]).toBe(D); // devLen: 1 byte
    expect(new TextDecoder().decode(frame.subarray(DEV, DEV + D))).toBe(SMALL.deviceId); // devLen bytes
    expect(new TextDecoder().decode(frame.subarray(OPID, OPID + 26))).toBe(SMALL.opId); // opId: 26 bytes
    expect(dv.getUint32(SEQ)).toBe(SMALL.seq); // seq: 4 bytes
    expect(frame.subarray(HLC, HLC + 8).length).toBe(8); // hlc: 8 bytes
    expect(NONCE - HLC).toBe(8); // nonce starts right after hlc
    expect(CT - NONCE).toBe(12); // nonce: 12 bytes
    expect(frame.length).toBe(CT + ptLen + 16); // ct = ptLen, tag: 16 bytes
  });

  it("seq and hlc round trip at u32 max and hlc max (and zero)", async () => {
    const max: Op = { ...SMALL, seq: 0xffffffff, hlc: { ms: 2 ** 48 - 1, counter: 0xffff } };
    const zero: Op = { ...SMALL, seq: 0, hlc: { ms: 0, counter: 0 } };
    for (const op of [max, zero]) {
      const got = await decodeFrame(await encodeFrame(op, keys, LOG_ID), keys, LOG_ID);
      expect(got.seq).toBe(op.seq);
      expect(got.hlc).toEqual(op.hlc);
    }
  });

  it("encode rejects deviceId of 0 and 17 bytes", async () => {
    await rejectsWith(encodeFrame({ ...SMALL, deviceId: "" }, keys, LOG_ID), RangeError);
    await rejectsWith(encodeFrame({ ...SMALL, deviceId: "x".repeat(17) }, keys, LOG_ID), RangeError);
  });

  it("MAX_FRAMES_PER_KEY is the documented 2^32 advisory bound", () => {
    expect(MAX_FRAMES_PER_KEY).toBe(2 ** 32);
  });
});

describe("frame v2: truncation and version", () => {
  it("truncation at every offset 0..len-1 gives TruncatedFrameError", async () => {
    const frame = await encodeFrame(SMALL, keys, LOG_ID);
    for (let k = 0; k < frame.length; k++) {
      await rejectsWith(decodeFrame(frame.slice(0, k), keys, LOG_ID), TruncatedFrameError);
    }
  });

  it("ver byte flipped 2 -> 3 gives UnsupportedVersionError (checked before AEAD)", async () => {
    const frame = await encodeFrame(SMALL, keys, LOG_ID);
    await rejectsWith(decodeFrame(flip(frame, VER), keys, LOG_ID), UnsupportedVersionError);
  });

  it("ver=1 (spike v1) gives UnsupportedVersionError", async () => {
    const frame = await encodeFrame(SMALL, keys, LOG_ID);
    const v1 = frame.slice();
    v1[VER] = 1;
    await rejectsWith(decodeFrame(v1, keys, LOG_ID), UnsupportedVersionError);
  });

  it("ver=3 gives UnsupportedVersionError", async () => {
    const frame = await encodeFrame(SMALL, keys, LOG_ID);
    const v3 = frame.slice();
    v3[VER] = 3;
    await rejectsWith(decodeFrame(v3, keys, LOG_ID), UnsupportedVersionError);
  });
});

describe("frame v2: header tamper, exact class per field", () => {
  // devLen flip ^0x01 (5 -> 4): structure still fits, so the parse reaches AEAD and the AAD
  // (which covers devLen) fails -> AuthError.
  it("devLen 5 -> 4 gives AuthError", async () => {
    const frame = await encodeFrame(SMALL, keys, LOG_ID);
    await rejectsWith(decodeFrame(flip(frame, DEVLEN), keys, LOG_ID), AuthError);
  });

  // devLen flip ^0x80 (5 -> 133): the declared header alone is longer than the body, so the
  // structural bounds check fails first -> TruncatedFrameError. Needs plaintext < 128 bytes.
  it("devLen 5 -> 133 gives TruncatedFrameError (bounds check runs before AEAD)", async () => {
    const frame = await encodeFrame(SMALL, keys, LOG_ID);
    const bodyLen = frame.length - 4;
    expect(bodyLen).toBeLessThan(68 + 133);
    await rejectsWith(decodeFrame(flip(frame, DEVLEN, 0x80), keys, LOG_ID), TruncatedFrameError);
  });

  // deviceId, opId, seq, hlc, nonce: the byte stays inside a well-formed structure, so the
  // parse reaches AEAD open and the AAD (ver..hlc) or the GCM check (nonce) fails -> AuthError.
  it("deviceId byte flipped gives AuthError", async () => {
    const frame = await encodeFrame(SMALL, keys, LOG_ID);
    await rejectsWith(decodeFrame(flip(frame, DEV), keys, LOG_ID), AuthError);
  });

  it("opId byte flipped gives AuthError", async () => {
    const frame = await encodeFrame(SMALL, keys, LOG_ID);
    await rejectsWith(decodeFrame(flip(frame, OPID), keys, LOG_ID), AuthError);
  });

  it("seq byte flipped gives AuthError", async () => {
    const frame = await encodeFrame(SMALL, keys, LOG_ID);
    await rejectsWith(decodeFrame(flip(frame, SEQ + 3), keys, LOG_ID), AuthError);
  });

  it("hlc byte flipped gives AuthError", async () => {
    const frame = await encodeFrame(SMALL, keys, LOG_ID);
    await rejectsWith(decodeFrame(flip(frame, HLC), keys, LOG_ID), AuthError);
  });

  it("nonce byte flipped gives AuthError", async () => {
    const frame = await encodeFrame(SMALL, keys, LOG_ID);
    await rejectsWith(decodeFrame(flip(frame, NONCE), keys, LOG_ID), AuthError);
  });

  it("wrong logId with the same keys gives AuthError (AAD binds logId)", async () => {
    const frame = await encodeFrame(SMALL, keys, LOG_ID);
    await rejectsWith(decodeFrame(frame, keys, "log-B"), AuthError);
  });

  it("ciphertext byte flipped gives AuthError", async () => {
    const frame = await encodeFrame(SMALL, keys, LOG_ID);
    await rejectsWith(decodeFrame(flip(frame, CT), keys, LOG_ID), AuthError);
  });

  it("tag byte flipped gives AuthError", async () => {
    const frame = await encodeFrame(SMALL, keys, LOG_ID);
    await rejectsWith(decodeFrame(flip(frame, frame.length - 1), keys, LOG_ID), AuthError);
  });

  it("trailing byte after the declared frame gives AuthError", async () => {
    const frame = await encodeFrame(SMALL, keys, LOG_ID);
    const extra = new Uint8Array(frame.length + 1);
    extra.set(frame, 0);
    await rejectsWith(decodeFrame(extra, keys, LOG_ID), AuthError);
  });
});
