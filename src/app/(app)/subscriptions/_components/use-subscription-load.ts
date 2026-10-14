"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { LoadState, LoadStatus } from "@/lib/forms/load-state";
import { EMPTY_DRAFT, type SubscriptionDraft } from "./subscription-form";
import { draftFromSearchParams } from "./draft-params";
import type { Subscription } from "./types";

export type SubscriptionOption = { id: number; name: string | null };

export interface SubscriptionNewExtra {
  initial: SubscriptionDraft;
  categories: SubscriptionOption[];
  accounts: SubscriptionOption[];
}

export interface SubscriptionEditExtra {
  categories: SubscriptionOption[];
  accounts: SubscriptionOption[];
}

function useOptions(): { categories: SubscriptionOption[]; accounts: SubscriptionOption[] } {
  const [categories, setCategories] = useState<SubscriptionOption[]>([]);
  const [accounts, setAccounts] = useState<SubscriptionOption[]>([]);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/categories")
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => { if (!cancelled && Array.isArray(data)) setCategories(data); })
      .catch(() => {});
    fetch("/api/accounts")
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => { if (!cancelled && Array.isArray(data)) setAccounts(data); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);
  return { categories, accounts };
}

/** Create data: the prefill (a detected recurring payment under review arrives as query params, read once) and the pickers. */
export function useSubscriptionNewLoad(): LoadState<unknown, SubscriptionNewExtra> {
  const searchParams = useSearchParams();
  const [initial] = useState<SubscriptionDraft>(() => {
    const fromQuery = draftFromSearchParams(searchParams);
    return fromQuery.name ? fromQuery : EMPTY_DRAFT;
  });
  const { categories, accounts } = useOptions();
  return { status: "ready", extra: { initial, categories, accounts }, retry: () => undefined };
}

/** Edit data: the subscription from the list (there is no single-subscription GET; matched by route/pane id) and the pickers. */
export function useSubscriptionEditLoad({ params }: { params: Record<string, string | undefined> }): LoadState<Subscription, SubscriptionEditExtra> {
  const id = Number(params.id);
  const [sub, setSub] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const { categories, accounts } = useOptions();

  const load = useCallback(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(false);
    fetch("/api/subscriptions")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("load failed"))))
      .then((data) => {
        if (cancelled) return;
        const rows: Subscription[] = Array.isArray(data) ? data : [];
        setSub(rows.find((s) => s.id === id) ?? null);
      })
      .catch(() => { if (!cancelled) setLoadError(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [id]);

  useEffect(() => load(), [load]);

  let status: LoadStatus;
  if (loading) status = "loading";
  else if (loadError) status = "error";
  else if (sub) status = "ready";
  else status = "notFound";
  return { status, record: sub ?? undefined, extra: { categories, accounts }, retry: () => { load(); } };
}
