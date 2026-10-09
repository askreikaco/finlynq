/**
 * Worker message protocol (local-first P1, PKG-10). PROTOTYPE, unreviewed. SYNTHETIC data only.
 * Pure types and constants: no DOM, no Worker, no server imports.
 */
import type { RowCounts } from "../store/types";

/** Only IndexedDB databases with this prefix belong to the prototype. Never the app cache. */
export const LF_DB_PREFIX = "finlynq-lf-proto-v0-";
/** Store name; the IndexedDB database is LF_DB_PREFIX + LF_STORE_NAME. */
export const LF_STORE_NAME = "dev";
/** Log id for the synthetic fixture's op log. */
export const LF_LOG_ID = "lf-proto-fixture";

export type LfRequest =
  | { id: number; type: "importFixture" }
  | { id: number; type: "counts" }
  | { id: number; type: "runParity" }
  | { id: number; type: "wipe" };

export type LfRequestType = LfRequest["type"];

export interface ImportSummary {
  ops: number;
  batches: number;
  counts: RowCounts;
  stateHash: string;
}

export interface ParityCheck {
  name: string;
  ok: boolean;
  /** Number of keys compared; must be > 0 (anti-vacuity). */
  keys: number;
  /** First few mismatching keys, if any. */
  mismatches: string[];
}

export interface ParityReport {
  passed: number;
  total: number;
  checks: ParityCheck[];
}

export type LfResult =
  | { type: "importFixture"; summary: ImportSummary }
  | { type: "counts"; counts: RowCounts }
  | { type: "runParity"; report: ParityReport }
  | { type: "wipe"; deleted: string[] };

export type LfResponse = { id: number; ok: true; result: LfResult } | { id: number; ok: false; error: string };

/** PGlite names its IndexedDB database "/pglite/<dataDir name>" (Emscripten IDBFS mount path). */
const PGLITE_IDB_PATH = "/pglite/";

/** True only for prototype databases, with or without the PGlite path prefix. Never the app cache. */
export function isLfDatabaseName(name: string): boolean {
  const bare = name.startsWith(PGLITE_IDB_PATH) ? name.slice(PGLITE_IDB_PATH.length) : name;
  return bare.startsWith(LF_DB_PREFIX);
}
