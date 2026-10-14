"use client";

import { useCallback, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { localDateISO } from "@/lib/utils/date";
import {
  parseRangeSelection, previousPeriod, rangeToParams, resolvePeriod,
  type Period, type RangeKey, type RangeSelection,
} from "./period";

/**
 * The selected metric range. Lives in the URL (?range=&from=&to=) so a view is shareable; local state mirrors it so
 * a change repaints at once (history.replaceState does not re-render useSearchParams). `baseMonth` anchors the
 * presets on a page-specific month (budgets month navigator).
 */
export function useMetricRange(baseMonth?: string, defaultRange?: RangeKey): {
  selection: RangeSelection;
  /** True when the URL carries an explicit non-default range. */
  explicit: boolean;
  period: Period;
  previous: Period;
  setSelection: (next: RangeSelection) => void;
} {
  const searchParams = useSearchParams();
  const [selection, setSel] = useState<RangeSelection>(() => {
    const parsed = parseRangeSelection((k) => searchParams?.get(k));
    // A page default (reports: this_year) applies only while the URL carries no ?range= at all.
    return defaultRange && !searchParams?.get("range") ? { range: defaultRange, ...(parsed.month ? { month: parsed.month } : {}) } : parsed;
  });
  const setSelection = useCallback((next: RangeSelection) => {
    setSel(next);
    try {
      const url = new URL(window.location.href);
      // A page that owns ?month= itself (budgets: baseMonth) keeps it; otherwise the selection owns it.
      for (const k of baseMonth ? ["range", "from", "to"] : ["range", "from", "to", "month"]) url.searchParams.delete(k);
      const params = rangeToParams(next);
      if (defaultRange && defaultRange !== "this_month" && next.range === "this_month") params.range = "this_month";
      for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
      window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
    } catch {
      /* URL sync is a convenience; the cards still follow the state. */
    }
  }, [baseMonth, defaultRange]);
  const today = localDateISO();
  const period = useMemo(() => resolvePeriod(selection, today, baseMonth), [selection, today, baseMonth]);
  const previous = useMemo(() => previousPeriod(period), [period]);
  return { selection, explicit: selection.range !== "this_month", period, previous, setSelection };
}
