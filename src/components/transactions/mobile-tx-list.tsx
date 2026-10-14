"use client";

import React from "react";
import { ArrowDownRight, ArrowUpRight, ArrowLeftRight, type LucideIcon } from "lucide-react";
import { transferEnds, type TransferPeer } from "@/lib/transactions/transfer-ends";
import { formatDate } from "@/lib/currency";
import { todayISO, localDateISO } from "@/lib/utils/date";
import { Amount, ListRow, SectionCard } from "@/components/mobile";
import type { Transaction } from "@/app/(app)/transactions/_types";
import { cn } from "@/lib/utils";
import { PendingSyncBadge } from "./pending-sync-badge";

/** Pressed and hover feedback for a tappable transaction row (ListRow adds the focus ring). */
const ROW_PRESS = "hover:bg-muted/50 active:bg-muted/60";

/** Bulk selection for the list: rows show a checkbox and a tap toggles the row. Pending rows are never selectable. */
export interface TxListSelection {
  selected: ReadonlySet<number>;
  onToggle: (id: number) => void;
}

interface MobileTxListProps {
  transactions: Transaction[];
  isLoading?: boolean;
  /** Row tap (opens the row's detail sheet, or the edit page for a queued row). */
  onOpen: (t: Transaction) => void;
  showAccountName?: boolean;
  onLoadMore?: () => void;
  hasMore?: boolean;
  isLoadingMore?: boolean;
  /** Other leg of each transfer row by transaction id: enables the "From … · To …" line. */
  transferPeers?: ReadonlyMap<number, TransferPeer>;
  /** Shown instead of the list when there are no rows and nothing is loading. */
  emptyState?: React.ReactNode;
  /** Set while bulk-select mode is on. */
  selection?: TxListSelection;
  /** Split view: the row open in the detail pane gets the selected style. */
  selectedId?: number | null;
  /** Force one column at every width (the split-view list pane is already narrow). */
  singleColumn?: boolean;
}

/**
 * The one transactions list at every width: date-grouped SectionCards of native ListRows.
 * Each row: type tile | payee (fallback category) + "Waiting to sync" badge | amount with sign.
 * Subtitle: category · account (when not scoped to one account), or "From … · To …" for transfers.
 * Icons match the Accounts page: income = ArrowUpRight, expense = ArrowDownRight, transfer = ArrowLeftRight.
 */
export function MobileTxList({
  transactions,
  isLoading,
  onOpen,
  showAccountName = false,
  onLoadMore,
  hasMore = false,
  isLoadingMore = false,
  transferPeers,
  emptyState,
  selection,
  singleColumn = false,
  selectedId = null,
}: MobileTxListProps) {
  const today = todayISO();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayISO = localDateISO(yesterday);

  // Group transactions by date
  const grouped = groupTransactionsByDate(transactions, today, yesterdayISO);

  if (isLoading && transactions.length === 0) {
    return <ListSkeleton />;
  }

  if (transactions.length === 0) {
    return emptyState ?? <div className="px-4 py-8 text-center text-sm text-muted-foreground">No transactions found</div>;
  }

  return (
    <div className="space-y-6">
      {/* Date cards: 1 column up to regular, 2 at wide (each card unbroken, items-start). */}
      <div
        data-slot="tx-date-groups"
        className={cn("grid grid-cols-1 items-start gap-6", !singleColumn && "wide:grid-cols-2")}
      >
      {Object.entries(grouped).map(([dateLabel, txns]) => (
        <SectionCard
          key={dateLabel}
          label={dateLabel}
          /* The date label sticks under the page header while its group scrolls. */
          labelClassName="sticky top-[calc(var(--sat,0px)+var(--header-h))] z-10 rounded-t-xl bg-card/90 backdrop-blur-sm"
          padded={false} className="[&>*:not(:last-child)]:shadow-[var(--list-divider)] px-3"
        >
          {txns.map((t) => (
            <TransactionRow
              key={t.id}
              transaction={t}
              onOpen={onOpen}
              showAccountName={showAccountName}
              peer={transferPeers?.get(t.id) ?? null}
              selection={selection}
              selected={selectedId === t.id}
            />
          ))}
        </SectionCard>
      ))}
      </div>

      {hasMore && (
        <div>
          <button
            onClick={onLoadMore}
            disabled={isLoadingMore}
            className="w-full min-h-11 rounded-lg bg-muted/50 py-3 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50"
          >
            {isLoadingMore ? "Loading..." : "Load more"}
          </button>
        </div>
      )}
    </div>
  );
}

/** Shimmer rows shown only on the first load (background revalidation keeps rows mounted). */
function ListSkeleton() {
  return (
    <div className="space-y-3 px-1 py-2" aria-busy="true" data-slot="tx-list-skeleton">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <div className="size-9 shrink-0 rounded-full animate-shimmer" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-36 rounded animate-shimmer" />
            <div className="h-3 w-24 rounded animate-shimmer" />
          </div>
          <div className="h-4 w-16 rounded animate-shimmer" />
        </div>
      ))}
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
      bgClass: "bg-muted text-muted-foreground dark:text-foreground",
    };
  }

  // Money in: amount > 0
  if (transaction.amount > 0) {
    return {
      Icon: ArrowUpRight,
      bgClass: "bg-pos/10 text-pos",
    };
  }

  // Money out: amount < 0
  return {
    Icon: ArrowDownRight,
    bgClass: "bg-destructive/10 text-destructive",
  };
}

function TransactionRow({
  transaction: t,
  onOpen,
  showAccountName,
  peer,
  selection,
  selected = false,
}: {
  selected?: boolean;
  transaction: Transaction;
  onOpen: (t: Transaction) => void;
  showAccountName: boolean;
  peer: TransferPeer | null;
  selection?: TxListSelection;
}) {
  const { Icon, bgClass } = getTransactionIcon(t);
  const payee = t.payee || t.categoryName || "—";
  const ends = transferEnds(t, peer);
  const subtitle = ends
    ? `From ${ends.from} · To ${ends.to}`
    : showAccountName
      ? [t.categoryName, t.accountAlias || t.accountName].filter(Boolean).join(" · ")
      : t.categoryName;

  const tile = (
    <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-full", bgClass)}>
      <Icon className="size-4" aria-hidden />
    </span>
  );
  const title = (
    <span className="flex min-w-0 items-center gap-2">
      <span className="block min-w-0 truncate">{payee}</span>
      <PendingSyncBadge mark={t.pendingSync} />
    </span>
  );
  const value = (
    <Amount value={t.amount} currency={t.currency} size="md" tone={t.amount > 0 ? "pos" : "none"} showSign />
  );

  if (selection && t.id > 0 && !t.pendingSync) {
    const checked = selection.selected.has(t.id);
    return (
      <div
        className={cn("flex items-center gap-2 rounded-lg", checked && "bg-primary/5")}
        onClick={(e) => {
          if (!(e.target instanceof HTMLInputElement)) selection.onToggle(t.id);
        }}
      >
        <input
          type="checkbox"
          checked={checked}
          onChange={() => selection.onToggle(t.id)}
          aria-label={`Select ${payee}`}
          className="ml-1 h-4 w-4 shrink-0 cursor-pointer rounded border-input"
        />
        <div className="min-w-0 flex-1">
          <ListRow title={title} subtitle={subtitle} value={value} leading={tile} chevron={false} />
        </div>
      </div>
    );
  }

  return <ListRow title={title} subtitle={subtitle} value={value} leading={tile} selected={selected} onPress={() => onOpen(t)} className={ROW_PRESS} />;
}
