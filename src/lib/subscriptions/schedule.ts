/**
 * Subscription schedule math — pure, dependency-free, client-safe.
 *
 * One source of truth for "how often does this bill" and "when is it next due",
 * shared by the Subscriptions page (list + calendar views), the subscriptions
 * API's stale-date self-heal, the recurring detector and the MCP subscription
 * tools. Mirrored by mobile/src/lib/subscriptions.ts (mobile can't import web
 * `src/lib`) — keep the two in sync.
 *
 * Dates are ISO `YYYY-MM-DD` strings and every computation runs in UTC, so a
 * browser east of UTC can't shift a bill to the previous day (the old calendar
 * built local-midnight Dates and serialized them with `toISOString()`, which did
 * exactly that).
 *
 * Month-based cadences are computed from the ANCHOR date by index, never by
 * repeated stepping: a bill anchored on the 31st lands on Feb 28 and then back
 * on Mar 31, instead of drifting to the 28th forever (or, with `setMonth`,
 * overflowing Jan 31 → Mar 3).
 */

export const SUBSCRIPTION_FREQUENCIES = [
  "weekly",
  "biweekly",
  "every4weeks",
  "monthly",
  "monthly_eom",
  "bimonthly",
  "quarterly",
  "semiannual",
  "annual",
] as const;

export type SubscriptionFrequency = (typeof SUBSCRIPTION_FREQUENCIES)[number];

export const FREQUENCY_LABELS: Record<SubscriptionFrequency, string> = {
  weekly: "Weekly",
  biweekly: "Every 2 weeks",
  every4weeks: "Every 4 weeks",
  monthly: "Monthly",
  monthly_eom: "Last day of month",
  bimonthly: "Every 2 months",
  quarterly: "Quarterly",
  semiannual: "Semi-annual",
  annual: "Annual",
};

/** Compact per-period suffix for amounts, e.g. `$9.99 / mo`. */
export const FREQUENCY_SUFFIX: Record<SubscriptionFrequency, string> = {
  weekly: "wk",
  biweekly: "2 wks",
  every4weeks: "4 wks",
  monthly: "mo",
  monthly_eom: "mo",
  bimonthly: "2 mo",
  quarterly: "qtr",
  semiannual: "6 mo",
  annual: "yr",
};

const PERIODS_PER_YEAR: Record<SubscriptionFrequency, number> = {
  weekly: 52,
  biweekly: 26,
  every4weeks: 13,
  monthly: 12,
  monthly_eom: 12,
  bimonthly: 6,
  quarterly: 4,
  semiannual: 2,
  annual: 1,
};

// `eom` pins every occurrence to the month's LAST day regardless of the anchor's
// day (anchor Jan 15 -> Jan 31, Feb 28/29, Mar 31 ...).
const STEP: Record<SubscriptionFrequency, { unit: "day" | "month"; n: number; eom?: boolean }> = {
  weekly: { unit: "day", n: 7 },
  biweekly: { unit: "day", n: 14 },
  every4weeks: { unit: "day", n: 28 },
  monthly: { unit: "month", n: 1 },
  monthly_eom: { unit: "month", n: 1, eom: true },
  bimonthly: { unit: "month", n: 2 },
  quarterly: { unit: "month", n: 3 },
  semiannual: { unit: "month", n: 6 },
  annual: { unit: "month", n: 12 },
};

// Older writers used other spellings: the recurring detector and MCP accept
// "yearly", and free-text rows exist from before the column was constrained by
// the UI. Normalizing on read keeps every one of them on the right cadence.
const ALIASES: Record<string, SubscriptionFrequency> = {
  weekly: "weekly",
  week: "weekly",
  biweekly: "biweekly",
  "bi-weekly": "biweekly",
  bi_weekly: "biweekly",
  fortnightly: "biweekly",
  "every 2 weeks": "biweekly",
  every4weeks: "every4weeks",
  "every-4-weeks": "every4weeks",
  every_4_weeks: "every4weeks",
  "every 4 weeks": "every4weeks",
  monthly: "monthly",
  month: "monthly",
  monthly_eom: "monthly_eom",
  "monthly-eom": "monthly_eom",
  eom: "monthly_eom",
  "end of month": "monthly_eom",
  "last day of month": "monthly_eom",
  bimonthly: "bimonthly",
  "bi-monthly": "bimonthly",
  bi_monthly: "bimonthly",
  "every 2 months": "bimonthly",
  quarterly: "quarterly",
  quarter: "quarterly",
  semiannual: "semiannual",
  "semi-annual": "semiannual",
  semi_annual: "semiannual",
  semiannually: "semiannual",
  "semi-annually": "semiannual",
  "half-yearly": "semiannual",
  halfyearly: "semiannual",
  biannual: "semiannual",
  biannually: "semiannual",
  "every 6 months": "semiannual",
  annual: "annual",
  annually: "annual",
  yearly: "annual",
  year: "annual",
};

/** Canonical cadence for a stored/entered value, or `null` when unrecognised. */
export function normalizeFrequency(raw: string | null | undefined): SubscriptionFrequency | null {
  if (!raw) return null;
  return ALIASES[raw.trim().toLowerCase()] ?? null;
}

/**
 * Canonical cadence, falling back to monthly (the column default) so a legacy
 * free-text value never crashes a page — it is shown and costed as monthly,
 * which is what every reader did before this module existed.
 */
export function frequencyOrMonthly(raw: string | null | undefined): SubscriptionFrequency {
  return normalizeFrequency(raw) ?? "monthly";
}

export function frequencyLabel(raw: string | null | undefined): string {
  const f = normalizeFrequency(raw);
  return f ? FREQUENCY_LABELS[f] : (raw ?? "");
}

/** What one period costs, spread evenly over a month (weekly = ×52/12). */
export function monthlyEquivalent(amount: number, frequency: string | null | undefined): number {
  return (amount * PERIODS_PER_YEAR[frequencyOrMonthly(frequency)]) / 12;
}

/** What one period costs over a full year. */
export function annualEquivalent(amount: number, frequency: string | null | undefined): number {
  return amount * PERIODS_PER_YEAR[frequencyOrMonthly(frequency)];
}

// ─── Date helpers (UTC, ISO strings) ────────────────────────────────────────

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 86_400_000;

function parseIso(iso: string | null | undefined): { y: number; m0: number; d: number } | null {
  if (!iso) return null;
  const match = ISO_RE.exec(iso.trim());
  if (!match) return null;
  const y = Number(match[1]);
  const m0 = Number(match[2]) - 1;
  const d = Number(match[3]);
  if (m0 < 0 || m0 > 11 || d < 1 || d > 31) return null;
  return { y, m0, d };
}

function isoFromUtcMs(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function daysInMonth(y: number, m0: number): number {
  return new Date(Date.UTC(y, m0 + 1, 0)).getUTCDate();
}

export function isValidIsoDate(iso: string | null | undefined): boolean {
  return parseIso(iso) !== null;
}

/** `iso` shifted by `days` (may be negative). Returns the input unchanged if malformed. */
export function addDays(iso: string, days: number): string {
  const p = parseIso(iso);
  if (!p) return iso;
  return isoFromUtcMs(Date.UTC(p.y, p.m0, p.d) + days * DAY_MS);
}

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  const a = parseIso(from);
  const b = parseIso(to);
  if (!a || !b) return 0;
  return Math.round((Date.UTC(b.y, b.m0, b.d) - Date.UTC(a.y, a.m0, a.d)) / DAY_MS);
}

/**
 * The k-th occurrence relative to `anchor` (k = 0 is the anchor itself; k may
 * be negative). Month cadences clamp to the month's last day and re-expand.
 * `monthly_eom` is always the last day of the month (k = 0 is the end of the
 * anchor's month, which equals the anchor only when it already is a month-end).
 */
export function occurrenceAt(anchor: string, frequency: string | null | undefined, k: number): string {
  const p = parseIso(anchor);
  if (!p) return anchor;
  const step = STEP[frequencyOrMonthly(frequency)];
  if (step.unit === "day") {
    return isoFromUtcMs(Date.UTC(p.y, p.m0, p.d) + k * step.n * DAY_MS);
  }
  const total = p.m0 + k * step.n;
  const y = p.y + Math.floor(total / 12);
  const m0 = ((total % 12) + 12) % 12;
  const dim = daysInMonth(y, m0);
  const d = step.eom ? dim : Math.min(p.d, dim);
  return isoFromUtcMs(Date.UTC(y, m0, d));
}

/** Smallest index k whose occurrence is on or after `date`. */
function firstIndexOnOrAfter(anchor: string, frequency: SubscriptionFrequency, date: string): number {
  const a = parseIso(anchor)!;
  const t = parseIso(date)!;
  const step = STEP[frequency];
  if (step.unit === "day") {
    const diff = (Date.UTC(t.y, t.m0, t.d) - Date.UTC(a.y, a.m0, a.d)) / DAY_MS;
    return Math.ceil(diff / step.n);
  }
  // Start one step below the calendar-month estimate (guaranteed < date), then
  // walk up — at most a couple of iterations.
  const monthsDiff = (t.y - a.y) * 12 + (t.m0 - a.m0);
  let k = Math.floor(monthsDiff / step.n) - 1;
  while (occurrenceAt(anchor, frequency, k) < date) k++;
  return k;
}

/** First occurrence on or after `date` for a schedule anchored at `anchor`. */
export function nextOnOrAfter(anchor: string, frequency: string | null | undefined, date: string): string | null {
  if (!parseIso(anchor) || !parseIso(date)) return null;
  const f = frequencyOrMonthly(frequency);
  return occurrenceAt(anchor, f, firstIndexOnOrAfter(anchor, f, date));
}

/**
 * A stored next-payment date that has already passed is rolled forward to the
 * next occurrence on/after `today`; a current or future date is returned as is.
 * `null` for a missing or malformed date.
 */
export function rollForwardNextDate(
  nextDate: string | null | undefined,
  frequency: string | null | undefined,
  today: string,
): string | null {
  if (!nextDate || !parseIso(nextDate)) return null;
  if (nextDate >= today) return nextDate;
  return nextOnOrAfter(nextDate, frequency, today);
}

/**
 * Optional end conditions for a schedule. `endDate` is the last date (inclusive)
 * an occurrence may fall on. `remainingCount` is how many occurrences are still
 * to come COUNTING FROM THE ANCHOR (the anchor — a subscription's `next_date` —
 * is the first of them), so only indexes `0 .. remainingCount-1` exist.
 * Missing / null / non-positive-or-invalid values mean "no limit" except
 * `remainingCount <= 0`, which means "nothing left".
 */
export interface ScheduleEnd {
  endDate?: string | null;
  remainingCount?: number | null;
}

/** True when occurrence index `k` (dated `date`) is still inside `ending`. */
export function isWithinEnd(k: number, date: string, ending?: ScheduleEnd | null): boolean {
  if (!ending) return true;
  if (ending.endDate && parseIso(ending.endDate) && date > ending.endDate) return false;
  if (ending.remainingCount != null && Number.isFinite(ending.remainingCount) && k >= ending.remainingCount) return false;
  return true;
}

/**
 * Every occurrence in `[start, end]` (inclusive) for a schedule anchored at
 * `anchor`, projected both backwards and forwards. Capped by `limit` so a
 * malformed range can't spin. With `ending`, stops after the end date /
 * remaining count (see {@link ScheduleEnd}); a `remainingCount` also removes
 * the backward projection (indexes below 0 are before the series began).
 */
export function occurrencesBetween(
  anchor: string,
  frequency: string | null | undefined,
  start: string,
  end: string,
  limit = 400,
  ending?: ScheduleEnd | null,
): string[] {
  if (!parseIso(anchor) || !parseIso(start) || !parseIso(end) || start > end) return [];
  const f = frequencyOrMonthly(frequency);
  const out: string[] = [];
  const hasCount = ending?.remainingCount != null && Number.isFinite(ending.remainingCount);
  let k = firstIndexOnOrAfter(anchor, f, start);
  if (hasCount && k < 0) k = 0;
  for (; out.length < limit; k++) {
    const d = occurrenceAt(anchor, f, k);
    if (d > end) break;
    if (!isWithinEnd(k, d, ending)) break;
    out.push(d);
  }
  return out;
}

/**
 * First occurrence STRICTLY after `date` (the "next date" of a repeat that has
 * just booked `date`). `monthly_eom` lands on the month's last day, so booking
 * Jan 15 repeats on Jan 31 and booking Jan 31 repeats on Feb 28/29.
 */
export function firstOccurrenceAfter(date: string, frequency: string | null | undefined): string | null {
  if (!parseIso(date)) return null;
  return nextOnOrAfter(date, frequency, addDays(date, 1));
}
