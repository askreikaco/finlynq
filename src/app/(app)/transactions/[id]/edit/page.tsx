"use client";

/** /transactions/[id]/edit — Edit transaction as a full page (PKG1 tx-edit). */

import { Suspense } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { safeReturnTo } from "@/lib/accounts/groups-return-to";
import { useEditSource } from "../../_components/use-edit-source";
import { TransactionEditForm } from "../../_components/transaction-edit-form";

const TX_RETURN_FALLBACK = "/transactions";

function EditTransactionInner() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const returnTo = safeReturnTo(searchParams.get("returnTo"), TX_RETURN_FALLBACK);
  const id = Number(params.id);
  const source = useEditSource({ kind: "transaction", id, returnTo });

  if (!Number.isInteger(id) || id <= 0) {
    return <Missing message="That transaction link is not valid." returnTo={returnTo} />;
  }
  if (source.status === "loading") {
    return <div data-testid="tx-edit-loading" className="px-4 py-6 text-sm text-muted-foreground">Loading…</div>;
  }
  if (source.status === "missing") {
    return <Missing message={source.message} returnTo={returnTo} />;
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

function Missing({ message, returnTo }: { message: string; returnTo: string }) {
  return (
    <div className="mx-auto w-full max-w-xl space-y-3 px-4 py-6">
      <p className="text-sm text-foreground">{message}</p>
      <Link href={returnTo} className="text-sm text-primary underline">
        Back to transactions
      </Link>
    </div>
  );
}

export default function EditTransactionRoute() {
  return (
    <Suspense fallback={null}>
      <EditTransactionInner />
    </Suspense>
  );
}
