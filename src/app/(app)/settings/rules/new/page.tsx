"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { FormPage } from "@/components/templates/form-page";
import { Button } from "@/components/ui/button";
import {
  RuleEditorForm,
  type Account,
  type Category,
  type Holding,
  type RuleEditorPayload,
  type SubmitResult,
} from "@/components/rules/rule-editor-form";
import { TW } from "@/lib/design/tokens";
import type { LoadStatus } from "@/lib/forms/load-state";
import { useReturnTo } from "@/lib/forms/use-return-to";
import { cn } from "@/lib/utils";
import { rulePrefillFromParams } from "@/lib/rules/rule-prefill";
import { RULES_RETURN_FALLBACK } from "../_components/rule-form-screen";

function NewRuleForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = useReturnTo(RULES_RETURN_FALLBACK);
  // Prefill comes from the URL at mount (create only).
  const prefill = useMemo(() => rulePrefillFromParams(searchParams), [searchParams]);
  const stagedImportId = prefill.stagedImportId;

  const [categories, setCategories] = useState<Category[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [catsRes, acctsRes, holdRes] = await Promise.all([
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
      } catch {
        // Create mode shows the form even when a seed fetch fails.
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, []);

  async function onSubmit(payload: RuleEditorPayload): Promise<SubmitResult> {
    try {
      let res: Response;
      if (stagedImportId) {
        res = await fetch(`/api/import/staged/${stagedImportId}/create-rule`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
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

  const title = stagedImportId ? "Create rule from row" : "New rule";
  const submitLabel = stagedImportId ? "Create rule + apply" : "Create rule";
  const status: LoadStatus = loading ? "loading" : "ready";
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
      }}
    >
      {() => (
        <RuleEditorForm
          rule={null}
          initialName={prefill.name}
          initialConditions={prefill.conditions}
          initialActions={prefill.actions}
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

export default function NewRulePage() {
  return (
    <Suspense fallback={null}>
      <NewRuleForm />
    </Suspense>
  );
}
