/**
 * Installment plan math (Repeat + Installment phase 1). Pure: no I/O.
 *
 * Turns "start date + count + amount" into N concrete payments. Money is integer
 * minor units (currencyDecimals: VND/JPY 0, USD 2) so float drift never leaks
 * into the remainder. Amounts are UNSIGNED here - the caller applies the sign
 * (expense negative / income positive), exactly as for a single transaction.
 *
 * Dates are monthly from the start date through the schedule's anchor-indexed
 * `occurrenceAt`, so a plan starting Jan 31 lands on Feb 28/29 and then back on
 * Mar 31 (no drift to the 28th). Interest is ignored by design.
 */

import { occurrenceAt, isValidIsoDate } from "@/lib/subscriptions/schedule";
import { toMinor } from "@/lib/transactions/split-math";

export const MIN_INSTALLMENTS = 2;
export const MAX_INSTALLMENTS = 60;

export type InstallmentMode = "split" | "each";

export interface InstallmentPlanInput {
  /** First payment date, ISO YYYY-MM-DD. */
  startDate: string;
  /** Number of payments, integer 2..60. */
  count: number;
  /** `split`: `amount` is the TOTAL divided over `count`; `each`: `amount` is ONE payment. */
  mode: InstallmentMode;
  /** Major units (e.g. 83.33), unsigned (the sign is ignored; the caller applies it). */
  amount: number;
  currency: string;
}

export interface PlannedInstallment {
  /** ISO date of this payment. */
  date: string;
  /** Unsigned integer minor units. */
  amountMinor: number;
  /** 1..count. */
  seq: number;
}

export class InstallmentPlanError extends Error {}

/** Validate + expand; throws InstallmentPlanError with a user-presentable message. */
export function planInstallments(input: InstallmentPlanInput): PlannedInstallment[] {
  const { startDate, count, mode, amount, currency } = input;
  if (!isValidIsoDate(startDate)) throw new InstallmentPlanError("startDate must be YYYY-MM-DD");
  if (!Number.isInteger(count) || count < MIN_INSTALLMENTS || count > MAX_INSTALLMENTS) {
    throw new InstallmentPlanError(`count must be an integer from ${MIN_INSTALLMENTS} to ${MAX_INSTALLMENTS}`);
  }
  if (mode !== "split" && mode !== "each") throw new InstallmentPlanError('mode must be "split" or "each"');
  if (!Number.isFinite(amount) || amount === 0) throw new InstallmentPlanError("amount must be a non-zero number");

  const minor = toMinor(Math.abs(amount), currency);
  if (mode === "each") {
    if (minor <= 0) throw new InstallmentPlanError("amount is below the smallest unit of the currency");
    return Array.from({ length: count }, (_, i) => ({
      date: occurrenceAt(startDate, "monthly", i),
      amountMinor: minor,
      seq: i + 1,
    }));
  }

  const base = Math.floor(minor / count);
  if (base <= 0) throw new InstallmentPlanError("total is too small to split into that many payments");
  const last = minor - base * (count - 1);
  return Array.from({ length: count }, (_, i) => ({
    date: occurrenceAt(startDate, "monthly", i),
    amountMinor: i === count - 1 ? last : base,
    seq: i + 1,
  }));
}
