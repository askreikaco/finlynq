"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/mobile";
import { useDisplayCurrency } from "@/components/currency-provider";
import { getCurrentMonth, getMonthLabel } from "@/lib/currency";
import { safeReturnTo } from "@/lib/accounts/groups-return-to";
import { TW } from "@/lib/design/tokens";
import { cn } from "@/lib/utils";
import { SetBudgetForm } from "../_components/set-budget-form";
import { parseMonthParam } from "../_components/budget-types";

function NewBudgetPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const month = parseMonthParam(searchParams.get("month"), getCurrentMonth());
  // Back / success go to returnTo (same-app path only), else the budgets list for this month.
  const returnTo = safeReturnTo(searchParams.get("returnTo"), `/budgets?month=${month}`);
  const { displayCurrency } = useDisplayCurrency();

  return (
    <div data-testid="budget-new-root" className={cn("mx-auto w-full", TW.form)}>
      <PageHeader
        title={`Set budget for ${getMonthLabel(month)}`}
        backHref={returnTo}
        backLabel="Back"
        className="flex items-center justify-between"
      />
      <div className={cn("mt-3", TW.formPad)}>
        <SetBudgetForm
          month={month}
          displayCurrency={displayCurrency}
          onSaved={() => router.push(returnTo)}
        />
      </div>
    </div>
  );
}

export default function NewBudgetRoute() {
  return (
    <Suspense fallback={null}>
      <NewBudgetPage />
    </Suspense>
  );
}
