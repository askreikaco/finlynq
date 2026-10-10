"use client";

import { useCallback, useEffect, useState } from "react";
import { useDisplayCurrency } from "@/components/currency-provider";
import type { LoadState, LoadStatus } from "@/lib/forms/load-state";
import { goalToForm, type Account, type Goal, type GoalFormState } from "./goal-form";

export interface GoalEditExtra {
  form: GoalFormState;
  accounts: Account[];
}

/** Edit page data: the goal from the list (matched by route id) and the linked-account options. */
export function useGoalEditLoad({ params }: { params: Record<string, string | undefined> }): LoadState<Goal, GoalEditExtra> {
  const goalId = Number(params.id);
  const { displayCurrency } = useDisplayCurrency();

  const [goal, setGoal] = useState<Goal | null>(null);
  const [form, setForm] = useState<GoalFormState | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(() => {
    setLoadError(false);
    fetch("/api/goals")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Failed to load goals"))))
      .then((data: Goal[]) => {
        const found = Array.isArray(data) ? data.find((g) => g.id === goalId) ?? null : null;
        setGoal(found);
        setForm(found ? goalToForm(found, displayCurrency) : null);
      })
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  }, [goalId, displayCurrency]);

  useEffect(() => {
    load();
    fetch("/api/accounts")
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setAccounts(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, [load]);

  let status: LoadStatus;
  if (loading) status = "loading";
  else if (loadError) status = "error";
  else if (goal && form) status = "ready";
  else status = "notFound";

  return {
    status,
    record: goal ?? undefined,
    extra: form ? { form, accounts } : undefined,
    retry: () => {
      setLoading(true);
      load();
    },
  };
}
