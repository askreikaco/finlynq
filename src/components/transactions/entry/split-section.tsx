"use client";

import React from "react";
import { Split } from "lucide-react";

import { SplitRows, rowsForCount, type SplitRowsProps } from "@/components/transactions/split-rows";
import { SplitCountControl, SPLIT_COUNT_HINT_TEXT } from "@/components/transactions/split-rows/split-count-row";
import { parseCount } from "@/lib/transactions/split-math";
import { ToggleCard } from "./toggle-card";

export type SplitSectionProps = Omit<SplitRowsProps, "idPrefix" | "showCount" | "variant" | "hideCount">;

const ID_PREFIX = "txnew-split";

/**
 * New-entry split editor: an accordion card "Split" whose header holds the count input (steppers allowed).
 * A count of 2 or more expands the card and shows the shared SplitRows (variant "entry", "txnew-split" ids);
 * 0 or empty collapses it. The parent page owns count, rows, the numpad target and the CategorySelector.
 * Not rendered for Transfer (the page hides it).
 */
export function SplitSection(props: SplitSectionProps) {
  const { count, onCountChange, rows, onRowsChange, onClosePad } = props;
  const parsed = parseCount(count);
  const open = parsed.n >= 2;

  const handleCountChange = (next: string) => {
    onCountChange(next);
    const nextN = parseCount(next).n;
    if (nextN < 2) return;
    onRowsChange(rowsForCount(rows, parsed.n, nextN, ID_PREFIX));
  };

  return (
    <ToggleCard
      id="txnew-split"
      testId="txnew-split"
      icon={Split}
      title="Split"
      description={parsed.hint && count !== "" ? SPLIT_COUNT_HINT_TEXT[parsed.hint] : undefined}
      open={open}
      control={<SplitCountControl id={`${ID_PREFIX}-count`} value={count} onChange={handleCountChange} onFocus={onClosePad} />}
    >
      <SplitRows {...props} idPrefix={ID_PREFIX} variant="entry" hideCount />
    </ToggleCard>
  );
}
