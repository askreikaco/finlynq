"use client";

/** /transactions/[id]/edit — Edit transaction as a full page (PKG1 tx-edit). The form is the shared TransactionFormScreen. */

import { Suspense } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { safeReturnTo } from "@/lib/accounts/groups-return-to";
import { TransactionFormScreen } from "../../_components/transaction-form-screen";

const TX_RETURN_FALLBACK = "/transactions";

function EditTransactionInner() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const returnTo = safeReturnTo(searchParams.get("returnTo"), TX_RETURN_FALLBACK);
  return <TransactionFormScreen mode="edit" id={params.id} returnTo={returnTo} />;
}

export default function EditTransactionRoute() {
  return (
    <Suspense fallback={null}>
      <EditTransactionInner />
    </Suspense>
  );
}
