"use client";

/**
 * Loads what a full-page transaction edit needs (PKG1 tx-edit): the row (or the
 * two legs of a transfer), the lookups, and the linked siblings. Rows that
 * belong somewhere else are redirected: portfolio-kind rows to their op page,
 * clean transfer pairs to /transactions/transfer/[linkId]/edit. The same
 * endpoints and four-check rule as the table's former Edit dialog.
 */

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type {
  DialogAccount,
  DialogCategory,
  DialogHolding,
  DialogLinkedSibling,
  DialogTransaction,
  TransactionDialogInitialState,
} from "@/components/transactions/transaction-dialog";
import {
  isCleanTransferPair,
  portfolioEditHref,
  siblingToTransaction,
  transactionEditHref,
  transferEditHref,
} from "@/lib/transactions/edit-flow";

export type EditInitialState = Extract<
  TransactionDialogInitialState,
  { kind: "transaction-edit" } | { kind: "transfer-edit" }
>;

export type EditSource =
  | { status: "loading" }
  | { status: "missing"; message: string }
  | {
      status: "ready";
      initialState: EditInitialState;
      accounts: DialogAccount[];
      categories: DialogCategory[];
      holdings: DialogHolding[];
    };

export type EditTarget =
  | { kind: "transaction"; id: number; returnTo?: string }
  | { kind: "transfer"; linkId: string; returnTo?: string };

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} failed (${res.status})`);
  return (await res.json()) as T;
}

async function loadLookups() {
  const [accounts, categories, holdings] = await Promise.all([
    getJson<DialogAccount[]>("/api/accounts?includeArchived=1"),
    getJson<DialogCategory[]>("/api/categories"),
    getJson<DialogHolding[]>("/api/portfolio"),
  ]);
  return {
    accounts: Array.isArray(accounts) ? accounts : [],
    categories: Array.isArray(categories) ? categories : [],
    holdings: Array.isArray(holdings) ? holdings : [],
  };
}

export function useEditSource(target: EditTarget): EditSource {
  const router = useRouter();
  // The router object is read through a ref so a new object per render cannot re-run the load.
  const routerRef = useRef(router);
  routerRef.current = router;
  const [source, setSource] = useState<EditSource>({ status: "loading" });
  const key = target.kind === "transaction" ? `tx:${target.id}` : `tf:${target.linkId}`;
  const returnTo = target.returnTo;

  useEffect(() => {
    let cancelled = false;
    setSource({ status: "loading" });

    async function run() {
      try {
        if (target.kind === "transaction") {
          const { id } = target;
          const txRes = await getJson<{ data?: Array<DialogTransaction & { kind?: string | null }> }>(
            `/api/transactions?id=${id}`,
          );
          const tx = txRes.data?.[0];
          if (!tx) {
            if (!cancelled) setSource({ status: "missing", message: "This transaction no longer exists." });
            return;
          }
          const portfolioHref = portfolioEditHref(tx.kind, tx.id);
          if (portfolioHref) {
            routerRef.current.replace(portfolioHref);
            return;
          }
          let siblings: DialogLinkedSibling[] = [];
          if (tx.linkId) {
            const d = await getJson<{ data?: DialogLinkedSibling[] }>(
              `/api/transactions/linked?linkId=${encodeURIComponent(tx.linkId)}&excludeId=${tx.id}`,
            ).catch(() => ({ data: [] as DialogLinkedSibling[] }));
            siblings = Array.isArray(d.data) ? d.data : [];
            if (isCleanTransferPair(tx, siblings)) {
              routerRef.current.replace(transferEditHref(tx.linkId, returnTo));
              return;
            }
          }
          const lookups = await loadLookups();
          if (cancelled) return;
          setSource({
            status: "ready",
            ...lookups,
            initialState: { kind: "transaction-edit", tx, linkedSiblings: siblings },
          });
          return;
        }

        // Transfer: both legs. Full rows when they load (created/updated/source for the footer), else the sibling shape.
        const { linkId } = target;
        const legsRes = await getJson<{ data?: DialogLinkedSibling[] }>(
          `/api/transactions/linked?linkId=${encodeURIComponent(linkId)}`,
        );
        const legs = Array.isArray(legsRes.data) ? legsRes.data : [];
        if (legs.length === 0) {
          if (!cancelled) setSource({ status: "missing", message: "This transfer no longer exists." });
          return;
        }
        if (legs.length !== 2 || legs[0].accountId === legs[1].accountId) {
          // Not a clean pair: edit the first leg as an ordinary transaction.
          routerRef.current.replace(transactionEditHref(legs[0].id, returnTo));
          return;
        }
        const fullLegs = await Promise.all(
          legs.map((leg) =>
            getJson<{ data?: DialogTransaction[] }>(`/api/transactions?id=${leg.id}`)
              .then((d) => d.data?.[0] ?? siblingToTransaction(leg))
              .catch(() => siblingToTransaction(leg)),
          ),
        );
        const debit = fullLegs.find((l) => l.amount < 0) ?? fullLegs[0];
        const credit = fullLegs.find((l) => l !== debit) ?? fullLegs[1];
        const lookups = await loadLookups();
        if (cancelled) return;
        setSource({
          status: "ready",
          ...lookups,
          initialState: { kind: "transfer-edit", debit, credit, linkId },
        });
      } catch (err) {
        if (!cancelled) {
          setSource({
            status: "missing",
            message: err instanceof Error ? err.message : "Could not load this transaction.",
          });
        }
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
    // `target` is identified by `key`; the object identity changes every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, returnTo]);

  return source;
}
