"use client";

import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { Amount, type AmountTone } from "./amount";
import { ListRow, type ListRowProps, type SecondaryTone, type TileTone } from "./list-row";

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
  icon: LucideIcon;
  tile?: TileTone;
  /** Split view (?sel): this row is the one open in the detail pane. */
  selected?: boolean;
  onPress?: () => void;
  href?: string;
  chevron?: boolean;
  /** Multi-select mode (leading checkbox). */
  select?: ListRowProps["select"];
  className?: string;
}

/** A transaction-like money row (transactions, subscriptions, loan payments): maps data to ListRow props, nothing else. */
export function TxRow({ amount, currency, amountTone = "none", showSign = false, value, meta, metaTone, ...row }: TxRowProps) {
  const shownValue = value ?? (amount !== undefined ? <Amount value={amount} currency={currency} size="md" tone={amountTone} showSign={showSign} /> : undefined);
  return <ListRow {...row} value={shownValue} secondary={meta} secondaryTone={metaTone} />;
}
