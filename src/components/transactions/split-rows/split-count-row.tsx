"use client";

import * as React from "react";
import { Minus, Plus, Split } from "lucide-react";

import { cn } from "@/lib/utils";
import { TW } from "@/lib/design/tokens";
import { FormRow } from "@/components/forms";
import { MAX_SPLITS, type CountHint } from "@/lib/transactions/split-math";

export interface SplitCountRowProps {
  /** DOM id of the count input (also the label target). */
  id: string;
  /** Raw count text, digits only (max 2). "" = no split. */
  value: string;
  /** Hint under the row, from parseCount(). */
  hint: CountHint | null;
  onChange: (next: string) => void;
  /** Focus closes the amount numpad (the count uses the OS numeric keyboard). */
  onFocus?: () => void;
  /** "entry": a grouped card with -/+ steppers (New Expense). "page": the plain FormRow field. */
  variant?: "entry" | "page";
}

const HINT_TEXT: Record<CountHint, string> = {
  "enter-two-or-more": "Enter 2 or more to split",
  "up-to-20": "Up to 20 splits",
};

/**
 * Stepper rule for the entry variant. "+" from empty/0/1 goes to 2, otherwise +1 up to 20.
 * "-" from 2 goes to empty ("none"), otherwise -1. Empty and 0 cannot go lower.
 */
export function stepCount(value: string, delta: 1 | -1): string {
  const current = /^\d+$/.test(value) ? Number(value) : 0;
  if (delta > 0) {
    if (current < 2) return "2";
    return String(Math.min(MAX_SPLITS, current + 1));
  }
  if (current <= 0) return "";
  if (current === 2) return "";
  return String(current - 1);
}

/**
 * The "Splits" count field. Page variant: FormRow-style row with the Split icon and a right-aligned
 * integer input. Entry variant: the same row inside a group card, with a -/+ stepper around the
 * input. Numeric keyboard, no Numpad. Non-digits are stripped and the text is capped at 2
 * characters; the cap of 20 applies in parseCount, not here.
 */
export function SplitCountRow({ id, value, hint, onChange, onFocus, variant = "page" }: SplitCountRowProps) {
  const hintText = hint ? HINT_TEXT[hint] : undefined;
  const entry = variant === "entry";
  const current = /^\d+$/.test(value) ? Number(value) : 0;
  const stepButton =
    "flex size-11 shrink-0 items-center justify-center rounded-full border border-border text-foreground transition-colors active:bg-muted disabled:opacity-50";
  const input = (
    <input
      id={id}
      type="text"
      data-testid="split-count"
      aria-label="Number of splits"
      inputMode="numeric"
      pattern="[0-9]*"
      autoComplete="off"
      placeholder="0"
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 2))}
      onFocus={() => onFocus?.()}
      className={cn(
        "bg-transparent text-base tabular-nums text-foreground outline-none placeholder:text-muted-foreground",
        entry ? "w-12 text-center" : "w-full text-right",
      )}
    />
  );

  const row = (
    <FormRow
      variant="custom"
      icon={Split}
      label="Splits"
      htmlFor={id}
      labelWidth="narrow"
      height="tall"
      hint={hintText}
    >
      {entry ? (
        <div className="flex items-center justify-end gap-1">
          <button
            type="button"
            aria-label="Decrease splits"
            data-testid="split-count-decrease"
            disabled={current <= 0}
            onClick={() => {
              onFocus?.();
              onChange(stepCount(value, -1));
            }}
            className={stepButton}
          >
            <Minus aria-hidden="true" className="size-[18px]" />
          </button>
          {input}
          <button
            type="button"
            aria-label="Increase splits"
            data-testid="split-count-increase"
            disabled={current >= MAX_SPLITS}
            onClick={() => {
              onFocus?.();
              onChange(stepCount(value, 1));
            }}
            className={stepButton}
          >
            <Plus aria-hidden="true" className="size-[18px]" />
          </button>
        </div>
      ) : (
        input
      )}
    </FormRow>
  );

  // The entry group card matches the main form card (rounded-group, bg-card, border).
  if (entry) {
    return <div className={cn("rounded-group border border-border bg-card", TW.group)}>{row}</div>;
  }
  return row;
}
