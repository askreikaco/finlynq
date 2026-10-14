"use client";

import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Amount, type AmountTone } from "./amount";
import { ListRow, type SecondaryTone } from "./list-row";

/** Pressed and hover feedback for a tappable row (ListRow adds the focus ring). */
export const TX_ROW_PRESS = "hover:bg-muted/50 active:bg-muted/60";

/** Tile tones: the transactions list palette (income / expense / neutral) plus the app's accent tones. */
export const TX_ROW_TILE = {
  pos: "bg-pos/10 text-pos",
  neg: "bg-destructive/10 text-destructive",
  muted: "bg-muted text-muted-foreground dark:text-foreground",
  warn: "bg-warning/10 text-warning",
} as const;
export type TxRowTile = keyof typeof TX_ROW_TILE;

export interface TxRowProps {
  title: React.ReactNode;
  /** One subtitle line (category · account, cadence · next date, rate · payment, ...). */
  subtitle?: React.ReactNode;
  /** The ONE primary amount, right aligned. Either a number (+ currency) or a ready node. */
  amount?: number;
  currency?: string;
  amountTone?: AmountTone;
  showSign?: boolean;
  value?: React.ReactNode;
  /** The small right-aligned meta line under the amount (converted value, date, balance). */
  meta?: React.ReactNode;
  metaTone?: SecondaryTone;
  /** Leading circle tile: lucide icon + tone. */
  icon: LucideIcon;
  tile?: TxRowTile;
  /** Split view (?sel): this row is the one open in the detail pane. */
  selected?: boolean;
  onPress?: () => void;
  href?: string;
  chevron?: boolean;
  className?: string;
}

/**
 * THE row of every money list (transactions, subscriptions, loans and debts): [circle tile | title + subtitle |
 * amount + meta] on ListRow, with the shared hover / pressed / selected styling. Lists put this inside a SectionCard
 * whose rows are separated by the --list-divider shadow; pages never restyle it.
 */
export function TxRow({
  title, subtitle, amount, currency, amountTone = "none", showSign = false, value, meta, metaTone,
  icon: Icon, tile = "muted", selected, onPress, href, chevron, className,
}: TxRowProps) {
  const leading = (
    <span data-slot="tx-row-tile" className={cn("flex size-9 shrink-0 items-center justify-center rounded-full", TX_ROW_TILE[tile])}>
      <Icon className="size-4" aria-hidden />
    </span>
  );
  const shownValue = value ?? (amount !== undefined ? <Amount value={amount} currency={currency} size="md" tone={amountTone} showSign={showSign} /> : undefined);
  const interactive = !!onPress || !!href;
  return (
    <ListRow
      title={title}
      subtitle={subtitle}
      value={shownValue}
      secondary={meta}
      secondaryTone={metaTone}
      leading={leading}
      selected={selected}
      onPress={onPress}
      href={href}
      chevron={chevron}
      className={cn(interactive && TX_ROW_PRESS, className)}
    />
  );
}
