"use client";

/** /transactions/[id]/split — Split transaction as a full page (PKG1 tx-edit). */

import { Suspense, useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/components/mobile";
import { safeReturnTo } from "@/lib/accounts/groups-return-to";
import {
  TransactionSplitForm,
  rowsFromSplits,
  type SplitAccount,
  type SplitCategory,
  type SplitRowState,
  type SplitTotal,
} from "../../_components/transaction-split-form";

type Loaded = {
  total: SplitTotal;
  categories: SplitCategory[];
  accounts: SplitAccount[];
  initialRows: SplitRowState[];
  hasSplits: boolean;
};

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} failed (${res.status})`);
  return (await res.json()) as T;
}

function SplitInner() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const returnTo = safeReturnTo(searchParams.get("returnTo"), "/transactions");
  const id = Number(params.id);
  const [state, setState] = useState<{ status: "loading" } | { status: "missing"; message: string } | { status: "ready"; data: Loaded }>({ status: "loading" });

  useEffect(() => {
    if (!Number.isInteger(id) || id <= 0) {
      setState({ status: "missing", message: "That transaction link is not valid." });
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const [txRes, categories, accounts, splits] = await Promise.all([
          getJson<{ data?: Array<{ id: number; amount: number; currency: string }> }>(`/api/transactions?id=${id}`),
          getJson<SplitCategory[]>("/api/categories"),
          getJson<SplitAccount[]>("/api/accounts?includeArchived=1"),
          getJson<Array<{ categoryId: number | null; accountId: number | null; amount: number; note: string | null; description: string | null; tags: string | null }>>(
            `/api/transactions/splits?transactionId=${id}`,
          ).catch(() => []),
        ]);
        const tx = txRes.data?.[0];
        if (!tx) {
          if (!cancelled) setState({ status: "missing", message: "This transaction no longer exists." });
          return;
        }
        const splitRows = Array.isArray(splits) ? splits : [];
        if (!cancelled) {
          setState({
            status: "ready",
            data: {
              total: { id: tx.id, amount: tx.amount, currency: tx.currency },
              categories: Array.isArray(categories) ? categories : [],
              accounts: Array.isArray(accounts) ? accounts : [],
              initialRows: rowsFromSplits(splitRows, tx.amount),
              hasSplits: splitRows.length > 0,
            },
          });
        }
      } catch (err) {
        if (!cancelled) setState({ status: "missing", message: err instanceof Error ? err.message : "Could not load this transaction." });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (state.status === "loading") {
    return (
      <div className="mx-auto w-full max-w-xl">
        <PageHeader title="Split transaction" backHref={returnTo} backLabel="Back" />
        <div data-testid="tx-split-loading" className="mt-3 text-sm text-muted-foreground">Loading…</div>
      </div>
    );
  }
  if (state.status === "missing") {
    return (
      <div className="mx-auto w-full max-w-xl space-y-3">
        <PageHeader title="Split transaction" backHref={returnTo} backLabel="Back" />
        <p className="text-sm text-foreground">{state.message}</p>
        <Link href={returnTo} className="text-sm text-primary underline">Back to transactions</Link>
      </div>
    );
  }
  const d = state.data;
  return (
    <TransactionSplitForm
      transactionId={d.total.id}
      total={d.total}
      categories={d.categories}
      accounts={d.accounts}
      initialRows={d.initialRows}
      hasSplitsInitially={d.hasSplits}
      returnTo={returnTo}
    />
  );
}

export default function SplitTransactionRoute() {
  return (
    <Suspense fallback={null}>
      <SplitInner />
    </Suspense>
  );
}
