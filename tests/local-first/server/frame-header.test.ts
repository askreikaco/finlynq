// @vitest-environment node
/**
 * Header-only parser (parseFrameHeader) against frames from the real encoder.
 * No key is used on the parse path; keys are needed only to produce the frames.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { deriveKeysFromPassphrase, type Argon2Params, type LogKeys } from "@/lib/local-first/crypto/kdf";
import { encodeFrame, parseFrameHeader, MAX_SEQ_STORED } from "@/lib/local-first/oplog/frame";
import { MalformedFrameError, TruncatedFrameError, UnsupportedVersionError } from "@/lib/local-first/oplog/errors";
import type { Op } from "@/lib/local-first/oplog/types";

const TINY: Argon2Params = { m: 64, t: 1, p: 1, dkLen: 32 };
const SALT = new Uint8Array(16).map((_, i) => i + 3);
const LOG_ID = "lf1-server-test";
let keys: LogKeys;

beforeAll(async () => {
  keys = await deriveKeysFromPassphrase("lf1 header test", SALT, LOG_ID, TINY);
});

const OP: Op = {
  deviceId: "dev-A1",
  opId: "01HZZZZZZZZZZZZZZZZZZZZZZZ",
  seq: 42,
  hlc: { ms: 1_700_000_000_123, counter: 9 },
  entity: "transactions",
  rowId: "r-1",
  kind: "upsert",
  fields: { amount: 12.5, note: "x" },
};

async function frameOf(op: Partial<Op> = {}): Promise<Uint8Array> {
  return encodeFrame({ ...OP, ...op }, keys, LOG_ID);
}

describe("parseFrameHeader", () => {
  it("round-trips the plaintext header of an encoder-produced frame", async () => {
    const f = await frameOf();
    const h = parseFrameHeader(f);
    expect(h).toEqual({ ver: 2, deviceId: "dev-A1", opId: OP.opId, seq: 42, hlc: OP.hlc });
  });

  it("accepts the maximum device id length (16 bytes) and seq at the stored bound", async () => {
    const f = await frameOf({ deviceId: "d".repeat(16), seq: MAX_SEQ_STORED });
    const h = parseFrameHeader(f);
    expect(h.deviceId).toBe("d".repeat(16));
    expect(h.seq).toBe(MAX_SEQ_STORED);
  });

  it("does not depend on the key: a frame from another log id parses the same header", async () => {
    const other = await deriveKeysFromPassphrase("other", SALT, "other-log", TINY);
    const f = await encodeFrame(OP, other, "other-log");
    expect(parseFrameHeader(f).opId).toBe(OP.opId);
  });

  it("rejects a frame shorter than its length prefix (truncated)", async () => {
    const f = await frameOf();
    expect(() => parseFrameHeader(f.subarray(0, f.length - 1))).toThrow(TruncatedFrameError);
    expect(() => parseFrameHeader(f.subarray(0, 3))).toThrow(TruncatedFrameError);
  });

  it("rejects a body too short to hold header + nonce + tag", async () => {
    const f = await frameOf();
    const cut = f.slice(0, 4 + 30);
    new DataView(cut.buffer).setUint32(0, 30);
    expect(() => parseFrameHeader(cut)).toThrow(TruncatedFrameError);
  });

  it("rejects trailing bytes after the declared length", async () => {
    const f = await frameOf();
    const extra = new Uint8Array(f.length + 1);
    extra.set(f);
    expect(() => parseFrameHeader(extra)).toThrow(MalformedFrameError);
  });

  it("rejects an unknown frame version", async () => {
    const f = await frameOf();
    f[4] = 9;
    expect(() => parseFrameHeader(f)).toThrow(UnsupportedVersionError);
  });

  it("rejects a zero-length deviceId", async () => {
    const f = await frameOf();
    f[5] = 0;
    expect(() => parseFrameHeader(f)).toThrow(MalformedFrameError);
  });

  it("rejects a deviceId length above 16", async () => {
    const f = await frameOf();
    f[5] = 17;
    expect(() => parseFrameHeader(f)).toThrow(MalformedFrameError);
  });

  it("rejects an opId that is not ULID text", async () => {
    const f = await frameOf();
    const at = 6 + "dev-A1".length;
    f[at] = 0x69; // 'i' is not in the Crockford alphabet
    expect(() => parseFrameHeader(f)).toThrow(/opId is not a ULID/);
  });

  it("rejects non-UTF-8 deviceId bytes", async () => {
    const f = await frameOf();
    f[6] = 0xff;
    expect(() => parseFrameHeader(f)).toThrow(MalformedFrameError);
  });

  it("rejects seq above the Postgres integer range", async () => {
    const f = await frameOf();
    new DataView(f.buffer).setUint32(4 + 2 + 6 + 26, 0x80000000);
    expect(() => parseFrameHeader(f)).toThrow(/seq out of stored range/);
  });

  it("rejects arbitrary garbage with a frame error class", () => {
    for (const bytes of [new Uint8Array(0), new Uint8Array([0, 0, 0, 0]), new Uint8Array(100).fill(0xff)]) {
      expect(() => parseFrameHeader(bytes)).toThrow();
      try {
        parseFrameHeader(bytes);
      } catch (e) {
        expect([TruncatedFrameError, MalformedFrameError, UnsupportedVersionError].some((c) => e instanceof c)).toBe(true);
      }
    }
  });
});
