"use client";

/** /settings/investments/securities/[id]/edit — edit name, ticker, asset type, pricing. */

import { Suspense } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/mobile";
import { PageSkeleton } from "@/components/page-skeleton";
import { EditSecurityForm } from "../../../_components/edit-security-form";
import { RouteNotice } from "../../../_components/form-rows";
import { backHref, returnHref, useInvestmentData } from "../../../_components/shared";

function EditSecurityPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const params = useParams<{ id: string }>();
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
      <EditSecurityForm
        key={security.id}
        security={security}
        onCancel={() => router.push(back)}
        onSaved={(notice) => router.push(returnHref(raw, notice))}
      />
    );
  }

  return (
    <div data-testid="investments-security-edit" className="mx-auto w-full max-w-xl">
      <PageHeader title="Edit security" backHref={back} backLabel="Back" className="flex items-center justify-between" />
      <div className="mt-3">{body}</div>
    </div>
  );
}

export default function EditSecurityRoute() {
  return (
    <Suspense fallback={null}>
      <EditSecurityPage />
    </Suspense>
  );
}
