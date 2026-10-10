"use client";

/**
 * Full-page rule editor (create + edit). Replaces the RuleEditorDialog that
 * /settings/rules used to open (iOS multi-level navigation rule: create/edit
 * flows are pages). Data and payloads are unchanged from the old dialog flow:
 *   - GET  /api/rules, /api/categories, /api/accounts, /api/portfolio
 *   - POST /api/rules            (create)
 *   - PUT  /api/rules            (edit, body { id, ...payload })
 *   - POST /api/import/staged/[id]/create-rule  (when stagedImportId is set)
 * Back / Cancel / save go to `returnTo` (same-app path only).
 */

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/mobile";
import { Button } from "@/components/ui/button";
import {
  RuleEditorForm,
  type Account,
  type Category,
  type Holding,
  type RuleEditorPayload,
  type RuleSeed,
  type SubmitResult,
} from "@/components/rules/rule-editor-form";
import { TW } from "@/lib/design/tokens";
import { useReturnTo } from "@/lib/forms/use-return-to";
import { cn } from "@/lib/utils";
import { rulePrefillFromParams } from "@/lib/rules/rule-prefill";
import type { Action, Condition } from "@/lib/rules/schema";

export const RULES_RETURN_FALLBACK = "/settings/rules";

type RuleRow = {
  id: number;
  name: string;
  conditions: { all: Condition[] };
  actions: Action[];
  isActive: boolean;
  priority: number;
};

/**
 * `edit` with ruleId null (a non-numeric route id) renders "Rule not found";
 * it must never fall through to the create form.
 */
export type RuleFormMode = { mode: "create" } | { mode: "edit"; ruleId: number | null };

export function RuleFormPage(props: RuleFormMode) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = useReturnTo(RULES_RETURN_FALLBACK);
  const isEdit = props.mode === "edit";
  const ruleId = props.mode === "edit" ? props.ruleId : null;
  // Edit route with a non-numeric id: not found, never the create form.
  const invalidId = isEdit && ruleId == null;
  // Prefill only applies to create; computed from the URL at mount.
  const prefill = useMemo(() => rulePrefillFromParams(searchParams), [searchParams]);
  const stagedImportId = isEdit ? undefined : prefill.stagedImportId;

  const [categories, setCategories] = useState<Category[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [rule, setRule] = useState<RuleSeed | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let cancelled = false;
    if (isEdit && ruleId == null) return () => { cancelled = true; };
    async function load() {
      try {
        const [rulesRes, catsRes, acctsRes, holdRes] = await Promise.all([
          isEdit ? fetch("/api/rules") : Promise.resolve(null),
          fetch("/api/categories"),
          fetch("/api/accounts"),
          fetch("/api/portfolio"),
        ]);
        if (cancelled) return;
        if (catsRes.ok) setCategories(await catsRes.json());
        if (acctsRes.ok) setAccounts(await acctsRes.json());
        if (holdRes.ok) {
          const data = await holdRes.json();
          // /api/portfolio returns an array of holdings.
          setHoldings(Array.isArray(data) ? data : (data.holdings ?? []));
        }
        if (rulesRes) {
          if (!rulesRes.ok) {
            setLoadError("Failed to load rules");
          } else {
            const rows = (await rulesRes.json()) as RuleRow[];
            const found = rows.find((r) => r.id === ruleId);
            if (found) {
              setRule({
                id: found.id,
                name: found.name,
                conditions: found.conditions ?? { all: [] },
                actions: found.actions ?? [],
                priority: found.priority,
                isActive: found.isActive,
              });
            } else {
              setNotFound(true);
            }
          }
        }
      } catch (e) {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [isEdit, ruleId]);

  async function onSubmit(payload: RuleEditorPayload): Promise<SubmitResult> {
    try {
      let res: Response;
      if (stagedImportId) {
        res = await fetch(`/api/import/staged/${stagedImportId}/create-rule`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } else if (rule) {
        res = await fetch("/api/rules", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: rule.id, ...payload }),
        });
      } else {
        res = await fetch("/api/rules", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const fallback = stagedImportId ? "Rule creation failed" : "Failed to save rule";
        return { ok: false, error: data?.error ?? fallback };
      }
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  const title = rule ? "Edit rule" : stagedImportId ? "Create rule from row" : "New rule";
  const submitLabel = rule ? "Update rule" : stagedImportId ? "Create rule + apply" : "Create rule";

  if (loading && !invalidId) {
    return (
      <div className={cn("mx-auto w-full", TW.report)}>
        <PageHeader title={title} backHref={returnTo} backLabel="Back" className="flex items-center justify-between" />
        <p className="mt-6 text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  if (isEdit && (invalidId || notFound || (!rule && loadError))) {
    return (
      <div className={cn("mx-auto w-full", TW.report)}>
        <PageHeader title="Edit rule" backHref={returnTo} backLabel="Back" className="flex items-center justify-between" />
        <p className="mt-6 text-sm text-destructive">{loadError || "Rule not found."}</p>
      </div>
    );
  }

  return (
    <div data-testid="rule-form-root" className={cn("mx-auto w-full", TW.report)}>
      <PageHeader title={title} backHref={returnTo} backLabel="Back" className="flex items-center justify-between" />
      <div className={cn("mt-3 space-y-4", TW.formPad)}>
        <RuleEditorForm
          rule={rule}
          initialName={rule ? undefined : prefill.name}
          initialConditions={rule ? undefined : prefill.conditions}
          initialActions={rule ? undefined : prefill.actions}
          categories={categories}
          accounts={accounts}
          holdings={holdings}
          onSubmit={onSubmit}
          onSaved={() => router.push(returnTo)}
          renderActions={({ submitting, save }) => (
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => router.push(returnTo)} disabled={submitting}>Cancel</Button>
              <Button onClick={save} disabled={submitting}>
                {submitting ? "Saving…" : submitLabel}
              </Button>
            </div>
          )}
        />
      </div>
    </div>
  );
}
