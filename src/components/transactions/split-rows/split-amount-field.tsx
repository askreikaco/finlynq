"use client";

import * as React from "react";

import { cn } from "@/lib/utils";
import { TW } from "@/lib/design/tokens";
import { currencyDecimals } from "@/lib/currency";
import { evaluateAmountExpression } from "@/lib/transactions/amount-expression";
import { minorToText, parseAmountMinor } from "@/lib/transactions/split-math";

export interface SplitAmountFieldProps {
  /** DOM id of the amount input. */
  id: string;
  /** Accessible name, e.g. "Split 1 amount". */
  ariaLabel: string;
  /** Stable test id of the amount input, e.g. "split-amount-1". */
  testId: string;
  /** Parent's displayed currency code, shown read-only in the label column. */
  currency: string;
  /** False hides the currency chip (entry variant: the parent chip is the only one). Defaults to true. */
  showCurrency?: boolean;
  /** Extra classes on the row container (e.g. padding when the caller already pads the card). */
  className?: string;
  /** Typed text (editable) or computed text (remainder). */
  value: string;
  /** Remainder row: no typing, no pad, "auto" badge. */
  readOnly?: boolean;
  /** Shows the error colour (bad amount, or remainder zero/negative). */
  invalid?: boolean;
  /** This field is the active numpad target. */
  active?: boolean;
  onChange?: (value: string) => void;
  /** Focus opens the shared numpad for this row. Not called for the read-only remainder. */
  onOpenPad?: () => void;
  /** Focus left the field (after any pending expression is settled). Not called for the remainder. */
  onBlur?: () => void;
}

/**
 * One split amount: read-only currency code in the same w-24 label column as AmountRow,
 * then the amount. Editable rows use inputMode="none" so touch opens the shared numpad
 * instead of the OS keyboard; hardware keyboards still type. On blur, a pending expression
 * such as "45+12" (desktop, no numpad) is evaluated and rounded to the currency's decimals.
 */
export function SplitAmountField({
  id,
  ariaLabel,
  testId,
  currency,
  showCurrency = true,
  className,
  value,
  readOnly = false,
  invalid = false,
  active = false,
  onChange,
  onOpenPad,
  onBlur,
}: SplitAmountFieldProps) {
  const decimals = currencyDecimals(currency);
  const placeholder = decimals > 0 ? "0.00" : "0";

  const settleExpression = () => {
    if (readOnly || !onChange) return;
    const evaluated = evaluateAmountExpression(value);
    if (evaluated === null) return;
    const minor = parseAmountMinor(evaluated, currency);
    if (minor === null) return;
    const settled = minorToText(minor, currency);
    if (settled !== value) onChange(settled);
  };

  return (
    <div
      className={cn(
        "flex items-center gap-3 px-4",
        TW.rowTall,
        active && "rounded-lg ring-1 ring-inset ring-ring",
        className,
      )}
    >
      {showCurrency && (
        <span
          data-slot="split-currency"
          className={cn(
            "flex shrink-0 items-center justify-center rounded-lg border border-input px-2.5 py-2 text-sm font-medium whitespace-nowrap text-foreground",
            TW.rowLabelNarrow,
          )}
        >
          {currency}
        </span>
      )}
      <input
        id={id}
        type="text"
        data-testid={testId}
        aria-label={ariaLabel}
        aria-invalid={invalid || undefined}
        aria-readonly={readOnly || undefined}
        readOnly={readOnly}
        tabIndex={readOnly ? -1 : undefined}
        inputMode="none"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        onFocus={readOnly ? undefined : onOpenPad}
        onBlur={() => {
          settleExpression();
          onBlur?.();
        }}
        className={cn(
          "min-w-0 flex-1 bg-transparent text-lg font-semibold tabular-nums text-foreground outline-none",
          "placeholder:text-muted-foreground",
          invalid && "text-neg",
        )}
      />
      {readOnly && (
        <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
          auto
        </span>
      )}
    </div>
  );
}
