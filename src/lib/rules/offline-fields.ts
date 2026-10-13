/**
 * Maps a transaction rule to and from the offline queue's field values (local-first L3). Pure.
 * conditions and actions go as canonical JSON text, so the per-field compare ignores key order.
 */
import { canonicalJson } from "@/lib/local-first/write-path/entities/json";

export interface RuleLike {
  name?: string | null;
  conditions?: unknown;
  actions?: unknown;
  priority?: number | null;
  isActive?: boolean | null;
}

export function ruleFields(r: RuleLike): Record<string, string | number | null> {
  const out: Record<string, string | number | null> = {};
  if (r.name !== undefined) out.name = r.name ?? null;
  if (r.conditions !== undefined) out.conditions = canonicalJson(r.conditions);
  if (r.actions !== undefined) out.actions = canonicalJson(r.actions);
  if (r.priority !== undefined) out.priority = r.priority ?? 0;
  if (r.isActive !== undefined) out.isActive = r.isActive === null ? null : r.isActive ? "true" : "false";
  return out;
}

/** Only the fields that differ from the server baseline (what a queued edit carries). */
export function ruleChangedFields(next: RuleLike, base: RuleLike): { patch: Record<string, string | number | null>; current: Record<string, string | number | null> } {
  const n = ruleFields(next);
  const b = ruleFields(base);
  const patch: Record<string, string | number | null> = {};
  const current: Record<string, string | number | null> = {};
  for (const k of Object.keys(n)) {
    if ((n[k] ?? null) !== (b[k] ?? null)) {
      patch[k] = n[k];
      current[k] = b[k] ?? null;
    }
  }
  return { patch, current };
}
