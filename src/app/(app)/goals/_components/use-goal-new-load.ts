"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useDisplayCurrency } from "@/components/currency-provider";
import type { LoadState } from "@/lib/forms/load-state";
import { GOAL_TYPES, emptyGoalForm, type Account, type GoalFormState } from "./goal-form";

/** Prefill from the empty-state chips: ?name=…&type=… (type must be a known goal type). */
function seedFromParams(params: URLSearchParams, displayCurrency: string): GoalFormState {
  const base = emptyGoalForm(displayCurrency);
  const name = params.get("name")?.slice(0, 200) ?? "";
  const rawType = params.get("type") ?? "";
  const type = (GOAL_TYPES as readonly string[]).includes(rawType) ? rawType : base.type;
  return { ...base, name, type };
}

export interface GoalNewExtra {
  accounts: Account[];
  seed: GoalFormState;
  displayCurrency: string;
}

/** Create page data: the linked-account options and the chip prefill (read once, at mount). */
export function useGoalNewLoad(): LoadState<unknown, GoalNewExtra> {
  const searchParams = useSearchParams();
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

  return { status: "ready", extra: { accounts, seed, displayCurrency }, retry: () => {} };
}
