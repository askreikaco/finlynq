"use client";

import { Suspense } from "react";
import { FormPage } from "@/components/templates";
import { useDisplayCurrency } from "@/components/currency-provider";
import { LoanForm } from "../_components/loan-form";
import type { LoanAccount } from "../_components/loan-types";
import { useLoanNewLoad } from "../_components/use-loan-new-load";

const LOANS_FALLBACK = "/loans";
const NO_ACCOUNTS: LoanAccount[] = [];

function NewLoanPage() {
  const { displayCurrency } = useDisplayCurrency();

  // Back / Cancel / success all go to returnTo (same-app path only), else the loans list.
  return (
    <FormPage
      id="loan-new"
      title="New loan"
      fallbackReturn={LOANS_FALLBACK}
      form="external"
      useLoad={useLoanNewLoad}
      header={{ actions: null }}
    >
      {(ctx) => (
        <LoanForm
          mode="create"
          defaultCurrency={displayCurrency}
          accounts={ctx.extra ?? NO_ACCOUNTS}
          onCancel={() => ctx.router.push(ctx.returnTo)}
          onSaved={() => ctx.router.push(ctx.returnTo)}
        />
      )}
    </FormPage>
  );
}

export default function NewLoanRoute() {
  return (
    <Suspense fallback={null}>
      <NewLoanPage />
    </Suspense>
  );
}
