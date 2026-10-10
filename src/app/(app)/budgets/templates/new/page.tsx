"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { PageSkeleton } from "@/components/page-skeleton";
import { useDisplayCurrency } from "@/components/currency-provider";
import { getCurrentMonth, getMonthLabel } from "@/lib/currency";
import { FormPage } from "@/components/templates";
import type { LoadState } from "@/lib/forms/load-state";
import { SaveTemplateForm } from "../../_components/save-template-form";
import { parseMonthParam, type Budget } from "../../_components/budget-types";

interface TemplateNewExtra {
  budgets: Budget[];
  loading: boolean;
}

/** The month's budget rows (same request the budgets list makes) are what the template saves. */
function useTemplateBudgets(): LoadState<unknown, TemplateNewExtra> {
  const searchParams = useSearchParams();
  const month = parseMonthParam(searchParams.get("month"), getCurrentMonth());
  const { displayCurrency } = useDisplayCurrency();

  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/budgets?month=${month}&rollover=1&currency=${encodeURIComponent(displayCurrency)}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => { if (!cancelled) setBudgets(Array.isArray(data) ? data : []); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [month, displayCurrency]);

  return { status: "ready", extra: { budgets, loading }, retry: () => {} };
}

function NewTemplatePage() {
  const searchParams = useSearchParams();
  const month = parseMonthParam(searchParams.get("month"), getCurrentMonth());

  return (
    <FormPage
      id="template-new"
      title="Save as template"
      subtitle={getMonthLabel(month)}
      fallbackReturn={`/budgets?month=${month}`}
      form="external"
      useLoad={useTemplateBudgets}
      header={{ actions: null }}
    >
      {(ctx) => {
        const { budgets, loading } = ctx.extra ?? { budgets: [], loading: true };
        if (loading) return <PageSkeleton variant="list" rows={3} />;
        if (budgets.length === 0) {
          return (
            <p className="text-sm text-muted-foreground">
              There are no budgets for {getMonthLabel(month)} to save. <Link href={ctx.returnTo} className="underline">Back to budgets</Link>
            </p>
          );
        }
        return <SaveTemplateForm budgets={budgets} onSaved={() => ctx.router.push(ctx.returnTo)} />;
      }}
    </FormPage>
  );
}

export default function NewTemplateRoute() {
  return (
    <Suspense fallback={null}>
      <NewTemplatePage />
    </Suspense>
  );
}
