"use client";

import { useEffect, useState } from "react";
import type { LoadState } from "@/lib/forms/load-state";
import type { LoanAccount } from "./loan-types";

/**
 * Load for /loans/new: the account list for the form's account picker.
 * No record and no loading state: the form renders at once, the picker fills in when the list arrives.
 */
export function useLoanNewLoad(): LoadState<unknown, LoanAccount[]> {
  const [accounts, setAccounts] = useState<LoanAccount[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/accounts")
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => { if (!cancelled && Array.isArray(data)) setAccounts(data); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  return { status: "ready", extra: accounts, retry: () => undefined };
}
