/**
 * Op-log frame v2 codec. PROTOTYPE, unreviewed. Not wired into any live path.
 *
 * Layout (all integers big-endian):
 *   [u32 len]            len = byte count of everything after this prefix
 *   [u8  ver = 2]
 *   [u8  devLen]         1..16 (checked on encode; decode relies on AAD)
 *   [devLen bytes]       deviceId (UTF-8)
 *   [26 bytes]           opId (ULID text, ASCII)
 *   [u32 seq]
 *   [8 bytes]            hlc (clock/hlc pack)
 *   [12 bytes]           nonce   \  crypto/aead seal() output:
 *   [n bytes]            ct       > nonce || ct || 16-byte GCM tag
 *   [16 bytes]           tag     /
 *
 * AAD = header bytes from ver through hlc, then the 16-byte logTag
 * (sha256(logId) truncated to 16 bytes). logId is NOT stored in the frame.
 *
 * Decode order: length prefix -> version -> structural bounds -> AEAD open.
 * Any structural shortfall is TruncatedFrameError and happens BEFORE decryption.
 *
 * MAX_FRAMES_PER_KEY is documentation only. Nonces are random 96-bit with no counter (D5), so a
 * single oplog key must be rotated well before 2^32 frames (NIST random-nonce GCM bound).
 */
import { canonicalJson } from "./canon";
import { pack, unpack, type Hlc } from "../clock/hlc";
import { open, seal, NONCE_BYTES, TAG_BYTES, AuthError } from "../crypto/aead";
import type { LogKeys } from "../crypto/kdf";
import { TruncatedFrameError, UnsupportedVersionError } from "./errors";
import type { Op, OpBody } from "./types";

/** Advisory bound for documentation only. Not enforced. See header comment. */
export const MAX_FRAMES_PER_KEY = 2 ** 32;

export const FRAME_VERSION = 2;
const LEN_BYTES = 4;
const DEV_MAX = 16;
const OPID_BYTES = 26;
const SEQ_BYTES = 4;
const HLC_BYTES = 8;
const LOG_TAG_BYTES = 16;

const enc = new TextEncoder();
const dec = new TextDecoder();

function concat(...parts: Uint8Array[]): Uint8Array {
  let n = 0;
  for (const p of parts) n += p.length;
  const out = new Uint8Array(n);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

async function logTagOf(logId: string): Promise<Uint8Array> {
  const digest = new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", enc.encode(logId)));
  return digest.slice(0, LOG_TAG_BYTES);
}

/** AAD = header (ver..hlc) || logTag. Shared by encode and decode. */
function buildAad(header: Uint8Array, logTag: Uint8Array): Uint8Array {
  return concat(header, logTag);
}

export async function encodeFrame(op: Op, keys: LogKeys, logId: string): Promise<Uint8Array> {
  const devBytes = enc.encode(op.deviceId);
  if (devBytes.length < 1 || devBytes.length > DEV_MAX) {
    throw new RangeError(`deviceId must be 1..${DEV_MAX} bytes, got ${devBytes.length}`);
  }
  const opIdBytes = enc.encode(op.opId);
  if (opIdBytes.length !== OPID_BYTES) throw new RangeError(`opId must be ${OPID_BYTES} bytes`);
  if (!Number.isInteger(op.seq) || op.seq < 0 || op.seq > 0xffffffff) {
    throw new RangeError(`seq out of u32 range: ${op.seq}`);
  }
  const hlcBytes = pack(op.hlc); // throws RangeError on out-of-range ms/counter

  const body: OpBody = { entity: op.entity, rowId: op.rowId, kind: op.kind, fields: op.fields };
  const plaintext = enc.encode(canonicalJson(body));

  const headerLen = 2 + devBytes.length + OPID_BYTES + SEQ_BYTES + HLC_BYTES;
  const header = new Uint8Array(headerLen);
  const dv = new DataView(header.buffer);
  header[0] = FRAME_VERSION;
  header[1] = devBytes.length;
  header.set(devBytes, 2);
  header.set(opIdBytes, 2 + devBytes.length);
  dv.setUint32(2 + devBytes.length + OPID_BYTES, op.seq);
  header.set(hlcBytes, 2 + devBytes.length + OPID_BYTES + SEQ_BYTES);

  const aad = buildAad(header, await logTagOf(logId));
  const sealed = await seal(keys.oplogKey, plaintext, aad); // nonce || ct || tag

  const bodyLen = headerLen + sealed.length;
  const frame = new Uint8Array(LEN_BYTES + bodyLen);
  new DataView(frame.buffer).setUint32(0, bodyLen);
  frame.set(header, LEN_BYTES);
  frame.set(sealed, LEN_BYTES + headerLen);
  return frame;
}

export async function decodeFrame(bytes: Uint8Array, keys: LogKeys, logId: string): Promise<Op> {
  // 1. Length prefix. Anything short of the declared length is truncation.
  if (bytes.length < LEN_BYTES) throw new TruncatedFrameError();
  const len = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0);
  if (bytes.length < LEN_BYTES + len) throw new TruncatedFrameError();
  // Trailing bytes after the declared frame are a framing error. len is not in the AAD,
  // so the check is part of decode and reports AuthError.
  if (bytes.length > LEN_BYTES + len) throw new AuthError();
  const body = bytes.subarray(LEN_BYTES, LEN_BYTES + len);

  // 2. Version. Needs body[0] and body[1]. Any value other than 2 is rejected here.
  if (body.length < 2) throw new TruncatedFrameError();
  if (body[0] !== FRAME_VERSION) throw new UnsupportedVersionError(body[0]);

  // 3. Structural bounds, before any decryption. Minimum body for devLen d is
  //    2 + d + 26 + 4 + 8 (header) + 12 (nonce) + 16 (tag) = 68 + d.
  const devLen = body[1];
  const headerEnd = 2 + devLen + OPID_BYTES + SEQ_BYTES + HLC_BYTES;
  if (body.length < headerEnd + NONCE_BYTES + TAG_BYTES) throw new TruncatedFrameError();

  // 4. Header fields (only trusted after AEAD open below).
  const header = body.subarray(0, headerEnd);
  const dv = new DataView(body.buffer, body.byteOffset, body.byteLength);
  const deviceIdBytes = body.subarray(2, 2 + devLen);
  const opIdBytes = body.subarray(2 + devLen, 2 + devLen + OPID_BYTES);
  const seqOff = 2 + devLen + OPID_BYTES;
  const seq = dv.getUint32(seqOff);
  const hlcBytes = body.subarray(seqOff + SEQ_BYTES, headerEnd);
  const sealed = body.subarray(headerEnd);

  // 5. AEAD open. Any header, logId, ct or tag tamper throws AuthError.
  const aad = buildAad(header, await logTagOf(logId));
  const plain = await open(keys.oplogKey, sealed, aad);
  const payload = JSON.parse(dec.decode(plain)) as OpBody;
  const hlc: Hlc = unpack(hlcBytes);
  return {
    deviceId: dec.decode(deviceIdBytes),
    opId: dec.decode(opIdBytes),
    seq,
    hlc,
    entity: payload.entity,
    rowId: payload.rowId,
    kind: payload.kind,
    fields: payload.fields,
  };
}
