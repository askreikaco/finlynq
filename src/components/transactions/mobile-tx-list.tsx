"use client";

import React from "react";
import { ArrowDownRight, ArrowUpRight, ArrowLeftRight, type LucideIcon } from "lucide-react";
import { transferEnds, type TransferPeer } from "@/lib/transactions/transfer-ends";
import { formatDate } from "@/lib/currency";
import { todayISO, localDateISO } from "@/lib/utils/date";
import { SectionCard, TxRow, type TileTone } from "@/components/mobile";
import type { Transaction } from "@/app/(app)/transactions/_types";
import { PendingSyncBadge } from "./pending-sync-badge";

/** Bulk selection for the list: rows show a checkbox and a tap toggles the row. Pending rows are never selectable. */
export interface TxListSelection {
  selected: ReadonlySet<number>;
  onToggle: (id: number) => void;
}

interface MobileTxListProps {
  transactions: Transaction[];
  isLoading?: boolean;
  /** Row tap: selects the row in the split-view pane, or opens a queued / investment row's own editor. */
  onOpen: (t: Transaction) => void;
  /** Link target of a row (the edit page). null / omitted = the row uses `onOpen` instead. */
  hrefFor?: (t: Transaction) => string | null;
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
  /** Kept for callers; the list is one column at every width, so this is a no-op. */
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
  hrefFor,
  showAccountName = false,
  onLoadMore,
  hasMore = false,
  isLoadingMore = false,
  transferPeers,
  emptyState,
  selection,
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
      {/* Date cards: ONE column at every width (owner request). */}
      <div
        data-slot="tx-date-groups"
        className="grid grid-cols-1 items-start gap-6"
      >
      {Object.entries(grouped).map(([dateLabel, txns]) => (
        <SectionCard
          key={dateLabel}
          label={dateLabel}
          labelPlacement="outside"
          /* The date label sits ABOVE the card group and sticks under the page header while its group scrolls. */
          labelClassName="sticky top-[calc(var(--sat,0px)+var(--header-h))] z-10 -mx-1 bg-background/90 px-5 py-1.5 backdrop-blur-sm"
          list
        >
          {txns.map((t) => (
            <TransactionRow
              key={t.id}
              transaction={t}
              onOpen={onOpen}
              href={hrefFor?.(t) ?? undefined}
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

function getTransactionIcon(transaction: Transaction): { Icon: LucideIcon; tile: TileTone } {
  // Transfer: check for linkId (indicates a transfer pair)
  if (transaction.linkId) {
    return {
      Icon: ArrowLeftRight,
      tile: "muted",
    };
  }

  // Money in: amount > 0
  if (transaction.amount > 0) {
    return {
      Icon: ArrowUpRight,
      tile: "pos",
    };
  }

  // Money out: amount < 0
  return {
    Icon: ArrowDownRight,
    tile: "neg",
  };
}

function TransactionRow({
  transaction: t,
  onOpen,
  href,
  showAccountName,
  peer,
  selection,
  selected = false,
}: {
  selected?: boolean;
  transaction: Transaction;
  onOpen: (t: Transaction) => void;
  href?: string;
  showAccountName: boolean;
  peer: TransferPeer | null;
  selection?: TxListSelection;
}) {
  const { Icon, tile } = getTransactionIcon(t);
  const payee = t.payee || t.categoryName || "—";
  const ends = transferEnds(t, peer);
  const subtitle = ends
    ? `From ${ends.from} · To ${ends.to}`
    : showAccountName
      ? [t.categoryName, t.accountAlias || t.accountName].filter(Boolean).join(" · ")
      : t.categoryName;

  const title = (
    <span className="flex min-w-0 items-center gap-2">
      <span className="block min-w-0 truncate">{payee}</span>
      <PendingSyncBadge mark={t.pendingSync} />
    </span>
  );

  const select = selection && t.id > 0 && !t.pendingSync
    ? { checked: selection.selected.has(t.id), onToggle: () => selection.onToggle(t.id), label: `Select ${payee}` }
    : undefined;
  // A queued edit or delete waiting to sync has nothing to open: a calm, non-interactive row (the badge says why).
  const inert = t.pendingSync?.status === "pending" && t.pendingSync.kind !== "create";
  const press = select || inert || href ? undefined : () => onOpen(t);
  return <TxRow title={title} subtitle={subtitle} amount={t.amount} currency={t.currency} amountTone={t.amount > 0 ? "pos" : "none"} showSign icon={Icon} tile={tile} chevron={false} select={select} selected={select ? undefined : selected} href={select ? undefined : href} onPress={press} />;
}
