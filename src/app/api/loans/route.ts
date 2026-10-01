import { NextRequest, NextResponse } from "next/server";
import { enqueueFamilySweep } from "@/lib/family/sweep";
import { db, schema } from "@/db";
import { eq, and } from "drizzle-orm";
import {
  buildLoanSchedule,
  calculateExtraPaymentImpact,
  calculateDebtPayoff,
  LoanValidationError,
  PAYMENT_FREQUENCIES,
} from "@/lib/loan-calculator";
import { requireAuth } from "@/lib/auth/require-auth";
import { requireEncryption } from "@/lib/auth/require-encryption";
import { z } from "zod";
import { validateBody, safeErrorMessage, logApiError } from "@/lib/validate";
import { buildNameFields, decryptNamedRows, encryptOptional, decryptOptional } from "@/lib/crypto/encrypted-columns";
import { verifyOwnership, OwnershipError } from "@/lib/verify-ownership";
import { todayISO } from "@/lib/utils/date";
import { getLinkedAccountBalances, summarizeLoan } from "@/lib/loan-summary";
import { getDisplayCurrency, getRateMap, convertWithRateMap } from "@/lib/fx-service";
import { pickRecordCurrency } from "@/lib/fx/record-currency";
// Issue #213 — shared YYYY-MM-DD validator (regex + leap-year/Feb-30 round-trip).
import { ymdDate, parseYmdSafe } from "../../../../mcp-server/lib/date-validators";

const paymentFrequencyEnum = z.enum(PAYMENT_FREQUENCIES);

const createLoanSchema = z.object({
  name: z.string(),
  type: z.string(),
  principal: z.number().positive(),
  annualRate: z.number().nonnegative(),
  // FINLYNQ-136: term OR payment — payment-driven loans solve for the term.
  termMonths: z.number().int().positive().nullable().optional(),
  startDate: ymdDate,
  currency: z.string().regex(/^[A-Z]{3,4}$/, "ISO currency code").optional(),
  accountId: z.number().nullable().optional(),
  paymentAmount: z.number().positive().nullable().optional(),
  paymentFrequency: paymentFrequencyEnum.optional(),
  extraPayment: z.number().nonnegative().optional(),
  residualValue: z.number().nonnegative().nullable().optional(),
  note: z.string().optional(),
}).refine((d) => d.termMonths != null || d.paymentAmount != null, {
  message: "Either termMonths or paymentAmount is required",
});

const updateLoanSchema = z.object({
  id: z.number(),
  name: z.string().optional(),
  type: z.string().optional(),
  principal: z.number().positive().optional(),
  annualRate: z.number().nonnegative().optional(),
  termMonths: z.number().int().positive().nullable().optional(),
  startDate: ymdDate.optional(),
  currency: z.string().regex(/^[A-Z]{3,4}$/, "ISO currency code").optional(),
  accountId: z.number().optional().nullable(),
  paymentAmount: z.number().positive().nullable().optional(),
  paymentFrequency: paymentFrequencyEnum.optional(),
  extraPayment: z.number().nonnegative().optional(),
  residualValue: z.number().nonnegative().nullable().optional(),
  note: z.string().optional(),
});

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request); if (!auth.authenticated) return auth.response;
  const { userId } = auth.context;
  // Stream D Phase 4 — plaintext name/accountName dropped.
  const rawLoans = await db
    .select({
      id: schema.loans.id,
      nameCt: schema.loans.nameCt,
      type: schema.loans.type,
      accountId: schema.loans.accountId,
      accountNameCt: schema.accounts.nameCt,
      currency: schema.loans.currency,
      principal: schema.loans.principal,
      annualRate: schema.loans.annualRate,
      termMonths: schema.loans.termMonths,
      startDate: schema.loans.startDate,
      paymentAmount: schema.loans.paymentAmount,
      paymentFrequency: schema.loans.paymentFrequency,
      extraPayment: schema.loans.extraPayment,
      residualValue: schema.loans.residualValue,
      note: schema.loans.note,
    })
    .from(schema.loans)
    .leftJoin(schema.accounts, eq(schema.loans.accountId, schema.accounts.id))
    .where(eq(schema.loans.userId, userId))
    .all();
  const loans = decryptNamedRows(rawLoans, auth.context.dek, {
    nameCt: "name",
    accountNameCt: "accountName",
  }).map((l) => ({
    ...l,
    // Free-text note is user-DEK encrypted at rest (2026-06-01).
    note: decryptOptional(auth.context.dek, l.note),
  }));

  // FINLYNQ-136: account-linked balances — one query for all linked accounts.
  const linkedIds = [...new Set(loans.map((l) => l.accountId).filter((x): x is number => x != null))];
  const acctBalances = await getLinkedAccountBalances(userId, linkedIds);
  const today = todayISO();

  // FINLYNQ-123 dual basis: every amount below stays in the LOAN's own
  // currency (that's what the schedule was computed in), and each row also
  // carries a current-rate conversion into the display currency so the page
  // can total across a mixed-currency book. Summing the native figures under
  // one label — which is what the page used to do — reports an ₽8.1M mortgage
  // as $8.1M.
  const displayCurrency = await getDisplayCurrency(
    userId,
    request.nextUrl.searchParams.get("currency"),
  );
  const rateMap = await getRateMap(displayCurrency, userId);
  const toDisplay = (amount: number | null, from: string | null) =>
    amount == null ? null : convertWithRateMap(amount, from ?? displayCurrency, rateMap);

  // Add amortization summary for each loan
  const withSummary = loans.map((loan) => {
    const integrityRow = (error: string, value: unknown) => ({
      ...loan,
      monthlyPayment: null,
      totalInterest: null,
      payoffDate: null,
      remainingBalance: null,
      principalPaid: null,
      interestPaid: null,
      periodsRemaining: null,
      balanceSource: null,
      displayCurrency,
      remainingBalanceDisplay: null,
      monthlyEquivalentPaymentDisplay: null,
      dataIntegrity: { error, value },
    });
    const r = summarizeLoan(loan, acctBalances, today);
    if ("integrity" in r) return integrityRow(r.integrity.error, r.integrity.value);

    return {
      ...loan,
      monthlyPayment: r.monthlyPayment,
      paymentPerPeriod: r.paymentPerPeriod,
      monthlyEquivalentPayment: r.monthlyEquivalentPayment,
      totalInterest: r.totalInterest,
      payoffDate: r.payoffDate,
      remainingBalance: r.remainingBalance,
      balanceSource: r.balanceSource,
      principalPaid: r.principalPaid,
      interestPaid: r.interestPaid,
      periodsRemaining: r.periodsRemaining,
      // Additive reporting-currency companions — the native fields above are
      // untouched, so nothing that already read this response changes.
      displayCurrency,
      remainingBalanceDisplay: toDisplay(r.remainingBalance, loan.currency),
      monthlyEquivalentPaymentDisplay: toDisplay(
        r.monthlyEquivalentPayment,
        loan.currency,
      ),
    };
  });

  return NextResponse.json(withSummary);
}

export async function POST(request: NextRequest) {
  // requireEncryption, not requireAuth: buildNameFields(null) returns {} and
  // encryptOptional(null, note) stores the note as PLAINTEXT — a DEK-less
  // write persisted a permanently nameless row (review 2026-07-30 #7).
  const auth = await requireEncryption(request); if (!auth.ok) return auth.response;
  const { userId, dek } = auth;
  try {
    const body = await request.json();

    if (body.action === "amortization") {
      // FINLYNQ-136: honors paymentAmount (payment-driven) + residualValue
      // (lease) and returns the per-calendar-month interest accrual.
      const result = buildLoanSchedule({
        principal: body.principal,
        annualRate: body.annualRate,
        termMonths: body.termMonths,
        startDate: body.startDate,
        paymentAmount: body.paymentAmount,
        paymentFrequency: body.paymentFrequency ?? "monthly",
        extraPayment: body.extraPayment ?? 0,
        residualValue: body.residualValue,
      });
      return NextResponse.json(result);
    }

    if (body.action === "what-if") {
      const result = calculateExtraPaymentImpact(
        body.principal, body.annualRate, body.termMonths,
        body.startDate, body.extraAmounts ?? [100, 200, 500, 1000]
      );
      return NextResponse.json(result);
    }

    if (body.action === "debt-payoff") {
      const avalanche = calculateDebtPayoff(body.debts, body.extraBudget ?? 0, "avalanche");
      const snowball = calculateDebtPayoff(body.debts, body.extraBudget ?? 0, "snowball");
      return NextResponse.json({ avalanche, snowball });
    }

    // Create new loan
    const parsed = validateBody(body, createLoanSchema);
    if (parsed.error) return parsed.error;
    const d = parsed.data;
    // Cross-tenant FK guard (H-1) — verify the optional accountId belongs
    // to the caller before INSERT. `null`/undefined skipped by the helper.
    if (d.accountId != null) {
      await verifyOwnership(userId, { accountIds: [d.accountId] });
    }
    // FINLYNQ-136: reject non-amortizing inputs (payment below first period's
    // interest, residual >= principal) at create time with a clear 400.
    buildLoanSchedule({
      principal: d.principal,
      annualRate: d.annualRate,
      termMonths: d.termMonths,
      startDate: d.startDate,
      paymentAmount: d.paymentAmount,
      paymentFrequency: d.paymentFrequency ?? "monthly",
      extraPayment: d.extraPayment ?? 0,
      residualValue: d.residualValue,
    });
    // Currency resolution (feedback #7): explicit > linked account > display.
    // Falling through to the column default is what let MCP-created loans land
    // as CAD; the web form always sends one, but the REST API is public.
    let accountCurrency: string | null = null;
    if (d.accountId != null) {
      const acct = await db
        .select({ currency: schema.accounts.currency })
        .from(schema.accounts)
        .where(and(eq(schema.accounts.id, d.accountId), eq(schema.accounts.userId, userId)))
        .get();
      accountCurrency = acct?.currency ?? null;
    }
    const currency = pickRecordCurrency({
      explicit: d.currency,
      accountCurrency,
      displayCurrency: await getDisplayCurrency(userId),
    });
    const enc = buildNameFields(dek, { name: d.name });
    // Stream D Phase 4 — plaintext name dropped.
    const loan = await db.insert(schema.loans).values({
      userId,
      type: d.type,
      accountId: d.accountId || null,
      currency,
      principal: d.principal,
      annualRate: d.annualRate,
      termMonths: d.termMonths ?? null,
      startDate: d.startDate,
      paymentAmount: d.paymentAmount,
      paymentFrequency: d.paymentFrequency ?? "monthly",
      extraPayment: d.extraPayment ?? 0,
      residualValue: d.residualValue ?? null,
      note: encryptOptional(dek, d.note) ?? "",
      ...enc,
    }).returning().get();

    // Family sidecar label sync: fire-and-forget, never blocks/fails the edit.

    enqueueFamilySweep(userId, dek, { entity: "loans" });

    return NextResponse.json(loan, { status: 201 });
  } catch (error: unknown) {
    if (error instanceof OwnershipError) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (error instanceof LoanValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    await logApiError("POST", "/api/loans", error, userId);
    return NextResponse.json({ error: safeErrorMessage(error, "Failed") }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  // requireEncryption — with a null DEK the rename silently no-ops and the note
  // lands in plaintext (review 2026-07-30 #7).
  const auth = await requireEncryption(request); if (!auth.ok) return auth.response;
  const { userId, dek } = auth;
  try {
    const body = await request.json();
    const parsed = validateBody(body, updateLoanSchema);
    if (parsed.error) return parsed.error;
    const { id, name, ...data } = parsed.data;
    // Cross-tenant FK guard (H-1) — `accountId` may be re-pointed to another
    // user's account on update. `null` is an explicit unlink; skip it.
    if (data.accountId != null && data.accountId > 0) {
      await verifyOwnership(userId, { accountIds: [data.accountId] });
    }
    // FINLYNQ-136: validate the MERGED row still amortizes (e.g. lowering the
    // payment below the period interest, or raising residual past principal).
    const existing = await db
      .select()
      .from(schema.loans)
      .where(and(eq(schema.loans.id, id), eq(schema.loans.userId, userId)))
      .all();
    if (!existing.length) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const merged = { ...existing[0], ...data };
    if (parseYmdSafe(merged.startDate) !== null) {
      buildLoanSchedule({
        principal: merged.principal,
        annualRate: merged.annualRate,
        termMonths: merged.termMonths,
        startDate: merged.startDate,
        paymentAmount: merged.paymentAmount,
        paymentFrequency: merged.paymentFrequency,
        extraPayment: merged.extraPayment ?? 0,
        residualValue: merged.residualValue,
      });
    }
    const toEncrypt: Record<string, string | null | undefined> = {};
    if (name !== undefined) toEncrypt.name = name;
    const enc = buildNameFields(dek, toEncrypt);
    if (data.currency) data.currency = data.currency.toUpperCase();
    const updatePayload: Record<string, unknown> = { ...data, ...enc };
    // Encrypt the free-text note when present (2026-06-01 plaintext-gap closure).
    if (data.note !== undefined) {
      updatePayload.note = encryptOptional(dek, data.note);
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const loan = await db.update(schema.loans).set(updatePayload as any).where(and(eq(schema.loans.id, id), eq(schema.loans.userId, userId))).returning().get();
    // Family sidecar label sync: fire-and-forget, never blocks/fails the edit.
    enqueueFamilySweep(userId, dek, { entity: "loans" });
    return NextResponse.json(loan);
  } catch (error: unknown) {
    if (error instanceof OwnershipError) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (error instanceof LoanValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    await logApiError("PUT", "/api/loans", error, userId);
    return NextResponse.json({ error: safeErrorMessage(error, "Failed") }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await requireAuth(request); if (!auth.authenticated) return auth.response;
  const id = parseInt(request.nextUrl.searchParams.get("id") ?? "0");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  await db.delete(schema.loans).where(and(eq(schema.loans.id, id), eq(schema.loans.userId, auth.context.userId)));
  return NextResponse.json({ success: true });
}
