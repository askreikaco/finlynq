"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/mobile";
import { useDisplayCurrency } from "@/components/currency-provider";
import { safeReturnTo } from "@/lib/accounts/groups-return-to";
import { AccountForm } from "../_components/account-form";

type AccountRow = { id: number; name: string | null; alias: string | null; group: string | null };

/** Same wording and rule as the Create dialog had: name or alias clashes with another account. */
function aliasClash(list: AccountRow[], alias: string, excludeId: number | null): string {
  const a = alias.trim().toLowerCase();
  if (!a) return "";
  const clash = list.find((acc) => {
    if (acc.id === excludeId) return false;
    const otherAlias = (acc.alias ?? "").trim().toLowerCase();
    const otherName = (acc.name ?? "").trim().toLowerCase();
    return otherAlias === a || otherName === a;
  });
  return clash
    ? `Another account ("${clash.name}") already uses this name or alias — matches may be ambiguous.`
    : "";
}

function NewAccountPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Back / Cancel go to returnTo (same-app path only), else the accounts list.
  const returnTo = safeReturnTo(searchParams.get("returnTo"));
  // Only a present, valid returnTo overrides the post-create destination (fallback "" = none).
  const rawReturnTo = searchParams.get("returnTo");
  const createdReturnTo = rawReturnTo ? safeReturnTo(rawReturnTo, "") : "";
  const { displayCurrency } = useDisplayCurrency();

  // Existing accounts (archived included) feed the group suggestions and the alias-clash warning.
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/accounts?includeArchived=1")
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => {
        if (!cancelled && Array.isArray(d)) setAccounts(d);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const existingGroups = useMemo(
    () => Array.from(new Set(accounts.map((a) => (a.group ?? "").trim()).filter(Boolean))),
    [accounts],
  );

  return (
    <div data-testid="account-new-root" className="mx-auto w-full max-w-xl">
      <PageHeader
        title="New account"
        backHref={returnTo}
        backLabel="Back"
        className="flex items-center justify-between"
      />
      <div className="mt-3 pb-[calc(var(--sab,0px)+1.5rem)]">
        <AccountForm
          mode="create"
          variant="rows"
          defaultCurrency={displayCurrency}
          existingGroups={existingGroups}
          aliasWarning={(alias, excludeId) => aliasClash(accounts, alias, excludeId)}
          onCancel={() => router.push(returnTo)}
          onCreated={(created) => router.push(createdReturnTo || `/accounts/${created.id}`)}
        />
      </div>
    </div>
  );
}

export default function NewAccountRoute() {
  return (
    <Suspense fallback={null}>
      <NewAccountPage />
    </Suspense>
  );
}
