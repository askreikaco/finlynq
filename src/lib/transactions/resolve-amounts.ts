import { NextResponse } from "next/server";
import { getAccountById } from "@/lib/queries";
import { convertToAccountCurrency } from "@/lib/currency-conversion";
import { todayISO } from "@/lib/utils/date";

/**
 * Resolve the entered/account-currency trilogy on a write payload.
 *
 * Branches:
 *  - enteredAmount + enteredCurrency provided → triangulate to account's
 *    currency, lock the rate. Refuses to write on source='fallback' so we
 *    don't silently store rate=1 for unsupported currencies.
 *  - enteredAmount alone (no enteredCurrency) → assume entered currency
 *    matches the account currency.
 *  - amount + currency provided (legacy callers) → mirror them as the
 *    entered side too with rate=1.
 *  - Neither → caller bug; rejected by Zod refine().
 */
export async function resolveTxAmounts(
  data: {
    accountId?: number;
    currency?: string;
    amount?: number;
    enteredAmount?: number;
    enteredCurrency?: string;
    date?: string;
  },
  userId: string,
  isUpdate: boolean,
  currentTx?: {
    enteredCurrency?: string | null;
    enteredAmount?: number | null;
  }
): Promise<{
  ok: true;
  fields: {
    amount?: number;
    currency?: string;
    enteredAmount?: number;
    enteredCurrency?: string;
    enteredFxRate?: number;
  };
} | { ok: false; response: NextResponse }> {
  // For UPDATEs: only resolve if the user touched amount/entered fields.
  // Allow updates to date/payee/note/etc. without re-running FX.
  const touchedAmounts =
    data.amount !== undefined ||
    data.enteredAmount !== undefined ||
    data.enteredCurrency !== undefined ||
    data.currency !== undefined;
  if (isUpdate && !touchedAmounts) {
    return { ok: true, fields: {} };
  }

  // Need an account to know the settlement currency. For updates without
  // accountId in the payload, look up the existing tx's account.
  const accountId = data.accountId;
  if (accountId == null) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "accountId is required when amount or currency is being changed" },
        { status: 400 }
      ),
    };
  }
  const account = await getAccountById(accountId, userId);
  if (!account) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: `Account ${accountId} not found` },
        { status: 404 }
      ),
    };
  }
  const accountCurrency = account.currency.toUpperCase();
  const date = data.date ?? todayISO();

  // Path 1: caller gave us entered fields — triangulate.
  if (data.enteredAmount != null) {
    const enteredCurrency = (data.enteredCurrency ?? accountCurrency).toUpperCase();
    const conversion = await convertToAccountCurrency({
      enteredAmount: data.enteredAmount,
      enteredCurrency,
      accountCurrency,
      date,
      userId,
    });
    if (conversion.source === "fallback") {
      return {
        ok: false,
        response: NextResponse.json(
          {
            error: `No FX rate available for ${enteredCurrency}. Add a custom rate via Settings → Custom exchange rates first.`,
            code: "fx-currency-needs-override",
            currency: enteredCurrency,
          },
          { status: 409 }
        ),
      };
    }
    return {
      ok: true,
      fields: {
        amount: conversion.amount,
        currency: accountCurrency,
        enteredAmount: data.enteredAmount,
        enteredCurrency,
        enteredFxRate: conversion.enteredFxRate,
      },
    };
  }

  // Path 2: legacy caller — only `amount` (+ maybe `currency`). Treat the
  // recorded amount as both entered and account, with rate=1. If the caller
  // passed a currency that doesn't match the account, that's a cross-
  // currency entry without conversion (same as today's broken behavior); we
  // preserve it for back-compat but it will get flagged by tx_currency_audit.
  //
  // UPDATE (amount-only): when updating an existing cross-currency transaction
  // with only amount (no enteredAmount), keep the existing entered_amount and
  // recompute entered_fx_rate to stay consistent. Same-currency transactions
  // get entered_amount = amount, entered_fx_rate = 1.
  if (data.amount != null) {
    const currency = (data.currency ?? accountCurrency).toUpperCase();

    // For amount-only UPDATEs with cross-currency transactions: preserve entered_amount
    if (isUpdate && currentTx?.enteredCurrency && currentTx.enteredAmount != null) {
      const existingEnteredCurrency = currentTx.enteredCurrency.toUpperCase();
      const existingEnteredAmount = currentTx.enteredAmount;

      if (existingEnteredCurrency !== accountCurrency && existingEnteredAmount !== 0) {
        // Cross-currency case: keep entered_amount, recompute entered_fx_rate
        return {
          ok: true,
          fields: {
            amount: data.amount,
            currency,
            enteredAmount: existingEnteredAmount,
            enteredCurrency: existingEnteredCurrency,
            enteredFxRate: data.amount / existingEnteredAmount,
          },
        };
      }
    }

    // Same-currency case (or not an update): entered = amount with rate 1
    return {
      ok: true,
      fields: {
        amount: data.amount,
        currency,
        enteredAmount: data.amount,
        enteredCurrency: currency,
        enteredFxRate: 1,
      },
    };
  }

  return { ok: true, fields: {} };
}
