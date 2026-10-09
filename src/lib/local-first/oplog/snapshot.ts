/**
 * Encrypted state snapshot. PROTOTYPE, unreviewed. Not wired into any live path.
 *
 * Envelope (big-endian):
 *   [u8  ver = 1]
 *   [u8  kind = 0x53]          'S'
 *   [8   createdHlc]           clock/hlc pack
 *   [u8  devLen]               1..16
 *   [devLen]                   deviceId (UTF-8) of the writer
 *   [12  nonce]  \  aead seal() with keys.snapshotKey
 *   [n   ct]     /
 *   [16  tag]    /
 *
 * AAD = header bytes (ver..deviceId) || sha256(logId) truncated to 16 bytes.
 * Plaintext = canon({ registers, applied }); applied = { deviceId: [[fromSeq, toSeq], ...] }.
 * Snapshot-tamper and wrong-log failures are AuthError. A version other than 1 is
 * UnsupportedVersionError (checked before decryption, like frames).
 */
import { pack, unpack, type Hlc } from "../clock/hlc";
import { open, seal, NONCE_BYTES, TAG_BYTES, AuthError } from "../crypto/aead";
import type { LogKeys } from "../crypto/kdf";
import { MergeState, type Register, type SeqRange } from "../merge/state";
import { canonicalJson } from "./canon";
import { UnsupportedVersionError } from "./errors";

export const SNAPSHOT_VERSION = 1;
export const SNAPSHOT_KIND = 0x53;
const HLC_BYTES = 8;
const LOG_TAG_BYTES = 16;
const DEV_MAX = 16;
const FIXED_HEAD = 2 + HLC_BYTES + 1; // ver, kind, hlc, devLen

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

export interface OpenedSnapshot {
  state: MergeState;
  createdHlc: Hlc;
  deviceId: string;
}

export async function sealSnapshot(
  state: MergeState,
  keys: LogKeys,
  logId: string,
  createdHlc: Hlc,
  deviceId: string,
): Promise<Uint8Array> {
  const devBytes = enc.encode(deviceId);
  if (devBytes.length < 1 || devBytes.length > DEV_MAX) throw new RangeError("snapshot deviceId must be 1..16 bytes");
  const header = concat(
    new Uint8Array([SNAPSHOT_VERSION, SNAPSHOT_KIND]),
    pack(createdHlc),
    new Uint8Array([devBytes.length]),
    devBytes,
  );
  const payload = { registers: state.exportRegisters(), applied: state.exportApplied() };
  const plaintext = enc.encode(canonicalJson(payload));
  const aad = concat(header, await logTagOf(logId));
  const sealed = await seal(keys.snapshotKey, plaintext, aad);
  return concat(header, sealed);
}

export async function openSnapshot(bytes: Uint8Array, keys: LogKeys, logId: string): Promise<OpenedSnapshot> {
  if (bytes.length < FIXED_HEAD) throw new AuthError();
  if (bytes[0] !== SNAPSHOT_VERSION) throw new UnsupportedVersionError(bytes[0]);
  if (bytes[1] !== SNAPSHOT_KIND) throw new AuthError();
  const createdHlc = unpack(bytes.subarray(2, 2 + HLC_BYTES));
  const devLen = bytes[2 + HLC_BYTES];
  if (devLen < 1 || devLen > DEV_MAX) throw new AuthError();
  const headerEnd = FIXED_HEAD + devLen;
  if (bytes.length < headerEnd + NONCE_BYTES + TAG_BYTES) throw new AuthError();
  const header = bytes.subarray(0, headerEnd);
  const deviceId = dec.decode(bytes.subarray(FIXED_HEAD, headerEnd));
  const aad = concat(header, await logTagOf(logId));
  const plain = await open(keys.snapshotKey, bytes.subarray(headerEnd), aad);
  const payload = JSON.parse(dec.decode(plain)) as {
    registers: Record<string, Register>;
    applied: Record<string, SeqRange[]>;
  };
  return {
    state: MergeState.fromParts(payload.registers, payload.applied),
    createdHlc,
    deviceId,
  };
}
