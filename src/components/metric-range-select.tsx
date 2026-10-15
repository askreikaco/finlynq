"use client";
import { localDateISO } from "@/lib/utils/date";
import { cn } from "@/lib/utils";
import { CONTROL_SURFACE } from "@/components/ui/control-surface";
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
  // The Select base sets its height through data-[size=default]:h-8 (more specific than a plain h-*), so the toolbar
  // height is set on the same selectors; otherwise the trigger is shorter than the 44px month switcher beside it.
  const h = touch
    ? "h-11 data-[size=default]:h-11 pointer-coarse:data-[size=default]:h-11 dense:pointer-fine:data-[size=default]:h-11"
    : "h-8";
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
        value={value.range}
        onValueChange={(v) => pick((v as RangeKey) ?? "this_month")}
        aria-label="Time range"
        className={cn(h, "w-auto min-w-36 rounded-full pl-4 text-xs", CONTROL_SURFACE)}
        options={options.map((k) => ({ value: k, label: RANGE_LABELS[k] }))}
      />
      {value.range === "custom" && (
        <>
          <Field
            control="date"
            aria-label="From date"
            value={value.from ?? ""}
            max={value.to}
            onChange={(e) => e.target.value && onChange({ range: "custom", from: e.target.value, to: value.to ?? e.target.value })}
            className={cn(h, "w-auto text-xs")}
          />
          <Field
            control="date"
            aria-label="To date"
            value={value.to ?? ""}
            min={value.from}
            onChange={(e) => e.target.value && onChange({ range: "custom", from: value.from ?? e.target.value, to: e.target.value })}
            className={cn(h, "w-auto text-xs")}
          />
        </>
      )}
    </div>
  );
}
