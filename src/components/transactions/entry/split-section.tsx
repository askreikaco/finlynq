"use client";

import React from "react";
import { Split } from "lucide-react";

import { Field, FieldGroup } from "@/components/ui/field";
import {
  SplitRows,
  SPLIT_COUNT_HINT_TEXT,
  rowsForCount,
  stepCount,
  type SplitRowsProps,
} from "@/components/transactions/split-rows";
import { MAX_SPLITS, parseCount } from "@/lib/transactions/split-math";

export type SplitSectionProps = Omit<SplitRowsProps, "idPrefix" | "showCount" | "variant" | "hideCount">;

const ID_PREFIX = "txnew-split";

/**
 * New-entry split editor: a group card "Split" whose header row holds the count stepper. A count of 2 or more
 * expands the card and shows the shared SplitRows (variant "entry", "txnew-split" ids); 0 or empty collapses it.
 * The parent page owns count, rows, the numpad target and the CategorySelector. Not rendered for Transfer.
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
    <FieldGroup
      data-testid="txnew-split"
      data-state={open ? "open" : "closed"}
      className="shrink-0"
      panel={
        open ? (
          <div id={`${ID_PREFIX}-panel`} className="py-3 animate-in fade-in duration-200">
            <SplitRows {...props} idPrefix={ID_PREFIX} variant="entry" hideCount />
          </div>
        ) : undefined
      }
    >
      <Field
        control="stepper"
        icon={Split}
        label="Split"
        id={`${ID_PREFIX}-count`}
        data-testid="split-count"
        aria-label="Number of splits"
        stepLabel="splits"
        placeholder="0"
        maxLength={2}
        min={0}
        max={MAX_SPLITS}
        value={count}
        hint={parsed.hint && count !== "" ? SPLIT_COUNT_HINT_TEXT[parsed.hint] : undefined}
        onStep={(delta, current) => stepCount(current, delta)}
        onInteract={onClosePad}
        onValueChange={handleCountChange}
      />
    </FieldGroup>
  );
}
