"use client";

/** /settings/investments/securities/[id]/prices — manage price marks of a manual security. */

import { Suspense } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/mobile";
import { useDisplayCurrency } from "@/components/currency-provider";
import { PageSkeleton } from "@/components/page-skeleton";
import { ManagePricesPanel } from "../../../_components/manage-prices-dialog";
import { RouteNotice } from "../../../_components/form-rows";
import { backHref, symbolLabel, useInvestmentData } from "../../../_components/shared";

function ManagePricesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const params = useParams<{ id: string }>();
  const { displayCurrency } = useDisplayCurrency();
  const raw = searchParams.get("returnTo");
  const back = backHref(raw);
  const id = Number(params.id);
  const { securities, loading, error, reload } = useInvestmentData();
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
      <ManagePricesPanel
        key={security.id}
        securityId={security.id}
        currency={security.currency || displayCurrency}
        onDone={() => router.push(back)}
      />
    );
  }

  return (
    <div data-testid="investments-security-prices" className="mx-auto w-full max-w-xl">
      <PageHeader
        title="Prices"
        subtitle={security ? symbolLabel(security) : undefined}
        backHref={back}
        backLabel="Back"
        className="flex items-center justify-between"
      />
      <div className="mt-3">{body}</div>
    </div>
  );
}

export default function ManagePricesRoute() {
  return (
    <Suspense fallback={null}>
      <ManagePricesPage />
    </Suspense>
  );
}
