"use client";

import { useCallback, useEffect, useState } from "react";
import type { LoadState, LoadStatus } from "@/lib/forms/load-state";
import type { Goal } from "./goal-form";

/** Goals list data. Error retry shows the skeleton again; a plain reload (status toggle, delete) refetches in place. */
export function useGoalsLoad(): LoadState<Goal[]> {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(() => {
    setLoadError(false);
    fetch("/api/goals")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Failed to load goals"))))
      .then((data) => setGoals(Array.isArray(data) ? data : []))
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const status: LoadStatus = loading ? "loading" : loadError ? "error" : "ready";
  return {
    status,
    record: goals,
    retry: () => {
      if (loadError) setLoading(true);
      load();
    },
  };
}
