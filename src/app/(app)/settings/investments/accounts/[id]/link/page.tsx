"use client";

/** /settings/investments/accounts/[id]/link — add a security to this account. */

import { Suspense } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/mobile";
import { PageSkeleton } from "@/components/page-skeleton";
import { LinkForm } from "../../../_components/link-form";
import { RouteNotice } from "../../../_components/form-rows";
import { backHref, returnHref, useInvestmentData } from "../../../_components/shared";

function LinkAccountPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const params = useParams<{ id: string }>();
  const raw = searchParams.get("returnTo");
  const back = backHref(raw);
  const id = Number(params.id);
  const { securities, accounts, loading, error, reload } = useInvestmentData();
  const account = accounts.find((a) => a.id === id);

  let body: React.ReactNode;
  if (!securities) {
    body = loading ? (
      <PageSkeleton variant="cards" rows={2} />
    ) : (
      <RouteNotice>
        {error ?? "Couldn't load this account."}{" "}
        <button type="button" className="underline" onClick={reload}>Retry</button>
      </RouteNotice>
    );
  } else if (!account) {
    body = <RouteNotice>This account no longer exists.</RouteNotice>;
  } else {
    body = (
      <LinkForm
        mode="security"
        fixedId={account.id}
        securities={securities}
        accounts={accounts}
        onCancel={() => router.push(back)}
        onSaved={(notice) => router.push(returnHref(raw, notice))}
      />
    );
  }

  return (
    <div data-testid="investments-account-link" className="mx-auto w-full max-w-xl">
      <PageHeader
        title="Add a security"
        subtitle={account?.name}
        backHref={back}
        backLabel="Back"
        className="flex items-center justify-between"
      />
      <div className="mt-3">{body}</div>
    </div>
  );
}

export default function LinkAccountRoute() {
  return (
    <Suspense fallback={null}>
      <LinkAccountPage />
    </Suspense>
  );
}
