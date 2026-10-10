"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

export type SegmentedTxType = "Income" | "Expense" | "Transfer";

/** Owner order: Income | Expense | Transfer. */
export const TX_TYPE_ORDER: readonly SegmentedTxType[] = ["Income", "Expense", "Transfer"];

const SELECTED: Record<SegmentedTxType, string> = {
  Expense: "bg-neg/10 text-neg",
  Income: "bg-pos/10 text-pos",
  Transfer: "bg-muted text-foreground",
};

export function TypeSegmented({
  value,
  onChange,
  disabledOptions,
  className,
}: {
  value: SegmentedTxType;
  onChange: (next: SegmentedTxType) => void;
  /** Options that cannot be picked (Edit: a transaction cannot become a transfer, nor the reverse). */
  disabledOptions?: readonly SegmentedTxType[];
  className?: string;
}) {
  const refs = React.useRef<Array<HTMLButtonElement | null>>([]);

  const isDisabled = (opt: SegmentedTxType) => !!disabledOptions?.includes(opt);

  const move = (from: number, delta: number) => {
    const n = TX_TYPE_ORDER.length;
    let next = (from + delta + n) % n;
    // Skip options that cannot be picked; stop after one lap so an all-disabled group cannot loop.
    for (let step = 0; step < n && isDisabled(TX_TYPE_ORDER[next]); step++) next = (next + delta + n) % n;
    if (isDisabled(TX_TYPE_ORDER[next])) return;
    onChange(TX_TYPE_ORDER[next]);
    refs.current[next]?.focus();
  };

  return (
    <div
      role="radiogroup"
      aria-label="Transaction type"
      className={cn(
        "grid h-11 grid-cols-3 overflow-hidden rounded-xl border border-border bg-card",
        className,
      )}
    >
      {TX_TYPE_ORDER.map((opt, i) => {
        const selected = opt === value;
        return (
          <button
            key={opt}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={isDisabled(opt)}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(opt)}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight" || e.key === "ArrowDown") {
                e.preventDefault();
                move(i, 1);
              } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
                e.preventDefault();
                move(i, -1);
              }
            }}
            className={cn(
              "h-11 text-sm font-semibold transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
              selected ? SELECTED[opt] : "text-muted-foreground",
              isDisabled(opt) && "opacity-40",
            )}
          >
            {opt}
          </button>
        );
      })}
    </div>
  );
}
