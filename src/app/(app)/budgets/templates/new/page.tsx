"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/mobile";
import { PageSkeleton } from "@/components/page-skeleton";
import { useDisplayCurrency } from "@/components/currency-provider";
import { getCurrentMonth, getMonthLabel } from "@/lib/currency";
import { safeReturnTo } from "@/lib/accounts/groups-return-to";
import { TW } from "@/lib/design/tokens";
import { cn } from "@/lib/utils";
import { SaveTemplateForm } from "../../_components/save-template-form";
import { parseMonthParam, type Budget } from "../../_components/budget-types";

function NewTemplatePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const month = parseMonthParam(searchParams.get("month"), getCurrentMonth());
  const returnTo = safeReturnTo(searchParams.get("returnTo"), `/budgets?month=${month}`);
  const { displayCurrency } = useDisplayCurrency();

  // The month's budget rows (same request the budgets list makes) are what the template saves.
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

  return (
    <div data-testid="template-new-root" className={cn("mx-auto w-full", TW.form)}>
      <PageHeader
        title="Save as template"
        subtitle={getMonthLabel(month)}
        backHref={returnTo}
        backLabel="Back"
        className="flex items-center justify-between"
      />
      <div className={cn("mt-3", TW.formPad)}>
        {loading ? (
          <PageSkeleton variant="list" rows={3} />
        ) : budgets.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            There are no budgets for {getMonthLabel(month)} to save. <Link href={returnTo} className="underline">Back to budgets</Link>
          </p>
        ) : (
          <SaveTemplateForm budgets={budgets} onSaved={() => router.push(returnTo)} />
        )}
      </div>
    </div>
  );
}

export default function NewTemplateRoute() {
  return (
    <Suspense fallback={null}>
      <NewTemplatePage />
    </Suspense>
  );
}
