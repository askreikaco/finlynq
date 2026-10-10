/**
 * "Repeat" on the entry screen = create (or link) a Subscription schedule next
 * to the booked row. Nothing is posted by a server job (the payee/note are
 * encrypted with a per-user DEK the cron does not have); the subscription only
 * records the cadence, and the user taps "Post now" when an occurrence is due.
 *
 * Runs inside the caller's `withDbTransaction`, so the subscription and the
 * booked row commit or roll back together.
 */

import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { buildNameFields, nameLookup } from "@/lib/crypto/encrypted-columns";
import {
  SUBSCRIPTION_FREQUENCIES,
  type SubscriptionFrequency,
  firstOccurrenceAfter,
  isValidIsoDate,
  normalizeFrequency,
} from "@/lib/subscriptions/schedule";

export const MAX_REPEAT_COUNT = 1000;

export const repeatSchema = z.object({
  frequency: z
    .string()
    .refine((v) => normalizeFrequency(v) !== null, {
      message: `repeat.frequency must be one of: ${SUBSCRIPTION_FREQUENCIES.join(", ")}`,
    })
    .transform((v) => normalizeFrequency(v) as SubscriptionFrequency),
  end: z
    .discriminatedUnion("type", [
      z.object({ type: z.literal("forever") }),
      z.object({
        type: z.literal("until"),
        date: z.string().refine((v) => isValidIsoDate(v), { message: "repeat.end.date must be YYYY-MM-DD" }),
      }),
      z.object({
        type: z.literal("count"),
        // TOTAL number of postings including the one being booked now.
        count: z
          .number()
          .int({ message: "repeat.end.count must be an integer" })
          .min(2, { message: "repeat.end.count must be at least 2" })
          .max(MAX_REPEAT_COUNT, { message: `repeat.end.count must be at most ${MAX_REPEAT_COUNT}` }),
      }),
    ])
    .optional(),
});

export type RepeatInput = z.infer<typeof repeatSchema>;

export class RepeatError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status: 400 | 409,
  ) {
    super(message);
  }
}

export interface RepeatBooking {
  /** Booked date (ISO). */
  date: string;
  payee: string | undefined;
  /** Account-currency amount, signed. */
  amount: number;
  currency: string;
  accountId: number;
  categoryId: number | null;
}

/** Validate the repeat against the booking WITHOUT touching the DB. */
export function planRepeat(repeat: RepeatInput, booking: RepeatBooking) {
  const payee = booking.payee?.trim();
  if (!payee) {
    throw new RepeatError("A payee is required to repeat a transaction", "repeat_requires_payee", 400);
  }
  const nextDate = firstOccurrenceAfter(booking.date, repeat.frequency);
  if (!nextDate) throw new RepeatError("date must be YYYY-MM-DD", "invalid_date", 400);
  const end = repeat.end ?? { type: "forever" as const };
  let endDate: string | null = null;
  let remainingCount: number | null = null;
  if (end.type === "until") {
    if (end.date < nextDate) {
      throw new RepeatError(
        "repeat.end.date is before the first repeat date",
        "repeat_end_before_first",
        400,
      );
    }
    endDate = end.date;
  } else if (end.type === "count") {
    // `count` is the total including the booked row; the subscription tracks
    // what is still to come, counting next_date.
    remainingCount = end.count - 1;
  }
  return { payee, nextDate, endDate, remainingCount };
}

/**
 * Create or link the subscription for a booked row. Returns its id. A
 * subscription with the same payee lookup that is active and matches amount +
 * frequency + account is LINKED (its own schedule is left alone); a same-named
 * subscription that differs is a 409 (name_lookup is unique per user).
 */
export async function createOrLinkRepeatSubscription(
  userId: string,
  dek: Buffer,
  repeat: RepeatInput,
  booking: RepeatBooking,
): Promise<{ id: number; created: boolean }> {
  const plan = planRepeat(repeat, booking);
  const lookup = nameLookup(dek, plan.payee);
  const existing = await db
    .select()
    .from(schema.subscriptions)
    .where(and(eq(schema.subscriptions.userId, userId), eq(schema.subscriptions.nameLookup, lookup)))
    .get();
  const amount = Math.abs(booking.amount);
  if (existing) {
    const matches =
      existing.status === "active" &&
      normalizeFrequency(existing.frequency) === repeat.frequency &&
      existing.accountId === booking.accountId &&
      Math.abs(Math.abs(existing.amount) - amount) < 0.005;
    if (matches) return { id: existing.id, created: false };
    throw new RepeatError(
      "A different subscription with this payee name already exists. Edit or rename it first.",
      "repeat_subscription_name_conflict",
      409,
    );
  }
  const sub = await db
    .insert(schema.subscriptions)
    .values({
      userId,
      amount,
      currency: booking.currency,
      frequency: repeat.frequency,
      categoryId: booking.categoryId,
      accountId: booking.accountId,
      nextDate: plan.nextDate,
      status: "active",
      endDate: plan.endDate,
      remainingCount: plan.remainingCount,
      ...buildNameFields(dek, { name: plan.payee }),
    })
    .returning({ id: schema.subscriptions.id })
    .get();
  return { id: sub.id, created: true };
}
