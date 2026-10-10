"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { FormPage } from "@/components/templates/form-page";
import { useDisplayCurrency } from "@/components/currency-provider";
import { safeReturnTo } from "@/lib/nav/return-to";
import type { LoadState } from "@/lib/forms/load-state";
import { AccountForm } from "../_components/account-form";

type AccountRow = { id: number; name: string | null; alias: string | null; group: string | null };

type AccountsExtra = {
  accounts: AccountRow[];
  groups: string[];
  /** Only a present, valid returnTo overrides the post-create destination (fallback "" = none). */
  createdReturnTo: string;
};

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

/**
 * Existing accounts (archived included) feed the group suggestions and the alias-clash warning.
 * The form renders at once with empty suggestions, so the status is always "ready".
 */
function useAccountsLoad(): LoadState<unknown, AccountsExtra> {
  const searchParams = useSearchParams();
  const rawReturnTo = searchParams.get("returnTo");
  const createdReturnTo = rawReturnTo ? safeReturnTo(rawReturnTo, "") : "";

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

  const groups = useMemo(
    () => Array.from(new Set(accounts.map((a) => (a.group ?? "").trim()).filter(Boolean))),
    [accounts],
  );

  return { status: "ready", extra: { accounts, groups, createdReturnTo }, retry: () => undefined };
}

export default function NewAccountRoute() {
  const { displayCurrency } = useDisplayCurrency();
  return (
    <FormPage
      id="account-new"
      title="New account"
      fallbackReturn="/accounts"
      form="external"
      useLoad={useAccountsLoad}
      header={{ actions: null }}
    >
      {(ctx) => (
        <AccountForm
          mode="create"
          variant="rows"
          defaultCurrency={displayCurrency}
          existingGroups={ctx.extra?.groups ?? []}
          aliasWarning={(alias, excludeId) => aliasClash(ctx.extra?.accounts ?? [], alias, excludeId)}
          onCancel={() => ctx.router.push(ctx.returnTo)}
          onCreated={(created) => ctx.router.push(ctx.extra?.createdReturnTo || `/accounts/${created.id}`)}
        />
      )}
    </FormPage>
  );
}
