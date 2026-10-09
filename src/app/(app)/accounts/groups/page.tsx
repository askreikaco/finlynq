"use client";

/**
 * /accounts/groups — full-page "Manage account groups" (was a dialog on /accounts).
 * Loads the group names per account type from /api/dashboard (same source as
 * /accounts) and renders ManageGroupsPanel. `?returnTo=` sets the back target;
 * only same-origin relative paths are honoured (see safeReturnTo).
 */

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/mobile";
import { useDisplayCurrency } from "@/components/currency-provider";
import { ErrorState } from "@/components/error-state";
import { type AccountGroupType } from "@/lib/accounts/groups";
import { safeReturnTo } from "@/lib/accounts/groups-return-to";
import { ManageGroupsPanel } from "../_components/manage-groups-panel";

type BalanceRow = { accountType: string; accountGroup: string | null };

function groupsOf(balances: BalanceRow[]): Record<AccountGroupType, string[]> {
  const pick = (t: AccountGroupType) =>
    Array.from(
      new Set(balances.filter((a) => a.accountType === t).map((a) => a.accountGroup || "Other")),
    );
  return { A: pick("A"), L: pick("L") };
}

function AccountGroupsContent() {
  const params = useSearchParams();
  const backHref = safeReturnTo(params.get("returnTo"));
  const { displayCurrency } = useDisplayCurrency();
  const [balances, setBalances] = useState<BalanceRow[] | null>(null);
  const [error, setError] = useState(false);

  const load = useCallback(() => {
    setError(false);
    const qs = new URLSearchParams({ currency: displayCurrency });
    fetch(`/api/dashboard?${qs.toString()}`)
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((d) => setBalances(d.balances ?? []))
      .catch(() => setError(true));
  }, [displayCurrency]);

  useEffect(() => {
    load();
  }, [load]);

  const groupsByType = useMemo(() => groupsOf(balances ?? []), [balances]);

  return (
    <div className="mx-auto w-full max-w-xl space-y-4 pb-[max(1.5rem,var(--sab,0px))]">
      <PageHeader
        className="flex items-center justify-between"
        title="Account groups"
        backHref={backHref}
        backLabel="Back to accounts"
      />
      {error ? (
        <ErrorState onRetry={load} />
      ) : balances === null ? (
        <p className="px-1 text-sm text-muted-foreground">Loading…</p>
      ) : (
        <ManageGroupsPanel groupsByType={groupsByType} onChanged={load} />
      )}
    </div>
  );
}

export default function AccountGroupsPage() {
  return (
    <Suspense fallback={null}>
      <AccountGroupsContent />
    </Suspense>
  );
}
