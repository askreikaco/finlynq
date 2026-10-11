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
  isValidIntervalDays,
  isValidIsoDate,
  MAX_INTERVAL_DAYS,
  MIN_INTERVAL_DAYS,
  normalizeFrequency,
  scheduleFrequency,
} from "@/lib/subscriptions/schedule";

export const MAX_REPEAT_COUNT = 1000;

export const repeatSchema = z.object({
  frequency: z
    .string()
    .refine((v) => normalizeFrequency(v) !== null, {
      message: `repeat.frequency must be one of: ${SUBSCRIPTION_FREQUENCIES.join(", ")}`,
    })
    .transform((v) => normalizeFrequency(v) as SubscriptionFrequency),
  /** Days between repeats; required for (and only kept with) frequency "every_n_days". */
  intervalDays: z
    .number()
    .int({ message: "repeat.intervalDays must be an integer" })
    .min(MIN_INTERVAL_DAYS, { message: `repeat.intervalDays must be ${MIN_INTERVAL_DAYS}-${MAX_INTERVAL_DAYS}` })
    .max(MAX_INTERVAL_DAYS, { message: `repeat.intervalDays must be ${MIN_INTERVAL_DAYS}-${MAX_INTERVAL_DAYS}` })
    .nullable()
    .optional(),
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
}).refine((v) => v.frequency !== "every_n_days" || isValidIntervalDays(v.intervalDays), {
  message: "repeat.intervalDays is required when frequency is every_n_days",
  path: ["intervalDays"],
});

export type RepeatInput = z.infer<typeof repeatSchema>;

/** The interval to store for a repeat: the custom step, or null for every other cadence. */
export function repeatIntervalDays(repeat: RepeatInput): number | null {
  return repeat.frequency === "every_n_days" ? (repeat.intervalDays ?? null) : null;
}

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
  const nextDate = firstOccurrenceAfter(booking.date, scheduleFrequency(repeat.frequency, repeat.intervalDays));
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
  // The series anchor is the BOOKED date (occurrence index 0), not next_date
  // (index 1): booked Jan 31 monthly -> next Feb 28, anchor Jan 31, so the
  // following one is Mar 31.
  return { payee, nextDate, anchorDate: booking.date, endDate, remainingCount };
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
      (existing.intervalDays ?? null) === repeatIntervalDays(repeat) &&
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
      intervalDays: repeatIntervalDays(repeat),
      categoryId: booking.categoryId,
      accountId: booking.accountId,
      nextDate: plan.nextDate,
      anchorDate: plan.anchorDate,
      status: "active",
      endDate: plan.endDate,
      remainingCount: plan.remainingCount,
      ...buildNameFields(dek, { name: plan.payee }),
    })
    .returning({ id: schema.subscriptions.id })
    .get();
  return { id: sub.id, created: true };
}
