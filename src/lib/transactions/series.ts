/**
 * Repeat + Installment on the entry screen: the screen's `series` state, its API payloads,
 * the pill summary, the live installment preview and the server-error messages.
 * Pure: no React, no I/O.
 */

import { formatCurrency } from "@/lib/currency";
import {
  isValidIntervalDays,
  MAX_INTERVAL_DAYS,
  MIN_INTERVAL_DAYS,
  type SubscriptionFrequency,
} from "@/lib/subscriptions/schedule";
import {
  InstallmentPlanError,
  MAX_INSTALLMENTS,
  MIN_INSTALLMENTS,
  planInstallments,
  type InstallmentMode,
} from "@/lib/transactions/installment-plan";
import { fromMinor } from "@/lib/transactions/split-math";

export { MAX_INSTALLMENTS, MIN_INSTALLMENTS };
export type { InstallmentMode };

/** Bounds of "After N times" (total postings including the one being saved). */
export const MIN_REPEAT_COUNT = 2;
export const MAX_REPEAT_COUNT = 120;

export type RepeatEnd =
  | { type: "forever" }
  | { type: "until"; date: string }
  | { type: "count"; count: number };

export type Series =
  | {
      kind: "repeat";
      frequency: SubscriptionFrequency;
      /** Days between repeats; set only with frequency "every_n_days". */
      intervalDays?: number | null;
      end: RepeatEnd;
    }
  | { kind: "installment"; count: number; mode: InstallmentMode };

/** The choices on the Repeat sheet, in order. "none" = no series. No group titles: one flat list. */
export type RepeatChoice = "none" | "daily" | "weekly" | "monthly" | "quarterly" | "annual" | "every_n_days";

export const REPEAT_OPTIONS: ReadonlyArray<{ value: RepeatChoice; label: string }> = [
  { value: "none", label: "No repeat" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "annual", label: "Annually" },
  { value: "every_n_days", label: "Custom" },
];

/** Bounds + default of the Custom "Every N days" input. */
export { MIN_INTERVAL_DAYS, MAX_INTERVAL_DAYS };
export const DEFAULT_INTERVAL_DAYS = 2;

/** True for a whole number of days within the allowed range. */
export function isValidInterval(n: unknown): n is number {
  return isValidIntervalDays(n);
}

// Labels for every cadence the engine knows. The sheet only offers the ones in
// REPEAT_OPTIONS, but a row created earlier (or via MCP) can carry any of them.
const REPEAT_LABEL: Record<SubscriptionFrequency, string> = {
  daily: "Daily",
  weekdays: "Weekdays",
  weekend: "Weekend",
  weekly: "Weekly",
  biweekly: "Every 2 weeks",
  every4weeks: "Every 4 weeks",
  monthly: "Monthly",
  monthly_eom: "Last day of month",
  bimonthly: "Every 2 months",
  quarterly: "Quarterly",
  semiannual: "Every 6 months",
  annual: "Annually",
  every_n_days: "Custom",
};

export function repeatLabel(frequency: SubscriptionFrequency, intervalDays?: number | null): string {
  if (frequency === "every_n_days") {
    const n = intervalDays ?? NaN;
    if (!isValidIntervalDays(n)) return REPEAT_LABEL.every_n_days;
    return n === 1 ? "Daily" : `Every ${n} days`;
  }
  return REPEAT_LABEL[frequency];
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "31 Dec 2026" from an ISO date (no Date object: timezone-proof). */
export function shortDate(iso: string, withYear = true): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  const month = MONTHS[Number(m[2]) - 1] ?? m[2];
  return `${Number(m[3])} ${month}${withYear ? ` ${m[1]}` : ""}`;
}

/** Pill text once a series is set. */
export function seriesSummary(series: Series): string {
  if (series.kind === "installment") return `${series.count} installments`;
  const label = repeatLabel(series.frequency, series.intervalDays);
  if (series.end.type === "count") return `${label} · ${series.end.count}×`;
  if (series.end.type === "until") return `${label} until ${shortDate(series.end.date)}`;
  return label;
}

/** The `repeat` member of POST /api/transactions. */
export function buildRepeatBody(series: Extract<Series, { kind: "repeat" }>) {
  const end = series.end;
  return {
    frequency: series.frequency,
    ...(series.frequency === "every_n_days" ? { intervalDays: series.intervalDays ?? null } : {}),
    end:
      end.type === "until"
        ? { type: "until" as const, date: end.date }
        : end.type === "count"
          ? { type: "count" as const, count: end.count }
          : { type: "forever" as const },
  };
}

export interface InstallmentPreview {
  ok: boolean;
  text: string;
}

/**
 * Live preview line: "6 × 83.33, 10 Jan – 10 Jun 2027". When the last payment differs by the
 * minor-unit remainder it is shown apart: "5 × 83.33, last 83.35, 10 Jan – 10 Jun 2027".
 */
export function installmentPreview(args: {
  startDate: string;
  count: number;
  mode: InstallmentMode;
  amount: number;
  currency: string;
}): InstallmentPreview {
  const { startDate, count, mode, amount, currency } = args;
  if (!(amount > 0)) return { ok: false, text: "Enter an amount to preview the payments" };
  let plan;
  try {
    plan = planInstallments({ startDate, count, mode, amount, currency });
  } catch (e) {
    return { ok: false, text: e instanceof InstallmentPlanError ? e.message : "Cannot preview this plan" };
  }
  const money = (minor: number) => formatCurrency(fromMinor(minor, currency), currency);
  const first = plan[0];
  const last = plan[plan.length - 1];
  const first_ = shortDate(first.date, first.date.slice(0, 4) !== last.date.slice(0, 4));
  const range = `${first_} – ${shortDate(last.date)}`;
  const amounts =
    last.amountMinor === first.amountMinor
      ? `${plan.length} × ${money(first.amountMinor)}`
      : `${plan.length - 1} × ${money(first.amountMinor)}, last ${money(last.amountMinor)}`;
  return { ok: true, text: `${amounts}, ${range}` };
}

/** Friendly message for a failed save of a series (repeat on POST /api/transactions, or /installments). */
export function seriesErrorMessage(
  status: number,
  body: { code?: string; error?: string; currency?: string } | null,
  fallback: string,
  currency: string,
): string {
  switch (body?.code) {
    case "repeat_requires_payee":
      return "Repeat needs a payee";
    case "repeat_end_before_first":
      return "The repeat end date is before the first repeat. Pick a later date.";
    case "repeat_not_supported":
      return "Repeat is not available for this kind of transaction.";
    case "repeat_subscription_name_conflict":
      return "A different subscription with this payee name already exists. Edit or rename it first.";
    case "invalid_plan":
      return body.error ?? "These installment details are not valid.";
    case "fx-currency-needs-override":
      return `No FX rate for ${body.currency ?? currency}.`;
    default:
      break;
  }
  if (status === 423) return "Unlock your data to make changes";
  return body?.error || fallback;
}
