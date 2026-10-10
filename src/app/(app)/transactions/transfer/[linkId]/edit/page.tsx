"use client";

/** /transactions/transfer/[linkId]/edit — Edit transfer (both legs) as a full page (PKG1 tx-edit). */

import { Suspense } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { safeReturnTo } from "@/lib/accounts/groups-return-to";
import { TW } from "@/lib/design/tokens";
import { useEditSource } from "../../../_components/use-edit-source";
import { TransactionEditForm } from "../../../_components/transaction-edit-form";
import { PageHeader } from "@/components/mobile";

const TX_RETURN_FALLBACK = "/transactions";

function EditTransferInner() {
  const params = useParams<{ linkId: string }>();
  const searchParams = useSearchParams();
  const returnTo = safeReturnTo(searchParams.get("returnTo"), TX_RETURN_FALLBACK);
  const linkId = decodeURIComponent(params.linkId ?? "");
  const source = useEditSource({ kind: "transfer", linkId, returnTo });

  if (!linkId) {
    return (
      <div className={`mx-auto w-full ${TW.form} space-y-3`}>
        <PageHeader title="Edit transfer" backHref={returnTo} backLabel="Back" />
        <p className="text-sm text-foreground">That transfer link is not valid.</p>
        <Link href={returnTo} className="text-sm text-primary underline">Back to transactions</Link>
      </div>
    );
  }
  if (source.status === "loading") {
    return (
      <div className={`mx-auto w-full ${TW.form}`}>
        <PageHeader title="Edit transfer" backHref={returnTo} backLabel="Back" />
        <div data-testid="tx-edit-loading" className="mt-3 text-sm text-muted-foreground">Loading…</div>
      </div>
    );
  }
  if (source.status === "missing") {
    return (
      <div className={`mx-auto w-full ${TW.form} space-y-3`}>
        <PageHeader title="Edit transfer" backHref={returnTo} backLabel="Back" />
        <p className="text-sm text-foreground">{source.message}</p>
        <Link href={returnTo} className="text-sm text-primary underline">Back to transactions</Link>
      </div>
    );
  }
  return (
    <TransactionEditForm
      initialState={source.initialState}
      accounts={source.accounts}
      categories={source.categories}
      holdings={source.holdings}
      returnTo={returnTo}
    />
  );
}

export default function EditTransferRoute() {
  return (
    <Suspense fallback={null}>
      <EditTransferInner />
    </Suspense>
  );
}
