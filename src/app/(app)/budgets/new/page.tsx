"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useDisplayCurrency } from "@/components/currency-provider";
import { getCurrentMonth, getMonthLabel } from "@/lib/currency";
import { FormPage } from "@/components/templates";
import { SetBudgetForm } from "../_components/set-budget-form";
import { parseMonthParam } from "../_components/budget-types";

function NewBudgetPage() {
  const searchParams = useSearchParams();
  const month = parseMonthParam(searchParams.get("month"), getCurrentMonth());
  const { displayCurrency } = useDisplayCurrency();

  return (
    <FormPage
      id="budget-new"
      title={`Set budget for ${getMonthLabel(month)}`}
      fallbackReturn={`/budgets?month=${month}`}
      form="external"
      header={{ actions: null }}
    >
      {(ctx) => (
        <SetBudgetForm
          month={month}
          displayCurrency={displayCurrency}
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
