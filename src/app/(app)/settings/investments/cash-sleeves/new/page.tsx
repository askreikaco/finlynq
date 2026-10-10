"use client";

/**
 * /settings/investments/cash-sleeves/new?accountId=N — add a cash sleeve to an
 * investment account. The shared form lives in src/components/portfolio.
 */

import { useSearchParams } from "next/navigation";
import { FormPage } from "@/components/templates/form-page";
import { CashSleeveForm } from "@/components/portfolio/cash-sleeve-form";
import { INVESTMENTS_HOME, returnHref } from "../../_components/shared";

function CashSleeveBody({ returnTo, router }: { returnTo: string; router: { push: (href: string) => void } }) {
  const searchParams = useSearchParams();
  const accountId = Number(searchParams.get("accountId"));
  const validAccount = Number.isInteger(accountId) && accountId > 0;
  return validAccount ? (
    <CashSleeveForm
      accountId={accountId}
      onCancel={() => router.push(returnTo)}
      onSaved={() => router.push(returnHref(returnTo, "cash-added"))}
    />
  ) : (
    <p className="rounded-xl border bg-card px-4 py-3 text-sm text-destructive">
      No account selected. Go back and use “Cash” on an investment account.
    </p>
  );
}

export default function NewCashSleeveRoute() {
  return (
    <FormPage
      rootTestId="investments-cash-sleeve-new"
      id="investments-cash-sleeve-new"
      title="Add cash sleeve"
      fallbackReturn={INVESTMENTS_HOME}
      form="external"
      width="form"
      padBottom="none"
      header={{ actions: null }}
    >
      {(ctx) => <CashSleeveBody returnTo={ctx.returnTo} router={ctx.router} />}
    </FormPage>
  );
}
