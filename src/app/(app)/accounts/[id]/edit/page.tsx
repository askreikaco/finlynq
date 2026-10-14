"use client";

import { Suspense } from "react";
import { AccountFormPanel } from "../../_components/account-form-panel";

export default function EditAccountRoute() {
  return (
    <Suspense fallback={null}>
      <AccountFormPanel mode="edit" />
    </Suspense>
  );
}
