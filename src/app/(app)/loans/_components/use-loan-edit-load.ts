"use client";

import { useCallback, useEffect, useState } from "react";
import type { LoadState, LoadStatus } from "@/lib/forms/load-state";
import type { Loan, LoanAccount } from "./loan-types";

/** Edit data: the loan from the list (there is no single-loan GET; matched by route/pane id) and the account options. */
export function useLoanEditLoad({ params }: { params: Record<string, string | undefined> }): LoadState<Loan, LoanAccount[]> {
  const id = Number(params.id);
  const [loan, setLoan] = useState<Loan | null>(null);
  const [accounts, setAccounts] = useState<LoanAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(false);
    fetch("/api/loans")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Failed to load loans"))))
      .then((data) => {
        if (cancelled) return;
        const rows: Loan[] = Array.isArray(data) ? data : [];
        setLoan(rows.find((l) => l.id === id) ?? null);
      })
      .catch(() => { if (!cancelled) setLoadError(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    fetch("/api/accounts")
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => { if (!cancelled && Array.isArray(data)) setAccounts(data); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [id]);

  useEffect(() => load(), [load]);

  let status: LoadStatus;
  if (loading) status = "loading";
  else if (loadError) status = "error";
  else if (loan) status = "ready";
  else status = "notFound";
  return { status, record: loan ?? undefined, extra: accounts, retry: () => { load(); } };
}
