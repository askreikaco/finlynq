import { getDisplayLocale } from "@/lib/locale";

/**
 * X-axis tick for a "YYYY-MM-DD" date: "Mar 25" for a short window, "Mar 25" (month + 2-digit year) when
 * `longSpan` (the ALL period) so ticks stay unambiguous across years.
 */
export function dateTick(date: string, longSpan: boolean): string {
  const dt = new Date(`${date}T00:00:00Z`);
  return dt.toLocaleDateString(
    getDisplayLocale(),
    longSpan ? { month: "short", year: "2-digit", timeZone: "UTC" } : { month: "short", day: "numeric", timeZone: "UTC" },
  );
}
