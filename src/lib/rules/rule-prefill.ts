/**
 * Query-param prefill for the rule create page (/settings/rules/new).
 *
 * Params (all optional):
 *   payee           -> contains-payee condition (and default name `Match "<payee>"`)
 *   name            -> rule name (overrides the default name)
 *   categoryId      -> set_category action (positive integer)
 *   stagedImportId  -> submit to /api/import/staged/[id]/create-rule instead of
 *                      /api/rules; no default action (the banner adds them)
 *
 * Pure: no React, no fetch. Values are trimmed and capped; malformed values are dropped.
 */

import type { Action, Condition } from "@/lib/rules/schema";

export interface RulePrefill {
  name: string;
  conditions?: Condition[];
  /** undefined = the editor's default blank action; [] = none (banner flow). */
  actions?: Action[];
  stagedImportId?: string;
}

const STAGED_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

export function rulePrefillFromParams(params: { get(name: string): string | null }): RulePrefill {
  const payee = (params.get("payee") ?? "").trim().slice(0, 200);
  const rawName = (params.get("name") ?? "").trim().slice(0, 120);
  const name = rawName || (payee ? `Match "${payee.slice(0, 100)}"` : "");

  const conditions: Condition[] | undefined = payee
    ? [{ field: "payee", op: "contains", value: payee }]
    : undefined;

  const rawStaged = (params.get("stagedImportId") ?? "").trim();
  const stagedImportId = STAGED_ID_RE.test(rawStaged) ? rawStaged : undefined;

  const rawCat = (params.get("categoryId") ?? "").trim();
  const categoryId = /^\d+$/.test(rawCat) ? Number(rawCat) : 0;

  let actions: Action[] | undefined;
  if (categoryId > 0) actions = [{ kind: "set_category", categoryId }];
  else if (stagedImportId) actions = [];

  return { name, conditions, actions, stagedImportId };
}
