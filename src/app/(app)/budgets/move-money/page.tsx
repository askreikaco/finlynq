"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/mobile";
import { useDisplayCurrency } from "@/components/currency-provider";
import { getCurrentMonth, getMonthLabel } from "@/lib/currency";
import { safeReturnTo } from "@/lib/accounts/groups-return-to";
import { MoveMoneyForm } from "../_components/move-money-form";
import { parseMonthParam } from "../_components/budget-types";

function MoveMoneyPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const month = parseMonthParam(searchParams.get("month"), getCurrentMonth());
  const returnTo = safeReturnTo(searchParams.get("returnTo"), `/budgets?month=${month}`);
  const { displayCurrency } = useDisplayCurrency();

  return (
    <div data-testid="move-money-root" className="mx-auto w-full max-w-xl">
      <PageHeader
        title="Move money between envelopes"
        subtitle={getMonthLabel(month)}
        backHref={returnTo}
        backLabel="Back"
        className="flex items-center justify-between"
      />
      <div className="mt-3 pb-[calc(var(--sab,0px)+1.5rem)]">
        <MoveMoneyForm
          month={month}
          displayCurrency={displayCurrency}
          onMoved={() => router.push(returnTo)}
        />
      </div>
    </div>
  );
}

export default function MoveMoneyRoute() {
  return (
    <Suspense fallback={null}>
      <MoveMoneyPage />
    </Suspense>
  );
}
