"use client";

/** /transactions/[id]/split — Split transaction as a full page (S-5). */

import { Suspense, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/components/mobile";
import { useReturnTo } from "@/lib/forms/use-return-to";
import { TW } from "@/lib/design/tokens";
import { MAX_SPLITS } from "@/lib/transactions/split-math";
import {
  TransactionSplitForm,
  seedSplitEditor,
  type SavedSplitRow,
  type SplitAccount,
  type SplitCategory,
  type SplitEditorSeed,
  type SplitTotal,
} from "../../_components/transaction-split-form";

type Loaded = {
  total: SplitTotal;
  linkId: string | null;
  categories: SplitCategory[];
  accounts: SplitAccount[];
  seed: SplitEditorSeed;
  hasSplits: boolean;
};

type TxRow = {
  id: number;
  amount: number;
  currency: string;
  categoryId?: number | null;
  payee?: string | null;
  linkId?: string | null;
};

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} failed (${res.status})`);
  return (await res.json()) as T;
}

function SplitInner() {
  const params = useParams<{ id: string }>();
  const returnTo = useReturnTo("/transactions");
  const id = Number(params.id);
  const [state, setState] = useState<
    | { status: "loading" }
    | { status: "missing"; message: string }
    | { status: "blocked"; message: string }
    | { status: "ready"; data: Loaded }
  >({ status: "loading" });

  useEffect(() => {
    if (!Number.isInteger(id) || id <= 0) {
      setState({ status: "missing", message: "That transaction link is not valid." });
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const [txRes, categories, accounts, splits] = await Promise.all([
          getJson<{ data?: TxRow[] }>(`/api/transactions?id=${id}`),
          getJson<SplitCategory[]>("/api/categories"),
          getJson<SplitAccount[]>("/api/accounts?includeArchived=1"),
          getJson<SavedSplitRow[]>(`/api/transactions/splits?transactionId=${id}`).catch(() => []),
        ]);
        const tx = txRes.data?.[0];
        if (!tx) {
          if (!cancelled) setState({ status: "missing", message: "This transaction no longer exists." });
          return;
        }
        if (tx.linkId) {
          if (!cancelled) setState({ status: "blocked", message: "Transfers can't be split." });
          return;
        }
        const splitRows = Array.isArray(splits) ? splits : [];
        if (splitRows.length > MAX_SPLITS) {
          if (!cancelled) {
            setState({
              status: "blocked",
              message: `This transaction has ${splitRows.length} splits, more than the ${MAX_SPLITS} this editor supports. Change it on a computer or clear the splits.`,
            });
          }
          return;
        }
        if (!cancelled) {
          setState({
            status: "ready",
            data: {
              total: {
                id: tx.id,
                amount: tx.amount,
                currency: tx.currency,
                categoryId: tx.categoryId ?? null,
                payee: tx.payee ?? null,
              },
              linkId: tx.linkId ?? null,
              categories: Array.isArray(categories) ? categories : [],
              accounts: Array.isArray(accounts) ? accounts : [],
              seed: seedSplitEditor(splitRows, tx.amount, tx.currency),
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
      <div className={`mx-auto w-full ${TW.form}`}>
        <PageHeader title="Split transaction" backHref={returnTo} backLabel="Back" />
        <div data-testid="tx-split-loading" className="mt-3 text-sm text-muted-foreground">Loading…</div>
      </div>
    );
  }
  if (state.status === "missing" || state.status === "blocked") {
    return (
      <div className={`mx-auto w-full ${TW.form} space-y-3`}>
        <PageHeader title="Split transaction" backHref={returnTo} backLabel="Back" />
        <p data-testid={state.status === "blocked" ? "tx-split-blocked" : undefined} className="text-sm text-foreground">
          {state.message}
        </p>
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
      initialSeed={d.seed}
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
