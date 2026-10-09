"use client";

/** /settings/investments/securities/new — add a security (bare catalog entry). */

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/mobile";
import { AddSecurityForm } from "../../_components/add-security-form";
import { backHref, returnHref } from "../../_components/shared";

function NewSecurityPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const raw = searchParams.get("returnTo");
  const back = backHref(raw);
  return (
    <div data-testid="investments-security-new" className="mx-auto w-full max-w-xl">
      <PageHeader title="Add security" backHref={back} backLabel="Back" className="flex items-center justify-between" />
      <div className="mt-3">
        <AddSecurityForm
          onCancel={() => router.push(back)}
          onSaved={(notice) => router.push(returnHref(raw, notice))}
        />
      </div>
    </div>
  );
}

export default function NewSecurityRoute() {
  return (
    <Suspense fallback={null}>
      <NewSecurityPage />
    </Suspense>
  );
}
