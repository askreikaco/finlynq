"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrency, formatDate } from "@/lib/currency";
import type { Transaction } from "@/app/(app)/transactions/_types";

const PAGE_SIZE = 50;

/**
 * Investment transactions (scope=investment) on the Investment page.
 * Compact table: date, account, holding, type / quantity, amount.
 * `refreshKey` re-fetches when the parent reloads its holdings data.
 */
export function InvestmentTransactions({ refreshKey }: { refreshKey?: unknown }) {
  const [rows, setRows] = useState<Transaction[] | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState(false);

  useEffect(() => {
    const ctrl = new AbortController();
    fetch(`/api/transactions?scope=investment&sort=date&sortDir=desc&limit=${PAGE_SIZE}`, { signal: ctrl.signal })
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json();
      })
      .then((j: { data?: Transaction[]; total?: number }) => {
        setError(false);
        setRows(j.data ?? []);
        setTotal(j.total ?? (j.data?.length ?? 0));
      })
      .catch((e: unknown) => {
        if ((e as { name?: string })?.name === "AbortError") return;
        setError(true);
        setRows([]);
      });
    return () => ctrl.abort();
  }, [refreshKey]);

  return (
    <Card data-slot="investment-transactions">
      <CardHeader>
        <CardTitle>Transactions</CardTitle>
      </CardHeader>
      <CardContent>
        {rows === null ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : error ? (
          <p className="text-sm text-muted-foreground">Couldn&apos;t load investment transactions.</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No investment transactions yet.</p>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Account</TableHead>
                  <TableHead>Holding</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Quantity</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="whitespace-nowrap">{formatDate(t.date)}</TableCell>
                    <TableCell>{t.accountAlias || t.accountName}</TableCell>
                    <TableCell>{t.portfolioHolding ?? "—"}</TableCell>
                    <TableCell>{t.kind ?? t.categoryName ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{t.quantity ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCurrency(t.amount, t.currency)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {total > rows.length && (
              <p className="mt-2 text-xs text-muted-foreground">
                Showing {rows.length} of {total}.
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
