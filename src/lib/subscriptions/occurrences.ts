/**
 * Due-occurrence + advance math for subscriptions — pure, client-safe.
 *
 * A subscription's `next_date` is occurrence #1 of what is left (index 0);
 * `remaining_count` counts from it (see ScheduleEnd in ./schedule.ts). Posting
 * or skipping index 0 consumes it: next_date becomes index 1, remaining_count
 * drops by one, and the subscription is `ended` once nothing is left (the next
 * occurrence falls after `end_date`, or the count reaches 0).
 *
 * Every step is computed from the series ANCHOR (`anchor_date`) by index, not
 * from next_date (see occurrenceFromNext): Jan 31 monthly -> Feb 28 -> Mar 31 ->
 * Apr 30. A null anchor falls back to next_date.
 */

import {
  isValidIsoDate,
  isWithinEnd,
  normalizeFrequency,
  occurrenceFromNext,
  stepsToOnOrAfter,
  type ScheduleEnd,
} from "./schedule";

export interface SubscriptionScheduleState extends ScheduleEnd {
  nextDate: string | null;
  frequency: string | null | undefined;
  /** subscriptions.anchor_date: the date the series started on; null = use nextDate. */
  anchorDate?: string | null;
}

export interface AdvanceResult {
  /** New next_date. Unchanged when `ended` (history, not a forecast). */
  nextDate: string;
  remainingCount: number | null;
  ended: boolean;
}

/** Hard bound on how many due occurrences are ever enumerated. */
export const MAX_DUE_SCAN = 1000;
/** Occurrences returned in the GET response. */
export const OVERDUE_RESPONSE_CAP = 12;

/** True when the schedule has nothing left even at index 0. */
export function isExhausted(s: SubscriptionScheduleState): boolean {
  if (!s.nextDate || !isValidIsoDate(s.nextDate)) return false;
  return !isWithinEnd(0, s.nextDate, s);
}

/** Consume the occurrence at next_date (post or skip) and compute the new state. */
export function advanceOneOccurrence(s: SubscriptionScheduleState & { nextDate: string }): AdvanceResult {
  const f = normalizeFrequency(s.frequency) ?? "monthly";
  const nextDate = occurrenceFromNext(s.anchorDate, s.nextDate, f, 1);
  const remainingCount = s.remainingCount != null ? Math.max(0, s.remainingCount - 1) : null;
  // After consuming one, the next occurrence is index 0 of the new state.
  const ended = !isWithinEnd(0, nextDate, { endDate: s.endDate, remainingCount });
  if (ended) return { nextDate: s.nextDate, remainingCount, ended: true };
  return { nextDate, remainingCount, ended: false };
}

/**
 * Roll a NON-postable schedule forward past `today` (the legacy self-heal) while
 * honouring the end: every skipped occurrence consumes one from remaining_count,
 * and a schedule whose next occurrence is past end_date / count is `ended`.
 * Returns null when nothing changes.
 */
export function rollForwardWithEnd(
  s: SubscriptionScheduleState,
  today: string,
): AdvanceResult | null {
  if (!s.nextDate || !isValidIsoDate(s.nextDate)) return null;
  if (isExhausted(s)) return { nextDate: s.nextDate, remainingCount: s.remainingCount ?? null, ended: true };
  if (s.nextDate >= today) return null;
  // How many occurrences were skipped = steps from next_date to the first one on/after today.
  const k = stepsToOnOrAfter(s.anchorDate, s.nextDate, s.frequency, today);
  const next = occurrenceFromNext(s.anchorDate, s.nextDate, s.frequency, k);
  if (k === 0 || next === s.nextDate) return null;
  const remainingCount = s.remainingCount != null ? s.remainingCount - k : null;
  if (!isWithinEnd(0, next, { endDate: s.endDate, remainingCount })) {
    return { nextDate: s.nextDate, remainingCount: Math.max(0, remainingCount ?? 0), ended: true };
  }
  return { nextDate: next, remainingCount, ended: false };
}

export interface DueInfo {
  /** Occurrence dates on/before `today`, oldest first, capped at OVERDUE_RESPONSE_CAP. */
  overdue: string[];
  /** Total occurrences on/before `today` (bounded by MAX_DUE_SCAN). */
  dueCount: number;
}

/** Occurrences from next_date up to and including `today`, honouring the end. */
export function dueOccurrences(s: SubscriptionScheduleState, today: string): DueInfo {
  const empty: DueInfo = { overdue: [], dueCount: 0 };
  if (!s.nextDate || !isValidIsoDate(s.nextDate) || s.nextDate > today) return empty;
  const f = normalizeFrequency(s.frequency) ?? "monthly";
  const overdue: string[] = [];
  let count = 0;
  for (let k = 0; k < MAX_DUE_SCAN; k++) {
    const d = occurrenceFromNext(s.anchorDate, s.nextDate, f, k);
    if (d > today || !isWithinEnd(k, d, s)) break;
    count++;
    if (overdue.length < OVERDUE_RESPONSE_CAP) overdue.push(d);
  }
  return { overdue, dueCount: count };
}
