"use client";

/** /transactions/transfer/[linkId]/edit — Edit transfer (both legs) as a full page (PKG1 tx-edit). The form is the shared TransactionFormScreen. */

import { Suspense } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { safeReturnTo } from "@/lib/accounts/groups-return-to";
import { TransactionFormScreen } from "../../../_components/transaction-form-screen";

const TX_RETURN_FALLBACK = "/transactions";

function EditTransferInner() {
  const params = useParams<{ linkId: string }>();
  const searchParams = useSearchParams();
  const returnTo = safeReturnTo(searchParams.get("returnTo"), TX_RETURN_FALLBACK);
  const linkId = decodeURIComponent(params.linkId ?? "");
  return <TransactionFormScreen mode="edit-transfer" id={linkId} returnTo={returnTo} />;
}

export default function EditTransferRoute() {
  return (
    <Suspense fallback={null}>
      <EditTransferInner />
    </Suspense>
  );
}
