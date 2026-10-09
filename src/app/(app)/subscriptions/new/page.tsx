"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/mobile";
import { safeReturnTo } from "@/lib/accounts/groups-return-to";
import { SubscriptionForm, EMPTY_DRAFT, type SubscriptionDraft } from "../_components/subscription-form";
import { draftFromSearchParams } from "../_components/draft-params";

const SUBSCRIPTIONS_FALLBACK = "/subscriptions";

type Option = { id: number; name: string | null };

function NewSubscriptionPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = safeReturnTo(searchParams.get("returnTo"), SUBSCRIPTIONS_FALLBACK);
  // Prefill: a detected recurring payment ("Review") arrives as query params.
  const [initial] = useState<SubscriptionDraft>(() => {
    const fromQuery = draftFromSearchParams(searchParams);
    return fromQuery.name ? fromQuery : EMPTY_DRAFT;
  });
  const [categories, setCategories] = useState<Option[]>([]);
  const [accounts, setAccounts] = useState<Option[]>([]);

  useEffect(() => {
    fetch("/api/categories")
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setCategories(Array.isArray(data) ? data : []))
      .catch(() => {});
    fetch("/api/accounts")
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setAccounts(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);

  return (
    <div data-testid="subscription-new-root" className="mx-auto w-full max-w-xl">
      <PageHeader title="New subscription" backHref={returnTo} backLabel="Back" className="flex items-center justify-between" />
      <div className="mt-3 pb-[calc(var(--sab,0px)+1.5rem)]">
        <SubscriptionForm
          mode="create"
          initial={initial}
          categories={categories}
          accounts={accounts}
          onCancel={() => router.push(returnTo)}
          onSaved={() => router.push(returnTo)}
        />
      </div>
    </div>
  );
}

export default function NewSubscriptionRoute() {
  return (
    <Suspense fallback={null}>
      <NewSubscriptionPage />
    </Suspense>
  );
}
