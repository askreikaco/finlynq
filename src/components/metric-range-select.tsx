"use client";
import { localDateISO } from "@/lib/utils/date";
import { cn } from "@/lib/utils";
import { Field } from "@/components/ui/field";
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
  // The toolbar (touch) keeps every control 44px, including dense pointer-fine, to match the month switcher beside it.
  const tall = touch ? "dense:pointer-fine:h-11" : undefined;
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
      <Field
        control="select"
        compact={!touch}
        value={value.range}
        onValueChange={(v) => pick((v as RangeKey) || "this_month")}
        aria-label="Time range"
        className="w-auto"
        controlClassName={cn("min-w-36 rounded-full pl-4", tall)}
        options={options.map((k) => ({ value: k, label: RANGE_LABELS[k] }))}
      />
      {value.range === "custom" && (
        <>
          <Field
            control="date"
            compact={!touch}
            aria-label="From date"
            value={value.from ?? ""}
            max={value.to}
            onChange={(e) => e.target.value && onChange({ range: "custom", from: e.target.value, to: value.to ?? e.target.value })}
            className="w-auto"
            controlClassName={tall}
          />
          <Field
            control="date"
            compact={!touch}
            aria-label="To date"
            value={value.to ?? ""}
            min={value.from}
            onChange={(e) => e.target.value && onChange({ range: "custom", from: value.from ?? e.target.value, to: e.target.value })}
            className="w-auto"
            controlClassName={tall}
          />
        </>
      )}
    </div>
  );
}
