"use client";

/**
 * TransactionDetailPane — the right-hand pane of the wide-screen split view: the selected row's
 * fields (read-only) plus Edit / Close. Editing still opens the full edit page (one edit surface).
 */

import { Pencil, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Amount } from "@/components/mobile/amount";
import { SectionLabel } from "@/components/mobile/section-label";
import type { Transaction } from "../_types";

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div className="flex items-start justify-between gap-4 py-2">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-right text-sm font-medium text-foreground break-words">{value}</dd>
    </div>
  );
}

export function TransactionDetailPane({
  transaction,
  onEdit,
  onClose,
}: {
  transaction: Transaction | null;
  onEdit: (t: Transaction) => void;
  onClose: () => void;
}) {
  if (!transaction) {
    return (
      <aside data-testid="tx-detail-pane" className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
        Select a transaction to see its details here.
      </aside>
    );
  }
  const t = transaction;
  const entered =
    t.enteredAmount != null && t.enteredCurrency && t.enteredCurrency !== t.currency
      ? `${t.enteredAmount} ${t.enteredCurrency}`
      : null;
  return (
    <aside data-testid="tx-detail-pane" className="rounded-xl border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <SectionLabel as="p">{t.date}</SectionLabel>
          <h2 className="mt-1 break-words text-lg font-bold">{t.payee || t.categoryName || "Transaction"}</h2>
          <Amount value={t.amount} currency={t.currency} size="lg" showSign />
        </div>
        <Button variant="ghost" size="icon" aria-label="Close details" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>
      <dl className="mt-3 [&>*:not(:last-child)]:shadow-[var(--list-divider)]">
        <Field label="Account" value={t.accountAlias || t.accountName} />
        <Field label="Category" value={t.categoryName} />
        <Field label="Entered as" value={entered} />
        <Field label="Note" value={t.note} />
        <Field label="Tags" value={t.tags} />
        <Field label="Holding" value={t.portfolioHolding} />
        <Field label="Quantity" value={t.quantity} />
        <Field label="Updated" value={t.updatedAt?.slice(0, 16).replace("T", " ")} />
      </dl>
      <Button className="mt-4 w-full" onClick={() => onEdit(t)}>
        <Pencil className="mr-2 h-4 w-4" /> Edit
      </Button>
    </aside>
  );
}
