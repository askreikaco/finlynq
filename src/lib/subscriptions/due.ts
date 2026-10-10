/**
 * Client helpers for "Post now" / "Skip" prompts (Repeat + Installment phase 2a).
 * Pure: shared by the Due card, the Subscriptions page and the entry screen.
 */
import type { SubscriptionRow } from "./calendar-events";

export type DueSubscription = SubscriptionRow;

/** Active subscriptions with at least one occurrence on/before today, oldest first. */
export function dueSubscriptions<T extends SubscriptionRow>(subs: readonly T[] | null | undefined): T[] {
  return (subs ?? [])
    .filter((s) => s.status === "active" && (s.dueCount ?? 0) > 0 && !!s.nextDate)
    .sort((a, b) => (a.nextDate as string).localeCompare(b.nextDate as string) || a.id - b.id);
}

/** Entry screen in "post this occurrence" mode. `returnTo` is a same-origin path. */
export function postNowHref(subscriptionId: number, occurrenceDate: string, returnTo?: string): string {
  const q = new URLSearchParams({ subscription: String(subscriptionId), occurrence: occurrenceDate });
  if (returnTo && returnTo.startsWith("/") && !returnTo.startsWith("//")) q.set("return", returnTo);
  return `/transactions/new?${q.toString()}`;
}

/** POST /api/subscriptions { action: "skip" } */
export function skipOccurrence(subscriptionId: number, occurrenceDate: string): Promise<Response> {
  return fetch("/api/subscriptions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "skip", id: subscriptionId, occurrenceDate }),
  });
}

/** "5 Mar" style relative wording for the Due rows: "3 due since ..." handled by callers. */
export function dueSummary(s: Pick<SubscriptionRow, "dueCount">): string | null {
  const n = s.dueCount ?? 0;
  return n > 1 ? `${n} due` : null;
}
