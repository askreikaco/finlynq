"use client";

import { Suspense } from "react";
import { RuleFormPage } from "../_components/rule-form-screen";

export default function NewRulePage() {
  return (
    <Suspense fallback={null}>
      <RuleFormPage mode="create" />
    </Suspense>
  );
}
