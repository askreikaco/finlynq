"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { localDateISO } from "@/lib/utils/date";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { RANGE_KEYS, RANGE_LABELS, UNIT_MONTHS, type RangeKey, type RangeSelection } from "@/lib/metrics/period";

/**
 * Compact period control for the metric cards: This month (default), Last month, Last 3 / 6 months, Year to date or
 * a custom from/to. The parent owns the state (useMetricRange keeps it in the URL).
 */
export function MetricRangeSelect({
  value,
  onChange,
  keys = RANGE_KEYS,
  touch = false,
  className,
}: {
  value: RangeSelection;
  onChange: (next: RangeSelection) => void;
  /** Options to offer, in order (default: every range). A range already selected via the URL is always listed. */
  keys?: readonly RangeKey[];
  /** 44px controls (the page toolbar). Default: the compact 32px cards control. */
  touch?: boolean;
  className?: string;
}) {
  const options = keys.includes(value.range) ? keys : [value.range, ...keys];
  const h = touch ? "h-11" : "h-8";
  const pick = (range: RangeKey) => {
    if (range === "custom") {
      const to = localDateISO();
      const from = `${to.slice(0, 7)}-01`;
      onChange({ range, from: value.from ?? from, to: value.to ?? to });
    } else if (UNIT_MONTHS[range] && value.month) onChange({ range, month: value.month });
    else onChange({ range });
  };
  return (
    <div data-slot="metric-range" className={cn("flex flex-wrap items-center gap-2", className)}>
      <Select items={RANGE_LABELS} value={value.range} onValueChange={(v) => pick((v as RangeKey) ?? "this_month")}>
        <SelectTrigger aria-label="Time range" className={cn(h, "w-auto min-w-36 text-xs")}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((k) => (
            <SelectItem key={k} value={k}>{RANGE_LABELS[k]}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      {value.range === "custom" && (
        <>
          <Input
            type="date"
            aria-label="From date"
            className={cn(h, "w-auto text-xs")}
            value={value.from ?? ""}
            max={value.to}
            onChange={(e) => e.target.value && onChange({ range: "custom", from: e.target.value, to: value.to ?? e.target.value })}
          />
          <Input
            type="date"
            aria-label="To date"
            className={cn(h, "w-auto text-xs")}
            value={value.to ?? ""}
            min={value.from}
            onChange={(e) => e.target.value && onChange({ range: "custom", from: value.from ?? e.target.value, to: e.target.value })}
          />
        </>
      )}
    </div>
  );
}
