"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/mobile";
import { useDisplayCurrency } from "@/components/currency-provider";
import { safeReturnTo } from "@/lib/accounts/groups-return-to";
import { TW } from "@/lib/design/tokens";
import { LoanForm } from "../_components/loan-form";
import type { LoanAccount } from "../_components/loan-types";

const LOANS_FALLBACK = "/loans";

function NewLoanPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Back / Cancel / success all go to returnTo (same-app path only), else the loans list.
  const returnTo = safeReturnTo(searchParams.get("returnTo"), LOANS_FALLBACK);
  const { displayCurrency } = useDisplayCurrency();
  const [accounts, setAccounts] = useState<LoanAccount[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/accounts")
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => { if (!cancelled && Array.isArray(data)) setAccounts(data); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  return (
    <div data-testid="loan-new-root" className={`mx-auto w-full ${TW.form}`}>
      <PageHeader title="New loan" backHref={returnTo} backLabel="Back" className="flex items-center justify-between" />
      <div className={`mt-3 ${TW.formPad}`}>
        <LoanForm
          mode="create"
          defaultCurrency={displayCurrency}
          accounts={accounts}
          onCancel={() => router.push(returnTo)}
          onSaved={() => router.push(returnTo)}
        />
      </div>
    </div>
  );
}

export default function NewLoanRoute() {
  return (
    <Suspense fallback={null}>
      <NewLoanPage />
    </Suspense>
  );
}
