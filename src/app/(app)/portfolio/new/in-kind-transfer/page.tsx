"use client";

/** Level-2 page: In-kind transfer (/portfolio/new/in-kind-transfer). Form logic lives in TransferForm. */

import { Suspense } from "react";
import TransferForm from "@/components/portfolio/forms/TransferForm";

export default function PortfolioNewInKindTransferPage() {
  return (
    <Suspense fallback={null}>
      <TransferForm />
    </Suspense>
  );
}
