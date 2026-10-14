"use client";

import { Suspense } from "react";
import { SubscriptionFormPanel } from "../../_components/subscription-form-panel";

export default function EditSubscriptionRoute() {
  return (
    <Suspense fallback={null}>
      <SubscriptionFormPanel mode="edit" />
    </Suspense>
  );
}
