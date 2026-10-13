/** Helpers shared by the entity adapters (local-first L3). Pure. */
import type { EntityFields, FieldValue } from "../types";

export const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Picks `names` from a raw server row, normalised: number stays, null/undefined -> null, anything else -> string. Absent keys are skipped. */
export function pickFields(raw: Record<string, unknown>, names: readonly string[]): EntityFields {
  const out: EntityFields = {};
  for (const f of names) {
    if (!(f in raw)) continue;
    const v = raw[f];
    out[f] = v === undefined || v === null ? null : typeof v === "number" ? v : String(v);
  }
  return out;
}

/** Same equality the conflict rules use: null and undefined are equal. */
export const sameValue = (a: FieldValue | undefined, b: FieldValue | undefined): boolean => (a ?? null) === (b ?? null);
