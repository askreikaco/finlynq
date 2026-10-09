"use client";

/** Level-2 page: Swap (/portfolio/new/swap). Form logic lives in SwapForm. */

import { Suspense } from "react";
import SwapForm from "@/components/portfolio/forms/SwapForm";

export default function PortfolioNewSwapPage() {
  return (
    <Suspense fallback={null}>
      <SwapForm />
    </Suspense>
  );
}
