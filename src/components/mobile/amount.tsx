import * as React from "react";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/currency";
import { formatCompactNumber } from "@/lib/utils/number";
import { useDisplayCurrency } from "@/components/currency-provider";

export type AmountSize = "hero" | "lg" | "md";
export type AmountTone = "auto" | "pos" | "neg" | "muted" | "none";

const SIZE: Record<AmountSize, string> = {
  hero: "text-[32px] leading-10 font-extrabold",
  lg: "text-xl font-bold",
  md: "text-[15px] font-semibold",
};

/** Tone -> semantic color token (text-pos / text-neg come from globals.css @theme). */
export function amountToneClass(tone: AmountTone, value: number): string {
  const t = tone === "auto" ? (value > 0 ? "pos" : value < 0 ? "neg" : "none") : tone;
  if (t === "pos") return "text-pos";
  if (t === "neg") return "text-neg";
  if (t === "muted") return "text-muted-foreground";
  return "text-foreground";
}

/**
 * Money amount: tabular figures, nowrap, sign color. Below md the `tabular-nums`
 * class resolves to the system sans (globals.css); md+ keeps the app's mono.
 * Formatting always goes through formatCurrency (VND/JPY/KRW: no decimals).
 * `compact` renders K/M/B (formatCompactNumber) with the full value as aria-label.
 *
 * Falls back to displayCurrency when no currency prop is provided, with USD default
 * during first paint (isLoading).
 */
export function Amount({
  value,
  currency,
  size = "md",
  tone = "auto",
  showSign = false,
  compact = false,
  className,
  ...props
}: Omit<React.HTMLAttributes<HTMLSpanElement>, "children"> & {
  value: number;
  currency?: string;
  size?: AmountSize;
  tone?: AmountTone;
  showSign?: boolean;
  compact?: boolean;
}) {
  const { displayCurrency, isLoading } = useDisplayCurrency();

  // Use provided currency, or fall back to displayCurrency (or USD during loading)
  const effectiveCurrency = currency ?? (isLoading ? "USD" : displayCurrency);

  const full = formatCurrency(value, effectiveCurrency);
  const text = compact ? formatCompactNumber(value) : full;
  const signed = showSign && value > 0 ? `+${text}` : text;
  return (
    <span
      data-slot="amount"
      data-testid="amount"
      data-value={String(value)}
      aria-label={compact ? full : undefined}
      className={cn(
        "tabular-nums whitespace-nowrap",
        SIZE[size],
        amountToneClass(tone, value),
        className,
      )}
      {...props}
    >
      {signed}
    </span>
  );
}
