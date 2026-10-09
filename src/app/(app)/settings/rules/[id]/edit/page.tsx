"use client";

import { Suspense } from "react";
import { useParams } from "next/navigation";
import { RuleFormPage } from "../../_components/rule-form-screen";

function EditRulePage() {
  const params = useParams<{ id: string }>();
  const raw = params.id ?? "";
  const ruleId = /^\d+$/.test(raw) ? Number(raw) : null;
  return <RuleFormPage mode="edit" ruleId={ruleId} />;
}

export default function EditRuleRoute() {
  return (
    <Suspense fallback={null}>
      <EditRulePage />
    </Suspense>
  );
}
