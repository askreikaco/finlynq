"use client";

/**
 * Shared controls for the portfolio report pages (realized gains, dividend income).
 * Chip groups are the filter UI on both breakpoints.
 */

import * as React from "react";
import { Button } from "@/components/ui/button";
import { formatPercent, getDisplayLocale } from "@/lib/locale";
import { cn } from "@/lib/utils";

export interface ChipOption<T extends string> {
  value: T;
  label: string;
}

/** One labelled row of single-choice chips (44px touch targets via Button sm below md). */
export function ChipGroup<T extends string>({
  label,
  options,
  value,
  onChange,
  disabled = false,
  className,
}: {
  label: string;
  options: ChipOption<T>[];
  value: T;
  onChange: (v: T) => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <div role="group" aria-label={label} className={cn("flex flex-col gap-2", className)}>
      <span className="text-xs font-semibold uppercase tracking-normal text-muted-foreground">{label}</span>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <Button
            key={o.value}
            type="button"
            size="sm"
            variant={value === o.value ? "primary" : "outline"}
            aria-pressed={value === o.value}
            disabled={disabled}
            onClick={() => onChange(o.value)}
            className="rounded-full"
          >
            {o.label}
          </Button>
        ))}
      </div>
    </div>
  );
}

/** "2026-03" -> "March 2026" in the active display locale. */
export function monthLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  if (!y || !m) return ym;
  return new Intl.DateTimeFormat(getDisplayLocale(), { month: "long", year: "numeric" }).format(new Date(y, m - 1, 1));
}

/** Signed percent for a secondary value: "+12.34%" / "-3.00%". */
export function signedPercent(n: number, digits = 2): string {
  return `${n >= 0 ? "+" : ""}${formatPercent(n, digits)}`;
}
