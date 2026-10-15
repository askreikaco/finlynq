"use client";

import { ArrowLeftRight } from "lucide-react";
import { useEffect, useState } from "react";
import { formatCurrency, formatDate } from "@/lib/currency";
import { Amount, DetailSheet, ListRow, SectionCard } from "@/components/mobile";
import type { Transaction } from "@/app/(app)/transactions/_types";

const PAGE_SIZE = 50;

/**
 * Investment transactions (scope=investment) on the Investment page, as native rows (no table at any width).
 * Each row: holding | account · type, and the amount; a tap opens the row's detail sheet.
 * `refreshKey` re-fetches when the parent reloads its holdings data.
 */
export function InvestmentTransactions({ refreshKey }: { refreshKey?: unknown }) {
  const [rows, setRows] = useState<Transaction[] | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState(false);
  const [open, setOpen] = useState<Transaction | null>(null);

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
    <section data-slot="investment-transactions" className="space-y-2">
      <SectionCard label="Transactions" icon={ArrowLeftRight} tone="cyan" padded={false}>
        {rows === null ? (
          <p className="px-4 pb-4 text-sm text-muted-foreground">Loading…</p>
        ) : error ? (
          <p className="px-4 pb-4 text-sm text-muted-foreground">Couldn&apos;t load investment transactions.</p>
        ) : rows.length === 0 ? (
          <p className="px-4 pb-4 text-sm text-muted-foreground">No investment transactions yet.</p>
        ) : (
          <div className="[&>*:not(:last-child)]:shadow-[var(--list-divider)]">
            {rows.map((t) => (
              <ListRow
                key={t.id}
                title={t.portfolioHolding ?? t.kind ?? t.categoryName ?? "—"}
                subtitle={`${formatDate(t.date)} · ${t.accountAlias || t.accountName} · ${t.kind ?? t.categoryName ?? "—"}`}
                value={<Amount value={t.amount} currency={t.currency} size="md" tone="none" />}
                onPress={() => setOpen(t)}
              />
            ))}
          </div>
        )}
        {rows !== null && !error && total > rows.length && (
          <p className="px-4 pb-4 text-xs text-muted-foreground">
            Showing {rows.length} of {total}.
          </p>
        )}
      </SectionCard>
      {open && (
        <DetailSheet
          open
          onOpenChange={(o) => { if (!o) setOpen(null); }}
          title={open.portfolioHolding ?? open.kind ?? open.categoryName ?? "Transaction"}
          description={formatDate(open.date)}
          items={[
            { label: "Account", value: open.accountAlias || open.accountName },
            { label: "Type", value: open.kind ?? open.categoryName ?? "—" },
            { label: "Quantity", value: open.quantity != null ? String(open.quantity) : "—" },
            { label: "Amount", value: formatCurrency(open.amount, open.currency) },
            { label: "Note", value: open.note || "—" },
          ]}
        />
      )}
    </section>
  );
}
