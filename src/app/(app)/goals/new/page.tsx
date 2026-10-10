"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/mobile";
import { useDisplayCurrency } from "@/components/currency-provider";
import { safeReturnTo } from "@/lib/accounts/groups-return-to";
import { GoalForm, GOAL_TYPES, emptyGoalForm, type Account, type GoalFormState } from "../_components/goal-form";

const GOALS_HOME = "/goals";

/** Prefill from the empty-state chips: ?name=…&type=… (type must be a known goal type). */
function seedFromParams(params: URLSearchParams, displayCurrency: string): GoalFormState {
  const base = emptyGoalForm(displayCurrency);
  const name = params.get("name")?.slice(0, 200) ?? "";
  const rawType = params.get("type") ?? "";
  const type = (GOAL_TYPES as readonly string[]).includes(rawType) ? rawType : base.type;
  return { ...base, name, type };
}

function NewGoalPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Back / Cancel / success go to returnTo (same-app path only), else the goals list.
  const returnTo = safeReturnTo(searchParams.get("returnTo"), GOALS_HOME);
  const { displayCurrency } = useDisplayCurrency();
  const [seed] = useState<GoalFormState>(() => seedFromParams(searchParams, displayCurrency));

  const [accounts, setAccounts] = useState<Account[]>([]);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/accounts")
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        if (!cancelled && Array.isArray(data)) setAccounts(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div data-testid="goal-new-root" className="mx-auto w-full max-w-form">
      <PageHeader
        title="New financial goal"
        backHref={returnTo}
        backLabel="Back"
        className="flex items-center justify-between"
      />
      <div className="mt-3 pb-[var(--form-bottom-pad)]">
        <GoalForm
          mode="add"
          initial={seed}
          accounts={accounts}
          displayCurrency={displayCurrency}
          onSaved={() => router.push(returnTo)}
          onCancel={() => router.push(returnTo)}
        />
      </div>
    </div>
  );
}

export default function NewGoalRoute() {
  return (
    <Suspense fallback={null}>
      <NewGoalPage />
    </Suspense>
  );
}
