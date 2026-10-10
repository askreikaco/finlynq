/**
 * Keep `subscriptions.next_date` current.
 *
 * Nothing ever advanced a subscription's stored next-payment date, so after one
 * billing cycle it sat in the past forever. Every reader that windows on it
 * then went quiet: the Action Center's large-bill / renewal cards and the
 * weekly recap's "upcoming bills" all query `next_date BETWEEN today AND
 * today+7`, so a stale row could never match again, and the page showed a
 * months-old "next" date.
 *
 * This self-heal rolls each ACTIVE row whose date has passed forward to its
 * next occurrence on/after today (schedule math in ./schedule.ts). Paused,
 * cancelled and ended rows are left alone — their date is history, not a forecast.
 *
 * Runs on the read paths that care (subscriptions GET, the Action Center, the
 * weekly recap, MCP list) and is idempotent: the UPDATE is conditional on the
 * date it read, so two concurrent callers can't double-advance a row.
 *
 * Roll-forward indexes from the row's `anchor_date` (NULL -> next_date), so a
 * month-end bill that was stuck on Feb 28 lands on Mar 31, not Mar 28.
 *
 * Takes an `{execute}` Executor so the app's Drizzle proxy and the MCP
 * `DbLike` share one implementation.
 */

import { sql } from "drizzle-orm";
import type { Executor } from "@/lib/delete-blockers";
import { normalizeDbRows } from "@/lib/db-utils";
import { todayISO } from "@/lib/utils/date";
import { isExhausted, rollForwardWithEnd } from "./occurrences";

/**
 * Two kinds of ACTIVE row (Repeat + Installment phase 2a):
 *  - POSTABLE (at least one transaction links to it via subscription_id): the
 *    user posts each occurrence with "Post now", so next_date is NEVER rolled
 *    past an unposted due occurrence (that would hide it). Only the end is
 *    enforced (next_date already after end_date / count exhausted -> 'ended').
 *  - everything else keeps the roll-forward to the next occurrence on/after
 *    today, now honouring end_date / remaining_count (-> 'ended').
 * Returns the number of rows changed.
 */
export async function advanceStaleSubscriptionDates(
  db: Executor,
  userId: string,
  today: string = todayISO(),
): Promise<number> {
  const rows = normalizeDbRows<{
    id: number;
    next_date: string;
    frequency: string | null;
    end_date: string | null;
    remaining_count: number | null;
    anchor_date: string | null;
    postable: boolean | number | string;
  }>(
    await db.execute(sql`
      SELECT s.id, s.next_date, s.frequency, s.end_date, s.remaining_count, s.anchor_date,
             EXISTS (SELECT 1 FROM transactions t WHERE t.subscription_id = s.id AND t.user_id = s.user_id) AS postable
      FROM subscriptions s
      WHERE s.user_id = ${userId}
        AND s.status = 'active'
        AND s.next_date IS NOT NULL
        AND (
          s.next_date < ${today}
          OR (s.end_date IS NOT NULL AND s.next_date > s.end_date)
          OR (s.remaining_count IS NOT NULL AND s.remaining_count <= 0)
        )
    `),
  );

  let advanced = 0;
  for (const r of rows) {
    const state = {
      nextDate: r.next_date,
      frequency: r.frequency,
      endDate: r.end_date,
      remainingCount: r.remaining_count,
      anchorDate: r.anchor_date,
    };
    const postable = r.postable === true || r.postable === 1 || r.postable === "t" || r.postable === "true";
    let result;
    if (postable) {
      result = isExhausted(state)
        ? { nextDate: r.next_date, remainingCount: r.remaining_count, ended: true }
        : null;
    } else {
      result = rollForwardWithEnd(state, today);
    }
    if (!result) continue; // malformed date or nothing to do — leave it for the user to fix
    if (result.ended) {
      await db.execute(sql`
        UPDATE subscriptions
        SET status = 'ended', remaining_count = ${result.remainingCount}
        WHERE id = ${r.id} AND user_id = ${userId} AND next_date = ${r.next_date} AND status = 'active'
      `);
    } else {
      await db.execute(sql`
        UPDATE subscriptions
        SET next_date = ${result.nextDate}, remaining_count = ${result.remainingCount}
        WHERE id = ${r.id} AND user_id = ${userId} AND next_date = ${r.next_date} AND status = 'active'
      `);
    }
    advanced++;
  }
  return advanced;
}

/** Best-effort wrapper for read paths: a failed self-heal must never fail the read. */
export async function advanceStaleSubscriptionDatesSafe(db: Executor, userId: string): Promise<void> {
  try {
    await advanceStaleSubscriptionDates(db, userId);
  } catch {
    // Swallowed on purpose — the caller still serves the stored dates.
  }
}
