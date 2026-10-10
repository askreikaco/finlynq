/**
 * Server side of "Post now" / "Skip" for a subscription occurrence (Repeat +
 * Installment phase 2a). Both run inside the caller's `withDbTransaction`:
 *
 *   1. {@link lockDueOccurrence}  - the subscription is the user's, active, and
 *      `occurrenceDate` is exactly its current next_date (else 409 / 404).
 *   2. (post only) the transaction row is inserted with subscription_id +
 *      occurrence_date; the partial unique index turns a repeat of the same
 *      occurrence into 23505 -> 409 already_posted (see {@link mapPostError}).
 *   3. {@link consumeOccurrence}  - next_date -> the following occurrence,
 *      remaining_count - 1, status 'ended' when nothing is left. The UPDATE is
 *      conditional on the next_date it read, so a concurrent post/skip that
 *      got there first leaves 0 rows -> 409 and this transaction rolls back.
 */

import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { isPgErrorCode, pgErrorConstraint } from "@/lib/db-utils";
import { advanceOneOccurrence } from "./occurrences";

export const OCCURRENCE_UNIQUE_INDEX = "uniq_transactions_subscription_occurrence";

export class OccurrenceError extends Error {
  constructor(
    message: string,
    public readonly code: "not_found" | "subscription_not_active" | "occurrence_not_due" | "already_posted",
    public readonly status: 404 | 409,
  ) {
    super(message);
  }
}

export type SubscriptionRow = typeof schema.subscriptions.$inferSelect;

export interface AdvancedSubscription {
  id: number;
  nextDate: string;
  remainingCount: number | null;
  status: string;
}

export async function lockDueOccurrence(
  userId: string,
  subscriptionId: number,
  occurrenceDate: string,
): Promise<SubscriptionRow> {
  const sub = await db
    .select()
    .from(schema.subscriptions)
    .where(and(eq(schema.subscriptions.id, subscriptionId), eq(schema.subscriptions.userId, userId)))
    .get();
  if (!sub) throw new OccurrenceError("Subscription not found", "not_found", 404);
  if (sub.status !== "active") {
    throw new OccurrenceError("Subscription is not active", "subscription_not_active", 409);
  }
  if (!sub.nextDate || sub.nextDate !== occurrenceDate) {
    throw new OccurrenceError("That occurrence is not due", "occurrence_not_due", 409);
  }
  return sub;
}

export async function consumeOccurrence(userId: string, sub: SubscriptionRow): Promise<AdvancedSubscription> {
  const adv = advanceOneOccurrence({
    nextDate: sub.nextDate as string,
    frequency: sub.frequency,
    endDate: sub.endDate,
    remainingCount: sub.remainingCount,
  });
  const status = adv.ended ? "ended" : "active";
  const updated = await db
    .update(schema.subscriptions)
    .set({ nextDate: adv.nextDate, remainingCount: adv.remainingCount, status })
    .where(
      and(
        eq(schema.subscriptions.id, sub.id),
        eq(schema.subscriptions.userId, userId),
        eq(schema.subscriptions.nextDate, sub.nextDate as string),
        eq(schema.subscriptions.status, "active"),
      ),
    )
    .returning({ id: schema.subscriptions.id })
    .get();
  if (!updated) throw new OccurrenceError("That occurrence is not due", "occurrence_not_due", 409);
  return { id: sub.id, nextDate: adv.nextDate, remainingCount: adv.remainingCount, status };
}

/** Translate the idempotency index violation into the API's 409. */
export function mapPostError(error: unknown): OccurrenceError | null {
  if (error instanceof OccurrenceError) return error;
  if (isPgErrorCode(error, "23505") && pgErrorConstraint(error) === OCCURRENCE_UNIQUE_INDEX) {
    return new OccurrenceError("That occurrence has already been posted", "already_posted", 409);
  }
  return null;
}
