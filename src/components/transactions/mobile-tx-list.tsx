"use client";

import React from "react";
import { ArrowDownLeft, ArrowUpRight, ArrowLeftRight, type LucideIcon } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/currency";
import { todayISO, localDateISO } from "@/lib/utils/date";
import { SectionLabel } from "@/components/mobile/section-label";
import type { Transaction } from "@/app/(app)/transactions/_types";
import { cn } from "@/lib/utils";

interface MobileTxListProps {
  transactions: Transaction[];
  isLoading?: boolean;
  onEdit: (t: Transaction) => void;
  showAccountName?: boolean;
  onLoadMore?: () => void;
  hasMore?: boolean;
  isLoadingMore?: boolean;
}

/**
 * Mobile transaction list: grouped by date with sticky labels, clean banking-app styling.
 * Date labels: "Today", "Yesterday", or the formatted date.
 * Icons: transfer (ArrowLeftRight), incoming (ArrowDownLeft), outgoing (ArrowUpRight).
 * Each row: icon tile | payee (fallback category) | amount with color + sign.
 * Account name shown only when not scoped to a single account.
 */
export function MobileTxList({
  transactions,
  isLoading,
  onEdit,
  showAccountName = false,
  onLoadMore,
  hasMore = false,
  isLoadingMore = false,
}: MobileTxListProps) {
  const today = todayISO();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayISO = localDateISO(yesterday);

  // Group transactions by date
  const grouped = groupTransactionsByDate(transactions, today, yesterdayISO);

  if (isLoading) {
    return <div className="px-4 py-8 text-center text-sm text-muted-foreground">Loading transactions...</div>;
  }

  if (transactions.length === 0) {
    return <div className="px-4 py-8 text-center text-sm text-muted-foreground">No transactions found</div>;
  }

  return (
    <div className="divide-y divide-border">
      {Object.entries(grouped).map(([dateLabel, txns]) => (
        <div key={dateLabel}>
          <SectionLabel className="sticky top-[var(--sat,0)] z-10 bg-background/80 backdrop-blur-sm py-2">
            {dateLabel}
          </SectionLabel>
          <div>
            {txns.map((t) => (
              <TransactionRow
                key={t.id}
                transaction={t}
                onEdit={onEdit}
                showAccountName={showAccountName}
              />
            ))}
          </div>
        </div>
      ))}

      {hasMore && (
        <div className="p-4">
          <button
            onClick={onLoadMore}
            disabled={isLoadingMore}
            className="w-full rounded-lg bg-muted/50 py-3 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50"
          >
            {isLoadingMore ? "Loading..." : "Load more"}
          </button>
        </div>
      )}
    </div>
  );
}

function groupTransactionsByDate(
  transactions: Transaction[],
  today: string,
  yesterday: string,
): Record<string, Transaction[]> {
  const groups: Record<string, Transaction[]> = {};

  for (const t of transactions) {
    let label: string;
    if (t.date === today) {
      label = "Today";
    } else if (t.date === yesterday) {
      label = "Yesterday";
    } else {
      label = formatDate(t.date);
    }

    if (!groups[label]) {
      groups[label] = [];
    }
    groups[label].push(t);
  }

  return groups;
}

function getTransactionIcon(transaction: Transaction): { Icon: LucideIcon; bgClass: string } {
  // Transfer: check for linkId (indicates a transfer pair)
  if (transaction.linkId) {
    return {
      Icon: ArrowLeftRight,
      bgClass: "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300",
    };
  }

  // Money in: amount > 0
  if (transaction.amount > 0) {
    return {
      Icon: ArrowDownLeft,
      bgClass: "bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400",
    };
  }

  // Money out: amount < 0
  return {
    Icon: ArrowUpRight,
    bgClass: "bg-neutral-100 dark:bg-neutral-900 text-neutral-600 dark:text-neutral-600",
  };
}

function TransactionRow({
  transaction: t,
  onEdit,
  showAccountName,
}: {
  transaction: Transaction;
  onEdit: (t: Transaction) => void;
  showAccountName: boolean;
}) {
  const { Icon, bgClass } = getTransactionIcon(t);
  const payee = t.payee || t.categoryName || "—";
  const subtitle = showAccountName
    ? `${t.categoryName} · ${t.accountAlias || t.accountName}`
    : t.categoryName;

  // Amount formatting with sign
  const isIncoming = t.amount > 0;
  const formattedAmount = formatCurrency(t.amount, t.currency);
  const displayAmount = isIncoming ? `+${formattedAmount.replace(/-/, "")}` : formattedAmount;
  const amountColor = isIncoming
    ? "text-emerald-600 dark:text-emerald-400"
    : "text-foreground";

  return (
    <button
      onClick={() => onEdit(t)}
      className={cn(
        "flex w-full min-h-[56px] items-center gap-3 px-4 py-3",
        "outline-none transition-colors hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50",
        "border-b border-border last:border-b-0 text-left",
      )}
      aria-label={`Edit ${payee}`}
    >
      {/* Icon tile */}
      <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-full", bgClass)}>
        <Icon className="h-4 w-4" aria-hidden />
      </div>

      {/* Payee and category */}
      <div className="min-w-0 flex-1">
        <div className="block truncate font-medium text-sm">{payee}</div>
        {subtitle && <div className="block truncate text-xs text-muted-foreground">{subtitle}</div>}
      </div>

      {/* Amount */}
      <div className={cn("shrink-0 whitespace-nowrap text-sm font-medium tabular-nums", amountColor)}>
        {displayAmount}
      </div>
    </button>
  );
}
