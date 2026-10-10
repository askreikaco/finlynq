import { NextRequest, NextResponse } from "next/server";
import { createTransaction } from "@/lib/queries";
import { requireEncryption } from "@/lib/auth/require-encryption";
import { encryptTxWrite } from "@/lib/crypto/encrypted-columns";
import { invalidateUser as invalidateUserTxCache } from "@/lib/mcp/user-tx-cache";
import { isPgErrorCode } from "@/lib/db-utils";
import { InvestmentHoldingRequiredError } from "@/lib/investment-account";
import { validateSignVsCategoryById } from "@/lib/transactions/sign-category-invariant";
import { resolveTxAmounts } from "@/lib/transactions/resolve-amounts";
import {
  InstallmentPlanError,
  MAX_INSTALLMENTS,
  MIN_INSTALLMENTS,
  planInstallments,
} from "@/lib/transactions/installment-plan";
import { fromMinor } from "@/lib/transactions/split-math";
import { markCashSnapshotsDirty } from "@/lib/portfolio/snapshots/cash-dirty";
import { verifyOwnership, OwnershipError } from "@/lib/verify-ownership";
import { validateBody, safeErrorMessage, logApiError } from "@/lib/validate";
import { isValidIsoDate } from "@/lib/subscriptions/schedule";
import { randomUUID } from "crypto";
import { z } from "zod";

/**
 * POST /api/transactions/installments
 *
 * Books an instalment plan as N ordinary transactions in ONE database
 * transaction (all or none). The server mints `installment_group_id` (uuid) and
 * `installment_seq` 1..N; a client-supplied value for either, or for
 * `subscriptionId`, is rejected. Each row's note gets a ` seq/count` suffix.
 *
 * Amount semantics match POST /api/transactions: `enteredAmount` is SIGNED
 * (negative = expense) in `enteredCurrency`; the sign is applied to every
 * payment. `mode: "split"` divides `enteredAmount` as a TOTAL over `count`
 * (the last payment absorbs the minor-unit remainder); `mode: "each"` treats it
 * as ONE payment. Each row is converted to the account currency at its own
 * date with the same helper as the single-row POST; future-dated rows are
 * re-rated by the existing settle-future-fx cron.
 */
const SERVER_MANAGED = ["installmentGroupId", "installmentSeq", "subscriptionId", "installment_group_id", "installment_seq", "subscription_id"];

const installmentsSchema = z.object({
  date: z.string().refine((v) => isValidIsoDate(v), { message: "date must be YYYY-MM-DD" }),
  accountId: z.number().int().positive({ message: "Please pick an account" }),
  categoryId: z.number().int().positive({ message: "Please pick a category" }),
  payee: z.string().optional(),
  note: z.string().optional(),
  tags: z.string().optional(),
  isBusiness: z.number().optional(),
  enteredCurrency: z.string().min(1, { message: "enteredCurrency is required" }),
  enteredAmount: z.number().refine((n) => Number.isFinite(n) && n !== 0, { message: "enteredAmount must be a non-zero number" }),
  count: z
    .number()
    .int({ message: "count must be an integer" })
    .min(MIN_INSTALLMENTS, { message: `count must be at least ${MIN_INSTALLMENTS}` })
    .max(MAX_INSTALLMENTS, { message: `count must be at most ${MAX_INSTALLMENTS}` }),
  mode: z.enum(["split", "each"], { message: 'mode must be "split" or "each"' }),
});

export async function POST(request: NextRequest) {
  const auth = await requireEncryption(request);
  if (!auth.ok) return auth.response;
  try {
    const body = await request.json();
    if (body && typeof body === "object" && SERVER_MANAGED.some((k) => k in body)) {
      return NextResponse.json(
        { error: "installmentGroupId, installmentSeq and subscriptionId are server-managed", code: "server_managed_field" },
        { status: 400 },
      );
    }
    const parsed = validateBody(body, installmentsSchema);
    if (parsed.error) return parsed.error;
    const d = parsed.data;
    const enteredCurrency = d.enteredCurrency.toUpperCase();

    await verifyOwnership(auth.userId, { accountIds: [d.accountId], categoryIds: [d.categoryId] });

    let plan;
    try {
      plan = planInstallments({
        startDate: d.date,
        count: d.count,
        mode: d.mode,
        amount: d.enteredAmount,
        currency: enteredCurrency,
      });
    } catch (e) {
      if (e instanceof InstallmentPlanError) {
        return NextResponse.json({ error: e.message, code: "invalid_plan" }, { status: 400 });
      }
      throw e;
    }
    const sign = d.enteredAmount < 0 ? -1 : 1;

    // Resolve every row's FX BEFORE the DB transaction (rate lookups can hit the
    // network; nothing may do I/O while a transaction holds a pooled client).
    const rows: Array<{
      date: string;
      seq: number;
      fields: Extract<Awaited<ReturnType<typeof resolveTxAmounts>>, { ok: true }>["fields"];
    }> = [];
    for (const p of plan) {
      const resolved = await resolveTxAmounts(
        {
          accountId: d.accountId,
          date: p.date,
          enteredAmount: sign * fromMinor(p.amountMinor, enteredCurrency),
          enteredCurrency,
        },
        auth.userId,
        false,
      );
      if (!resolved.ok) return resolved.response;
      rows.push({ date: p.date, seq: p.seq, fields: resolved.fields });
    }

    // FINLYNQ-97: advisory sign-vs-category warning, judged on the first row.
    const first = rows[0].fields.amount;
    const signWarn =
      first != null ? await validateSignVsCategoryById(auth.userId, auth.dek, d.categoryId, Number(first)) : null;

    const groupId = randomUUID();
    const baseNote = (d.note ?? "").trim();
    const { withDbTransaction } = await import("@/db");
    const { incrementDataVersion } = await import("@/lib/data-version");
    const created = await withDbTransaction(async () => {
      const out: Array<Awaited<ReturnType<typeof createTransaction>>> = [];
      for (const r of rows) {
        const suffix = `${r.seq}/${d.count}`;
        const encrypted = encryptTxWrite(auth.dek, {
          payee: d.payee ?? "",
          note: baseNote ? `${baseNote} ${suffix}` : suffix,
          tags: d.tags ?? "",
        });
        out.push(
          await createTransaction(
            auth.userId,
            {
              ...encrypted,
              date: r.date,
              accountId: d.accountId,
              categoryId: d.categoryId,
              ...(d.isBusiness != null ? { isBusiness: d.isBusiness } : {}),
              ...r.fields,
              source: "manual",
              installmentGroupId: groupId,
              installmentSeq: r.seq,
            },
            auth.dek,
          ),
        );
      }
      await incrementDataVersion(auth.userId);
      return out;
    });

    invalidateUserTxCache(auth.userId);
    // Snapshot history is stale from the earliest instalment forward (cash rows
    // only: instalments never carry a portfolio holding).
    await markCashSnapshotsDirty(auth.userId, d.accountId, rows[0].date);

    return NextResponse.json(
      {
        installmentGroupId: groupId,
        count: created.length,
        ids: created.map((t) => (t as { id: number }).id),
        ...(signWarn ? { warning: signWarn.message } : {}),
      },
      { status: 201 },
    );
  } catch (error: unknown) {
    if (error instanceof InvestmentHoldingRequiredError) {
      return NextResponse.json(
        { error: error.message, code: error.code, accountId: error.accountId },
        { status: 400 },
      );
    }
    if (error instanceof OwnershipError) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (isPgErrorCode(error, "23503")) {
      return NextResponse.json(
        { error: "Pick a valid account and category — one of them no longer exists.", code: "fk_violation" },
        { status: 400 },
      );
    }
    await logApiError("POST", "/api/transactions/installments", error, auth.userId);
    return NextResponse.json({ error: safeErrorMessage(error, "Failed to create installments") }, { status: 500 });
  }
}
