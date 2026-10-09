"use client";

/** /transactions/transfer/[linkId]/edit — Edit transfer (both legs) as a full page (PKG1 tx-edit). */

import { Suspense } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { safeReturnTo } from "@/lib/accounts/groups-return-to";
import { useEditSource } from "../../../_components/use-edit-source";
import { TransactionEditForm } from "../../../_components/transaction-edit-form";

const TX_RETURN_FALLBACK = "/transactions";

function EditTransferInner() {
  const params = useParams<{ linkId: string }>();
  const searchParams = useSearchParams();
  const returnTo = safeReturnTo(searchParams.get("returnTo"), TX_RETURN_FALLBACK);
  const linkId = decodeURIComponent(params.linkId ?? "");
  const source = useEditSource({ kind: "transfer", linkId, returnTo });

  if (!linkId) {
    return (
      <div className="mx-auto w-full max-w-xl space-y-3 px-4 py-6">
        <p className="text-sm text-foreground">That transfer link is not valid.</p>
        <Link href={returnTo} className="text-sm text-primary underline">Back to transactions</Link>
      </div>
    );
  }
  if (source.status === "loading") {
    return <div data-testid="tx-edit-loading" className="px-4 py-6 text-sm text-muted-foreground">Loading…</div>;
  }
  if (source.status === "missing") {
    return (
      <div className="mx-auto w-full max-w-xl space-y-3 px-4 py-6">
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
