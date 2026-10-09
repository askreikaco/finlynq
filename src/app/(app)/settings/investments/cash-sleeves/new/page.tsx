"use client";

/**
 * /settings/investments/cash-sleeves/new?accountId=N — add a cash sleeve to an
 * investment account. The shared form lives in src/components/portfolio.
 */

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/mobile";
import { CashSleeveForm } from "@/components/portfolio/cash-sleeve-form";
import { backHref, returnHref } from "../../_components/shared";

function NewCashSleevePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const raw = searchParams.get("returnTo");
  const back = backHref(raw);
  const accountId = Number(searchParams.get("accountId"));
  const validAccount = Number.isInteger(accountId) && accountId > 0;
  return (
    <div data-testid="investments-cash-sleeve-new" className="mx-auto w-full max-w-xl">
      <PageHeader title="Add cash sleeve" backHref={back} backLabel="Back" className="flex items-center justify-between" />
      <div className="mt-3">
        {validAccount ? (
          <CashSleeveForm
            accountId={accountId}
            onCancel={() => router.push(back)}
            onSaved={() => router.push(returnHref(raw, "cash-added"))}
          />
        ) : (
          <p className="rounded-xl border bg-card px-4 py-3 text-sm text-destructive">
            No account selected. Go back and use “Cash” on an investment account.
          </p>
        )}
      </div>
    </div>
  );
}

export default function NewCashSleeveRoute() {
  return (
    <Suspense fallback={null}>
      <NewCashSleevePage />
    </Suspense>
  );
}
