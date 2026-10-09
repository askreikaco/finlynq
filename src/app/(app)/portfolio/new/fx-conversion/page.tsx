"use client";

/** Level-2 page: FX conversion (/portfolio/new/fx-conversion). Form logic lives in FxConversionForm. */

import { Suspense } from "react";
import FxConversionForm from "@/components/portfolio/forms/FxConversionForm";

export default function PortfolioNewFxConversionPage() {
  return (
    <Suspense fallback={null}>
      <FxConversionForm />
    </Suspense>
  );
}
