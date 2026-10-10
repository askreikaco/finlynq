/**
 * Sealed on-device snapshot of the read cache (local-first L2b). PROTOTYPE, unreviewed. Pure: no IndexedDB, no network.
 *
 * A snapshot is one sealed manifest plus N sealed chunks of rows. Each blob is aead.seal() under the
 * per-device key (fresh random 96-bit nonce per blob). Plaintext is canonical JSON (oplog/canon.ts).
 *
 *   manifest  = { build, chunks: [{count, idx, table}], createdAt, schemaVer, serverWatermark, snapshotId }
 *   chunk     = [ row, row, ... ]   (accounts, categories, transactions; CHUNK_ROWS rows per chunk)
 *
 * Every table has at least one chunk (an empty table gets one chunk with count 0), so the manifest
 * fully describes the blob list. AAD per blob:
 *   finlynq-lf-snap|v1|<userId>|<deviceId>|<snapshotId>|<table>|<idx>|<n>|<schemaVer>
 * where <table> is "manifest" (idx 0, n 0) for the manifest, and <n> is the chunk's row count.
 * The build is not in the AAD; it is checked against the sealed manifest.
 *
 * decodeSnapshot() takes the blobs in encode order (manifest first). It throws AuthError on any
 * failure: AAD or key mismatch, bit flip, missing / extra / reordered blob, or wrong user, device,
 * snapshot, schemaVer or build. AuthError carries no detail.
 */
import { AuthError, open, seal } from "../crypto/aead";
import { canonicalJson } from "../oplog/canon";
import { createUlidFactory } from "../oplog/ulid";
import type { AccountRow, CategoryRow, TransactionRow } from "../store/types";

export const SNAPSHOT_AAD_PREFIX = "finlynq-lf-snap|v1";
export const CHUNK_ROWS = 2000;
export const MANIFEST_TABLE = "manifest";

export interface SnapshotRows {
  accounts: AccountRow[];
  categories: CategoryRow[];
  transactions: TransactionRow[];
}
export type SnapshotTable = keyof SnapshotRows;
export const SNAPSHOT_TABLES: readonly SnapshotTable[] = ["accounts", "categories", "transactions"];

export interface ChunkInfo {
  table: SnapshotTable;
  idx: number;
  count: number;
}

export interface SnapshotManifest {
  schemaVer: number;
  build: string;
  snapshotId: string;
  createdAt: number;
  serverWatermark: string | null;
  chunks: ChunkInfo[];
}

/** What binds a snapshot to one user, one device and one schema. */
export interface SnapshotBindings {
  key: CryptoKey;
  userId: string;
  deviceId: string;
  build: string;
  schemaVer: number;
}

export interface EncodeOptions extends SnapshotBindings {
  serverWatermark?: string | null;
  /** Defaults to a fresh ULID. */
  snapshotId?: string;
  /** Epoch ms for createdAt. Defaults to Date.now(). */
  now?: () => number;
}

export interface DecodeOptions extends SnapshotBindings {
  /** The snapshot the caller expects (from its pointer). Must equal the sealed manifest's snapshotId. */
  snapshotId: string;
}

export interface EncodedSnapshot {
  snapshotId: string;
  createdAt: number;
  manifestBlob: Uint8Array;
  chunkBlobs: Uint8Array[];
}

const enc = new TextEncoder();
const dec = new TextDecoder();
const nextSnapshotId = createUlidFactory();

function assertBindings(b: SnapshotBindings): void {
  if (b.userId.length === 0 || b.deviceId.length === 0) throw new Error("userId and deviceId must not be empty");
  if (b.userId.includes("|") || b.deviceId.includes("|")) throw new Error("userId and deviceId must not contain '|'");
  if (!Number.isSafeInteger(b.schemaVer) || b.schemaVer < 1) throw new Error("schemaVer must be a positive integer");
  if (typeof b.build !== "string" || b.build.length === 0) throw new Error("build must be a non-empty string");
}

function aad(b: SnapshotBindings, snapshotId: string, table: string, idx: number, n: number): Uint8Array {
  return enc.encode(`${SNAPSHOT_AAD_PREFIX}|${b.userId}|${b.deviceId}|${snapshotId}|${table}|${idx}|${n}|${b.schemaVer}`);
}

/** Drops undefined-valued keys so the row is canonical-JSON-safe. */
function plainRow(row: object): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) if (v !== undefined) out[k] = v;
  return out;
}

export async function encodeSnapshot(rows: SnapshotRows, opts: EncodeOptions): Promise<EncodedSnapshot> {
  assertBindings(opts);
  const snapshotId = opts.snapshotId ?? nextSnapshotId();
  if (snapshotId.length === 0 || snapshotId.includes("|")) throw new Error("snapshotId must be non-empty and contain no '|'");
  const createdAt = (opts.now ?? Date.now)();
  if (!Number.isSafeInteger(createdAt) || createdAt < 0) throw new Error("createdAt must be a non-negative integer");

  const chunks: ChunkInfo[] = [];
  const plains: Uint8Array[] = [];
  for (const table of SNAPSHOT_TABLES) {
    const list: object[] = rows[table];
    const parts = Math.max(1, Math.ceil(list.length / CHUNK_ROWS));
    for (let idx = 0; idx < parts; idx++) {
      const part = list.slice(idx * CHUNK_ROWS, (idx + 1) * CHUNK_ROWS).map(plainRow);
      chunks.push({ table, idx, count: part.length });
      plains.push(enc.encode(canonicalJson(part)));
    }
  }

  const manifest: SnapshotManifest = {
    schemaVer: opts.schemaVer,
    build: opts.build,
    snapshotId,
    createdAt,
    serverWatermark: opts.serverWatermark ?? null,
    chunks,
  };
  const manifestBlob = await seal(opts.key, enc.encode(canonicalJson(manifest)), aad(opts, snapshotId, MANIFEST_TABLE, 0, 0));
  const chunkBlobs: Uint8Array[] = [];
  for (let i = 0; i < chunks.length; i++) {
    const c = chunks[i];
    chunkBlobs.push(await seal(opts.key, plains[i], aad(opts, snapshotId, c.table, c.idx, c.count)));
  }
  return { snapshotId, createdAt, manifestBlob, chunkBlobs };
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isCount = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;

function parseManifest(bytes: Uint8Array): SnapshotManifest {
  let m: unknown;
  try {
    m = JSON.parse(dec.decode(bytes));
  } catch {
    throw new AuthError();
  }
  if (!isObj(m)) throw new AuthError();
  const chunksRaw = m.chunks;
  if (
    !isCount(m.schemaVer) || typeof m.build !== "string" || typeof m.snapshotId !== "string" || !isCount(m.createdAt) ||
    (m.serverWatermark !== null && typeof m.serverWatermark !== "string") || !Array.isArray(chunksRaw)
  ) {
    throw new AuthError();
  }
  const chunks: ChunkInfo[] = chunksRaw.map((c) => {
    if (!isObj(c) || typeof c.table !== "string" || !SNAPSHOT_TABLES.includes(c.table as SnapshotTable) || !isCount(c.idx) || !isCount(c.count)) {
      throw new AuthError();
    }
    return { table: c.table as SnapshotTable, idx: c.idx, count: c.count };
  });
  return {
    schemaVer: m.schemaVer,
    build: m.build,
    snapshotId: m.snapshotId,
    createdAt: m.createdAt,
    serverWatermark: m.serverWatermark as string | null,
    chunks,
  };
}

function parseRows(bytes: Uint8Array, count: number): unknown[] {
  let v: unknown;
  try {
    v = JSON.parse(dec.decode(bytes));
  } catch {
    throw new AuthError();
  }
  if (!Array.isArray(v) || v.length !== count || !v.every(isObj)) throw new AuthError();
  return v;
}

/** Opens and checks every blob. Blobs must be in encode order: manifest first, then chunks. */
export async function decodeSnapshot(blobs: Uint8Array[], opts: DecodeOptions): Promise<SnapshotRows> {
  assertBindings(opts);
  if (typeof opts.snapshotId !== "string" || opts.snapshotId.length === 0) throw new Error("snapshotId is required");
  if (blobs.length === 0) throw new AuthError();

  const manifest = parseManifest(
    await open(opts.key, blobs[0], aad(opts, opts.snapshotId, MANIFEST_TABLE, 0, 0)),
  );
  if (manifest.snapshotId !== opts.snapshotId) throw new AuthError();
  if (manifest.schemaVer !== opts.schemaVer) throw new AuthError();
  if (manifest.build !== opts.build) throw new AuthError();
  if (blobs.length !== manifest.chunks.length + 1) throw new AuthError();

  const out: SnapshotRows = { accounts: [], categories: [], transactions: [] };
  const nextIdx = new Map<SnapshotTable, number>();
  for (let i = 0; i < manifest.chunks.length; i++) {
    const c = manifest.chunks[i];
    if ((nextIdx.get(c.table) ?? 0) !== c.idx) throw new AuthError();
    nextIdx.set(c.table, c.idx + 1);
    const pt = await open(opts.key, blobs[i + 1], aad(opts, opts.snapshotId, c.table, c.idx, c.count));
    (out[c.table] as unknown[]).push(...parseRows(pt, c.count));
  }
  return out;
}
