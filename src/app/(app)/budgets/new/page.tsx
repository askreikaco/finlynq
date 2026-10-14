"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useDisplayCurrency } from "@/components/currency-provider";
import { getCurrentMonth, getMonthLabel } from "@/lib/currency";
import { FormPage } from "@/components/templates";
import { SetBudgetForm } from "../_components/set-budget-form";
import { parseMonthParam, type Budget } from "../_components/budget-types";
import { useCacheFirstJson } from "@/lib/data/use-cache-first";
import { isLocalWriteQueueOn } from "@/lib/data/local-write-queue";

function NewBudgetPage() {
  const searchParams = useSearchParams();
  const categoryParam = searchParams.get("categoryId");
  const initialCategoryId = categoryParam && /^\d+$/.test(categoryParam) ? categoryParam : undefined;
  const month = parseMonthParam(searchParams.get("month"), getCurrentMonth());
  const { displayCurrency, isLoading: currencyLoading } = useDisplayCurrency();
  // The month's server budgets, only for the offline queue (edit baseline). Same url as the list: shares its cache.
  // Flag off: no request at all.
  const existingRes = useCacheFirstJson<Budget[]>(
    currencyLoading || !isLocalWriteQueueOn() ? null : `/api/budgets?month=${month}&currency=${encodeURIComponent(displayCurrency)}`,
  );

  return (
    <FormPage
      id="budget-new"
      title={`Set budget for ${getMonthLabel(month)}`}
      fallbackReturn={`/categories?month=${month}`}
      form="external"
      header={{ actions: null }}
    >
      {(ctx) => (
        <SetBudgetForm
          month={month}
          initialCategoryId={initialCategoryId}
          displayCurrency={displayCurrency}
          existing={Array.isArray(existingRes.data) ? existingRes.data : undefined}
          onSaved={() => ctx.router.push(ctx.returnTo)}
        />
      )}
    </FormPage>
  );
}

export default function NewBudgetRoute() {
  return (
    <Suspense fallback={null}>
      <NewBudgetPage />
    </Suspense>
  );
}
