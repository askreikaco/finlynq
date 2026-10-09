"use client";

import * as React from "react";

import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface AmountRowProps {
  value: string;
  onChange: (value: string) => void;
  /** Called on focus; the page opens the numpad here. Typing from a hardware keyboard still works. */
  onOpenPad: () => void;
  currency: string;
  currencyOptions: string[];
  onCurrencyChange: (currency: string) => void;
  /** Hide the currency chip (Transfer). */
  showCurrency?: boolean;
  /** Optional FX preview line under the amount. */
  fxLine?: React.ReactNode;
  invalid?: boolean;
  testId?: string;
  className?: string;
}

export function AmountRow({
  value,
  onChange,
  onOpenPad,
  currency,
  currencyOptions,
  onCurrencyChange,
  showCurrency = true,
  fxLine,
  invalid,
  testId,
  className,
}: AmountRowProps) {
  return (
    <div data-testid={testId} className={cn("flex min-h-14 flex-col gap-1 px-4 py-2", className)}>
      <div className="flex min-w-0 items-center gap-3">
        {showCurrency && (
          <Select value={currency} onValueChange={(v) => onCurrencyChange(v ?? "")}>
            <SelectTrigger aria-label="Currency" className="shrink-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {currencyOptions.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
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
      </div>
      {fxLine && <div className="text-xs text-muted-foreground">{fxLine}</div>}
    </div>
  );
}
