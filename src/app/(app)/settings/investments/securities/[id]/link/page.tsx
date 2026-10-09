"use client";

/** /settings/investments/securities/[id]/link — add this security to an account. */

import { Suspense } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/mobile";
import { PageSkeleton } from "@/components/page-skeleton";
import { LinkForm } from "../../../_components/link-form";
import { RouteNotice } from "../../../_components/form-rows";
import { backHref, returnHref, symbolLabel, useInvestmentData } from "../../../_components/shared";

function LinkSecurityPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const params = useParams<{ id: string }>();
  const raw = searchParams.get("returnTo");
  const back = backHref(raw);
  const id = Number(params.id);
  const { securities, accounts, loading, error, reload } = useInvestmentData();
  const security = securities?.find((s) => s.id === id);

  let body: React.ReactNode;
  if (!securities) {
    body = loading ? (
      <PageSkeleton variant="cards" rows={2} />
    ) : (
      <RouteNotice>
        {error ?? "Couldn't load this security."}{" "}
        <button type="button" className="underline" onClick={reload}>Retry</button>
      </RouteNotice>
    );
  } else if (!security) {
    body = <RouteNotice>This security no longer exists.</RouteNotice>;
  } else {
    body = (
      <LinkForm
        mode="account"
        fixedId={security.id}
        securities={securities}
        accounts={accounts}
        onCancel={() => router.push(back)}
        onSaved={(notice) => router.push(returnHref(raw, notice))}
      />
    );
  }

  return (
    <div data-testid="investments-security-link" className="mx-auto w-full max-w-xl">
      <PageHeader
        title="Add to an account"
        subtitle={security ? symbolLabel(security) : undefined}
        backHref={back}
        backLabel="Back"
        className="flex items-center justify-between"
      />
      <div className="mt-3">{body}</div>
    </div>
  );
}

export default function LinkSecurityRoute() {
  return (
    <Suspense fallback={null}>
      <LinkSecurityPage />
    </Suspense>
  );
}
