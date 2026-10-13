"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { localDateISO } from "@/lib/utils/date";
import { Input } from "@/components/ui/input";
import { RANGE_KEYS, RANGE_LABELS, type RangeKey, type RangeSelection } from "@/lib/metrics/period";

/**
 * Compact period control for the metric cards: This month (default), Last month, Last 3 / 6 months, Year to date or
 * a custom from/to. The parent owns the state (useMetricRange keeps it in the URL).
 */
export function MetricRangeSelect({ value, onChange }: { value: RangeSelection; onChange: (next: RangeSelection) => void }) {
  const pick = (range: RangeKey) => {
    if (range === "custom") {
      const to = localDateISO();
      const from = `${to.slice(0, 7)}-01`;
      onChange({ range, from: value.from ?? from, to: value.to ?? to });
    } else onChange({ range });
  };
  return (
    <div data-slot="metric-range" className="flex flex-wrap items-center gap-2">
      <Select items={RANGE_LABELS} value={value.range} onValueChange={(v) => pick((v as RangeKey) ?? "this_month")}>
        <SelectTrigger aria-label="Time range" className="h-8 w-auto min-w-36 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {RANGE_KEYS.map((k) => (
            <SelectItem key={k} value={k}>{RANGE_LABELS[k]}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      {value.range === "custom" && (
        <>
          <Input
            type="date"
            aria-label="From date"
            className="h-8 w-auto text-xs"
            value={value.from ?? ""}
            max={value.to}
            onChange={(e) => e.target.value && onChange({ range: "custom", from: e.target.value, to: value.to ?? e.target.value })}
          />
          <Input
            type="date"
            aria-label="To date"
            className="h-8 w-auto text-xs"
            value={value.to ?? ""}
            min={value.from}
            onChange={(e) => e.target.value && onChange({ range: "custom", from: value.from ?? e.target.value, to: e.target.value })}
          />
        </>
      )}
    </div>
  );
}
