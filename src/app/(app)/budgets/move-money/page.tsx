"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useDisplayCurrency } from "@/components/currency-provider";
import { getCurrentMonth, getMonthLabel } from "@/lib/currency";
import { FormPage } from "@/components/templates";
import { MoveMoneyForm } from "../_components/move-money-form";
import { parseMonthParam } from "../_components/budget-types";

function MoveMoneyPage() {
  const searchParams = useSearchParams();
  const month = parseMonthParam(searchParams.get("month"), getCurrentMonth());
  const { displayCurrency } = useDisplayCurrency();

  return (
    <FormPage
      id="move-money"
      title="Move money between envelopes"
      subtitle={getMonthLabel(month)}
      fallbackReturn={`/budgets?month=${month}`}
      form="external"
      header={{ actions: null }}
    >
      {(ctx) => (
        <MoveMoneyForm
          month={month}
          displayCurrency={displayCurrency}
          onMoved={() => ctx.router.push(ctx.returnTo)}
        />
      )}
    </FormPage>
  );
}

export default function MoveMoneyRoute() {
  return (
    <Suspense fallback={null}>
      <MoveMoneyPage />
    </Suspense>
  );
}
