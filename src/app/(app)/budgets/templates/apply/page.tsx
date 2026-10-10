"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useDisplayCurrency } from "@/components/currency-provider";
import { getCurrentMonth, getMonthLabel } from "@/lib/currency";
import { FormPage } from "@/components/templates";
import { ApplyTemplateForm } from "../../_components/apply-template-form";
import { parseMonthParam } from "../../_components/budget-types";

function ApplyTemplatePage() {
  const searchParams = useSearchParams();
  const month = parseMonthParam(searchParams.get("month"), getCurrentMonth());
  const { displayCurrency } = useDisplayCurrency();

  return (
    <FormPage
      id="template-apply"
      title="Apply budget template"
      subtitle={`Applies to ${getMonthLabel(month)}`}
      fallbackReturn={`/budgets?month=${month}`}
      form="external"
      header={{ actions: null }}
    >
      {(ctx) => (
        <ApplyTemplateForm
          month={month}
          displayCurrency={displayCurrency}
          onApplied={() => ctx.router.push(ctx.returnTo)}
        />
      )}
    </FormPage>
  );
}

export default function ApplyTemplateRoute() {
  return (
    <Suspense fallback={null}>
      <ApplyTemplatePage />
    </Suspense>
  );
}
