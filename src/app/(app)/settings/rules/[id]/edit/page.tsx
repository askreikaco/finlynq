"use client";

import { Suspense, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { FormPage } from "@/components/templates/form-page";
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
import type { LoadStatus } from "@/lib/forms/load-state";
import { useReturnTo } from "@/lib/forms/use-return-to";
import type { Action, Condition } from "@/lib/rules/schema";
import { cn } from "@/lib/utils";
import { RULES_RETURN_FALLBACK } from "../../_components/rule-form-screen";

type RuleRow = {
  id: number;
  name: string;
  conditions: { all: Condition[] };
  actions: Action[];
  isActive: boolean;
  priority: number;
};

/** A non-numeric route id (ruleId null) is "Rule not found", never the create form. */
function EditRuleForm({ ruleId }: { ruleId: number | null }) {
  const router = useRouter();
  const returnTo = useReturnTo(RULES_RETURN_FALLBACK);
  const invalidId = ruleId == null;

  const [categories, setCategories] = useState<Category[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [rule, setRule] = useState<RuleSeed | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let cancelled = false;
    if (ruleId == null) return () => { cancelled = true; };
    async function load() {
      try {
        const [rulesRes, catsRes, acctsRes, holdRes] = await Promise.all([
          fetch("/api/rules"),
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
      } catch (e) {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [ruleId]);

  async function onSubmit(payload: RuleEditorPayload): Promise<SubmitResult> {
    try {
      let res: Response;
      if (rule) {
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
        return { ok: false, error: data?.error ?? "Failed to save rule" };
      }
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  // Edit title is "New rule" only while loading (no rule yet); every other state says "Edit rule".
  const title = loading && !invalidId ? "New rule" : "Edit rule";
  const submitLabel = rule ? "Update rule" : "Create rule";
  const errorText = loadError || "Rule not found.";
  const status: LoadStatus =
    loading && !invalidId
      ? "loading"
      : invalidId || notFound
        ? "notFound"
        : !rule && loadError
          ? "error"
          : "ready";
  const loadState = { status, retry: () => undefined };

  return (
    <FormPage
      id="rule-form"
      rootTestId="rule-form-root"
      title={title}
      fallbackReturn={RULES_RETURN_FALLBACK}
      form="external"
      width="report"
      padBottom="none"
      bodyClassName={cn("space-y-4", TW.formPad)}
      header={{ actions: null }}
      useLoad={() => loadState}
      states={{
        loading: { node: <p className="mt-6 text-sm text-muted-foreground">Loading…</p> },
        error: { node: <p className="mt-6 text-sm text-destructive">{errorText}</p> },
        notFound: { node: <p className="mt-6 text-sm text-destructive">{errorText}</p> },
      }}
    >
      {() => (
        <RuleEditorForm
          rule={rule}
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
      )}
    </FormPage>
  );
}

function EditRulePage() {
  const params = useParams<{ id: string }>();
  const raw = params.id ?? "";
  const ruleId = /^\d+$/.test(raw) ? Number(raw) : null;
  return <EditRuleForm ruleId={ruleId} />;
}

export default function EditRuleRoute() {
  return (
    <Suspense fallback={null}>
      <EditRulePage />
    </Suspense>
  );
}
