"use client";

/**
 * Row detail sheet for the transactions list. A row tap opens this sheet: every field the row leaves out,
 * plus the row's actions (Edit, Duplicate, Split, Delete). It replaces the old per-row icon buttons.
 */

import { Button } from "@/components/ui/button";
import { DetailSheet, type DetailItem } from "@/components/mobile";
import { formatCurrency, formatDate } from "@/lib/currency";
import { formatAccountLabel } from "@/lib/account-label";
import { labelForSource } from "@/lib/tx-source";
import { transferEnds, type TransferPeer } from "@/lib/transactions/transfer-ends";
import { canDuplicate } from "@/lib/transactions/prefill";
import { SplitBadge } from "./split-badge";
import type { Transaction } from "../_types";

/** Label/value rows for one transaction. Money is shown as entered, with the settlement amount when it differs. */
export function transactionDetailItems(t: Transaction, peer: TransferPeer | null): DetailItem[] {
  const enteredAmt = t.enteredAmount ?? t.amount;
  const enteredCcy = t.enteredCurrency ?? t.currency;
  const ends = transferEnds(t, peer);
  const items: DetailItem[] = [
    { label: "Date", value: formatDate(t.date) },
    {
      label: "Amount",
      value: enteredCcy !== t.currency ? (
        <>
          {formatCurrency(enteredAmt, enteredCcy)}
          <span className="block text-xs font-normal text-muted-foreground">→ {formatCurrency(t.amount, t.currency)}</span>
        </>
      ) : (
        formatCurrency(enteredAmt, enteredCcy)
      ),
    },
    { label: "Category", value: t.categoryName || "—" },
  ];
  if (ends) {
    items.push({ label: "From", value: ends.from }, { label: "To", value: ends.to });
  } else {
    items.push({ label: "Account", value: formatAccountLabel({ name: t.accountName, alias: t.accountAlias, type: t.accountType }) });
  }
  items.push({ label: "Payee", value: t.payee || "—" });
  if (t.portfolioHolding) {
    items.push({ label: "Investment", value: t.portfolioHolding });
    if (t.quantity != null && t.quantity !== 0) items.push({ label: "Quantity", value: String(t.quantity) });
  }
  items.push({ label: "Note", value: t.note || "—" });
  items.push({
    label: "Tags",
    value: t.tags ? t.tags.split(",").map((s) => s.trim()).filter(Boolean).join(", ") || "—" : "—",
  });
  items.push({ label: "Source", value: t.source ? labelForSource(t.source) : "—" });
  if (t.kind) items.push({ label: "Kind", value: t.kind });
  if (t.id > 0 && !t.pendingSync) items.push({ label: "Splits", value: <SplitBadge transactionId={t.id} /> });
  return items;
}

export function TransactionSheet({
  tx,
  peer,
  onClose,
  onEdit,
  onDuplicate,
  onSplit,
  onDelete,
}: {
  tx: Transaction;
  peer: TransferPeer | null;
  onClose: () => void;
  onEdit: (t: Transaction) => void;
  onDuplicate: (t: Transaction) => void;
  onSplit: (t: Transaction) => void;
  onDelete: (t: Transaction) => void;
}) {
  return (
    <DetailSheet
      open
      onOpenChange={(o) => { if (!o) onClose(); }}
      title={tx.payee || tx.categoryName || "Transaction"}
      description={`${formatDate(tx.date)} · ${tx.categoryName || "Uncategorized"}`}
      items={transactionDetailItems(tx, peer)}
    >
      <Button variant="outline" className="h-11" onClick={() => { onClose(); onEdit(tx); }}>Edit</Button>
      {!tx.pendingSync && canDuplicate(tx, tx.currency) && (
        <Button variant="outline" className="h-11" onClick={() => { onClose(); onDuplicate(tx); }}>Duplicate</Button>
      )}
      {!tx.pendingSync && (
        <Button variant="outline" className="h-11" onClick={() => { onClose(); onSplit(tx); }}>Split</Button>
      )}
      <Button variant="outline" className="h-11 text-destructive" onClick={() => { onClose(); onDelete(tx); }}>Delete</Button>
    </DetailSheet>
  );
}
