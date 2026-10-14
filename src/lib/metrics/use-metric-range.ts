"use client";

import { useCallback, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { localDateISO } from "@/lib/utils/date";
import {
  parseRangeSelection, previousPeriod, rangeToParams, resolvePeriod,
  type Period, type RangeSelection,
} from "./period";

/**
 * The selected metric range. Lives in the URL (?range=&from=&to=) so a view is shareable; local state mirrors it so
 * a change repaints at once (history.replaceState does not re-render useSearchParams). `baseMonth` anchors the
 * presets on a page-specific month (budgets month navigator).
 */
export function useMetricRange(baseMonth?: string): {
  selection: RangeSelection;
  /** True when the URL carries an explicit non-default range. */
  explicit: boolean;
  period: Period;
  previous: Period;
  setSelection: (next: RangeSelection) => void;
} {
  const searchParams = useSearchParams();
  const [selection, setSel] = useState<RangeSelection>(() => parseRangeSelection((k) => searchParams?.get(k)));
  const setSelection = useCallback((next: RangeSelection) => {
    setSel(next);
    try {
      const url = new URL(window.location.href);
      // A page that owns ?month= itself (budgets: baseMonth) keeps it; otherwise the selection owns it.
      for (const k of baseMonth ? ["range", "from", "to"] : ["range", "from", "to", "month"]) url.searchParams.delete(k);
      for (const [k, v] of Object.entries(rangeToParams(next))) url.searchParams.set(k, v);
      window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
    } catch {
      /* URL sync is a convenience; the cards still follow the state. */
    }
  }, [baseMonth]);
  const today = localDateISO();
  const period = useMemo(() => resolvePeriod(selection, today, baseMonth), [selection, today, baseMonth]);
  const previous = useMemo(() => previousPeriod(period), [period]);
  return { selection, explicit: selection.range !== "this_month", period, previous, setSelection };
}
