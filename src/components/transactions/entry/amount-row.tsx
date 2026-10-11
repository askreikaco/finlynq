"use client";

import * as React from "react";
import { Banknote, ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";

interface AmountRowProps {
  value: string;
  onChange: (value: string) => void;
  /** Called on focus; the page opens the numpad here. Typing from a hardware keyboard still works. */
  onOpenPad: () => void;
  currency: string;
  /** Opens the currency sheet (CurrencySelector). */
  onOpenCurrency: () => void;
  /** Hide the currency chip. */
  showCurrency?: boolean;
  /** Show the chip but not allow changing it (Transfer: the amount is in the From account currency). */
  currencyDisabled?: boolean;
  /** Optional FX preview line under the amount. */
  fxLine?: React.ReactNode;
  invalid?: boolean;
  testId?: string;
  className?: string;
}

/**
 * Amount row, laid out like every other FormRow: a fixed Banknote icon at the left (same x as the other rows'
 * icons), the amount input starting at the shared value column, and the currency trigger (code + chevron) at
 * the right end of the row.
 */
export function AmountRow({
  value,
  onChange,
  onOpenPad,
  currency,
  onOpenCurrency,
  showCurrency = true,
  currencyDisabled = false,
  fxLine,
  invalid,
  testId,
  className,
}: AmountRowProps) {
  return (
    <div data-testid={testId} className={cn("flex min-h-14 flex-col gap-1 px-4 py-2", className)}>
      <div className="flex min-w-0 items-center gap-3">
        <Banknote aria-hidden="true" data-slot="form-row-icon" className="size-[18px] shrink-0 text-muted-foreground" />
        <input
          type="text"
          aria-label="Amount"
          aria-invalid={invalid || undefined}
          inputMode="none"
          placeholder="0"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={onOpenPad}
          className={cn(
            "min-w-0 flex-1 bg-transparent text-2xl font-semibold tabular-nums text-foreground outline-none",
            "placeholder:text-muted-foreground",
            invalid && "text-neg",
          )}
        />
        {invalid && !value && <span className="shrink-0 text-base text-neg">Required</span>}
        {showCurrency && (
          <button
            type="button"
            aria-label="Currency"
            aria-haspopup="dialog"
            data-slot="amount-currency-chip"
            disabled={currencyDisabled}
            onClick={onOpenCurrency}
            className="flex shrink-0 items-center gap-1.5 rounded-lg border border-input bg-transparent py-2 pr-2 pl-2.5 text-sm whitespace-nowrap transition-colors outline-none hover:bg-muted/50 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:bg-muted disabled:opacity-50 disabled:hover:bg-transparent disabled:active:bg-transparent"
          >
            <span className="font-medium text-foreground">{currency}</span>
            <ChevronDown aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
          </button>
        )}
      </div>
      {fxLine && <div className="text-xs text-muted-foreground">{fxLine}</div>}
    </div>
  );
}
