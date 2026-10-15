"use client";

/**
 * WithdrawalForm — cash move from a brokerage cash sleeve out to a
 * non-investment account. Phase 2 (2026-05-26). Mirror of DepositForm.
 *
 * POST /api/portfolio/operations/withdrawal. Cross-currency is refused —
 * the cash-sleeve currency must match the dest account currency.
 */

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { todayISO } from "@/lib/utils/date";
import { useEditId } from "@/lib/hooks/useEditId";
import { usePortfolioFormData } from "@/lib/hooks/usePortfolioFormData";
import { useSeedAccountFromParam } from "@/lib/hooks/useSeedAccountFromParam";
import { OpNote, OpPage, safeReturnHref } from "./op-page";
import { Field, FieldGroup } from "@/components/ui/field";
import { NEW_OP_HREF } from "./op-catalog";

export default function WithdrawalForm() {
  const router = useRouter();
  const { editId, isEdit } = useEditId();
  const searchParams = useSearchParams();
  const returnHref = safeReturnHref(searchParams.get("returnTo"));

  const { accounts, holdings, loading, loadError, editData } =
    usePortfolioFormData({ editId, opType: "withdrawal" });

  const [sourceAccountId, setSourceAccountId] = useState<string>("");
  const [sourceCashSleeveHoldingId, setSourceCashSleeveHoldingId] = useState<string>("");
  const [destAccountId, setDestAccountId] = useState<string>("");
  const [amount, setAmount] = useState<string>("");
  const [date, setDate] = useState<string>(todayISO());
  const [payee, setPayee] = useState<string>("");
  const [note, setNote] = useState<string>("");
  const [tags, setTags] = useState<string>("");

  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (!editData) return;
    if (editData.sourceAccountId != null) setSourceAccountId(String(editData.sourceAccountId));
    if (editData.sourceCashSleeveHoldingId != null)
      setSourceCashSleeveHoldingId(String(editData.sourceCashSleeveHoldingId));
    if (editData.destAccountId != null) setDestAccountId(String(editData.destAccountId));
    if (typeof editData.amount === "number") setAmount(String(editData.amount));
    if (editData.date) setDate(editData.date as string);
    setPayee((editData.payee as string) ?? "");
    setNote((editData.note as string) ?? "");
    setTags((editData.tags as string) ?? "");
  }, [editData]);

  const nonInvestmentAccounts = useMemo(
    () => accounts.filter((a) => a.isInvestment !== true),
    [accounts],
  );
  const investmentAccounts = useMemo(
    () => accounts.filter((a) => a.isInvestment === true),
    [accounts],
  );

  const sourceAcct = useMemo(
    () => accounts.find((a) => String(a.id) === sourceAccountId) ?? null,
    [accounts, sourceAccountId],
  );
  const destAcct = useMemo(
    () => accounts.find((a) => String(a.id) === destAccountId) ?? null,
    [accounts, destAccountId],
  );

  // FINLYNQ-227 — pre-select from `?account=<id>`: an investment account
  // launches the withdrawal with itself as the brokerage SOURCE; a normal
  // account launches it as the non-investment DEST (`&accountField=dest`).
  useSeedAccountFromParam({
    isEdit,
    field: "source",
    validIds: useMemo(
      () => investmentAccounts.map((a) => a.id),
      [investmentAccounts],
    ),
    setValue: setSourceAccountId,
  });
  useSeedAccountFromParam({
    isEdit,
    field: "dest",
    validIds: useMemo(
      () => nonInvestmentAccounts.map((a) => a.id),
      [nonInvestmentAccounts],
    ),
    setValue: setDestAccountId,
  });

  // Cash sleeves on the source (brokerage) account in the dest account's
  // currency.
  const eligibleSleeves = useMemo(() => {
    if (!sourceAcct || !destAcct) return [];
    return holdings.filter(
      (h) =>
        h.accountId === sourceAcct.id &&
        !!h.isCash &&
        h.currency === destAcct.currency,
    );
  }, [holdings, sourceAcct, destAcct]);

  useEffect(() => {
    if (eligibleSleeves.length === 0) {
      setSourceCashSleeveHoldingId("");
      return;
    }
    setSourceCashSleeveHoldingId((prev) => {
      const stillValid = eligibleSleeves.some((s) => String(s.id) === prev);
      if (stillValid) return prev;
      return String(eligibleSleeves[0].id);
    });
  }, [eligibleSleeves]);

  // value→label maps so base-ui Select triggers show names, not ids (FINLYNQ-197).
  const sourceAccountLabelById = useMemo(
    () =>
      Object.fromEntries(
        investmentAccounts.map((a) => [
          String(a.id),
          `${a.name ?? `#${a.id}`} (${a.currency})`,
        ]),
      ),
    [investmentAccounts],
  );
  const destAccountLabelById = useMemo(
    () =>
      Object.fromEntries(
        nonInvestmentAccounts.map((a) => [
          String(a.id),
          `${a.name ?? `#${a.id}`} (${a.currency})`,
        ]),
      ),
    [nonInvestmentAccounts],
  );
  const sleeveLabelById = useMemo(
    () =>
      Object.fromEntries(
        eligibleSleeves.map((s) => [
          String(s.id),
          s.name ?? `Cash ${s.currency}`,
        ]),
      ),
    [eligibleSleeves],
  );

  const currencyMismatch = useMemo(() => {
    if (!sourceAcct || !destAcct) return false;
    return eligibleSleeves.length === 0;
  }, [sourceAcct, destAcct, eligibleSleeves]);

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!sourceAccountId) e.sourceAccountId = "Pick a brokerage";
    if (!destAccountId) e.destAccountId = "Pick a destination account";
    if (sourceAccountId && destAccountId && sourceAccountId === destAccountId) {
      e.destAccountId = "Source and destination must differ";
    }
    if (!sourceCashSleeveHoldingId && !currencyMismatch)
      e.sourceCashSleeveHoldingId = "Pick a cash sleeve";
    const amt = parseFloat(amount);
    if (!amount || Number.isNaN(amt) || amt <= 0) e.amount = "Amount must be > 0";
    if (!date) e.date = "Pick a date";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    if (!validate()) return;
    setSubmitting(true);
    try {
      const body: Record<string, unknown> = {
        sourceAccountId: Number(sourceAccountId),
        sourceCashSleeveHoldingId: Number(sourceCashSleeveHoldingId),
        destAccountId: Number(destAccountId),
        amount: parseFloat(amount),
        date,
      };
      if (payee.trim()) body.payee = payee.trim();
      if (note.trim()) body.note = note.trim();
      if (tags.trim()) body.tags = tags.trim();
      if (isEdit) body.editId = editId;
      const res = await fetch("/api/portfolio/operations/withdrawal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data: { error?: string; code?: string } = await res
          .json()
          .catch(() => ({}));
        setSubmitError(data.error ?? `Save failed (${res.status})`);
        return;
      }
      router.push(returnHref);
    } catch (err: unknown) {
      setSubmitError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <OpPage title={isEdit ? "Edit Withdrawal" : "Brokerage withdrawal"}>
        <FieldGroup>
          <OpNote>Loading…</OpNote>
        </FieldGroup>
      </OpPage>
    );
  }
  if (loadError) {
    return (
      <OpPage title={isEdit ? "Edit Withdrawal" : "Brokerage withdrawal"}>
        <FieldGroup>
          <OpNote tone="destructive">{loadError}</OpNote>
        </FieldGroup>
      </OpPage>
    );
  }
  if (investmentAccounts.length === 0 || nonInvestmentAccounts.length === 0) {
    return (
      <OpPage title="Brokerage withdrawal">
        <FieldGroup>
          <OpNote>
            Withdrawals move cash from a brokerage cash sleeve to a non-investment account. You
            need at least one of each.
          </OpNote>
          <Link href="/accounts" className="block px-4 py-3 text-sm text-primary">
            Go to Accounts →
          </Link>
        </FieldGroup>
      </OpPage>
    );
  }

  return (
    <OpPage
      title={isEdit ? "Edit Withdrawal" : "Brokerage withdrawal"}
      saveLabel={isEdit ? "Save" : "Record"}
      saving={submitting}
      saveDisabled={submitting || currencyMismatch}
      onSubmit={handleSubmit}
    >
      <FieldGroup label="Accounts">
        <Field
          label="From"
          error={errors.sourceAccountId}
          control="select"
          value={sourceAccountId}
          onValueChange={(v) => setSourceAccountId(v ?? "")}
          placeholder="Pick an investment account"
          options={investmentAccounts.map((a) => ({ value: String(a.id), label: <>{a.name ?? `#${a.id}`} ({a.currency})</> }))}
        />
        <Field
          label="To"
          error={errors.destAccountId}
          control="select"
          value={destAccountId}
          onValueChange={(v) => setDestAccountId(v ?? "")}
          placeholder="Pick a destination account"
          options={nonInvestmentAccounts.map((a) => ({ value: String(a.id), label: <>{a.name ?? `#${a.id}`} ({a.currency})</> }))}
        />
        {eligibleSleeves.length > 1 && (
          <Field
            label="Cash sleeve"
            control="select"
            value={sourceCashSleeveHoldingId}
            onValueChange={(v) => setSourceCashSleeveHoldingId(v ?? "")}
            options={eligibleSleeves.map((s) => ({ value: String(s.id), label: s.name ?? `Cash ${s.currency}` }))}
          />
        )}
      </FieldGroup>

      {sourceAcct && destAcct && currencyMismatch && (
        <FieldGroup>
          <OpNote tone="warning">
            No {destAcct.currency} cash sleeve in this brokerage. Either create a{" "}
            {destAcct.currency} sleeve, or{" "}
            <Link href={`${NEW_OP_HREF}/fx-conversion`} className="underline">
              FX-convert
            </Link>{" "}
            inside the brokerage first.
          </OpNote>
        </FieldGroup>
      )}

      <FieldGroup label="Amount">
        <Field
          label={destAcct ? `Amount (${destAcct.currency})` : "Amount"}
          error={errors.amount}
          control="amount"
          step="any"
          inputMode="decimal"
          value={amount}
          onValueChange={(nv) => setAmount(nv)}
          placeholder="100.00"
        />
        <Field
          label="Date"
          error={errors.date}
          control="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </FieldGroup>

      <FieldGroup label="Details">
        <Field label="Payee" value={payee} onChange={(e) => setPayee(e.target.value)} placeholder="Optional" />
        <Field label="Note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional" />
        <Field
          label="Tags"
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          placeholder="tag1, tag2 (optional)"
        />
      </FieldGroup>

      {submitError && (
        <FieldGroup>
          <OpNote tone="destructive">{submitError}</OpNote>
        </FieldGroup>
      )}
    </OpPage>
  );
}
