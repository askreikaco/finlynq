"use client";

/**
 * DepositForm — cash move from a non-investment account into a brokerage's
 * cash sleeve. Phase 2 (2026-05-26).
 *
 * POST /api/portfolio/operations/deposit. Cross-currency is refused —
 * the source account currency must match the dest cash-sleeve currency.
 */

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { todayISO } from "@/lib/utils/date";
import { useEditId } from "@/lib/hooks/useEditId";
import { usePortfolioFormData } from "@/lib/hooks/usePortfolioFormData";
import { useSeedAccountFromParam } from "@/lib/hooks/useSeedAccountFromParam";
import { AmountInput } from "@/components/amount-input";

import { OpGroup, OpNote, OpPage, OpRow, OP_INPUT, OP_SELECT, safeReturnHref } from "./op-page";
import { NEW_OP_HREF } from "./op-catalog";

export default function DepositForm() {
  const router = useRouter();
  const { editId, isEdit } = useEditId();
  const searchParams = useSearchParams();
  const returnHref = safeReturnHref(searchParams.get("returnTo"));

  const { accounts, holdings, loading, loadError, editData } =
    usePortfolioFormData({ editId, opType: "deposit" });

  const [sourceAccountId, setSourceAccountId] = useState<string>("");
  const [destAccountId, setDestAccountId] = useState<string>("");
  const [destCashSleeveHoldingId, setDestCashSleeveHoldingId] = useState<string>("");
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
    if (editData.destAccountId != null) setDestAccountId(String(editData.destAccountId));
    if (editData.destCashSleeveHoldingId != null)
      setDestCashSleeveHoldingId(String(editData.destCashSleeveHoldingId));
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

  // FINLYNQ-227 — pre-select from `?account=<id>`: a normal account launches
  // the deposit with itself as the non-investment SOURCE; an investment account
  // launches it as the brokerage DEST (`&accountField=dest`).
  useSeedAccountFromParam({
    isEdit,
    field: "source",
    validIds: useMemo(
      () => nonInvestmentAccounts.map((a) => a.id),
      [nonInvestmentAccounts],
    ),
    setValue: setSourceAccountId,
  });
  useSeedAccountFromParam({
    isEdit,
    field: "dest",
    validIds: useMemo(
      () => investmentAccounts.map((a) => a.id),
      [investmentAccounts],
    ),
    setValue: setDestAccountId,
  });

  // Cash sleeves on the dest account that match the source account's currency.
  const eligibleSleeves = useMemo(() => {
    if (!destAcct || !sourceAcct) return [];
    return holdings.filter(
      (h) =>
        h.accountId === destAcct.id &&
        !!h.isCash &&
        h.currency === sourceAcct.currency,
    );
  }, [holdings, destAcct, sourceAcct]);

  // Auto-pick the matching sleeve when the pair changes.
  useEffect(() => {
    if (eligibleSleeves.length === 0) {
      setDestCashSleeveHoldingId("");
      return;
    }
    setDestCashSleeveHoldingId((prev) => {
      const stillValid = eligibleSleeves.some((s) => String(s.id) === prev);
      if (stillValid) return prev;
      return String(eligibleSleeves[0].id);
    });
  }, [eligibleSleeves]);

  // value→label maps so base-ui Select triggers show names, not ids (FINLYNQ-197).
  const sourceAccountLabelById = useMemo(
    () =>
      Object.fromEntries(
        nonInvestmentAccounts.map((a) => [
          String(a.id),
          `${a.name ?? `#${a.id}`} (${a.currency})`,
        ]),
      ),
    [nonInvestmentAccounts],
  );
  const destAccountLabelById = useMemo(
    () =>
      Object.fromEntries(
        investmentAccounts.map((a) => [
          String(a.id),
          `${a.name ?? `#${a.id}`} (${a.currency})`,
        ]),
      ),
    [investmentAccounts],
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
    // The brokerage may have multiple sleeves; the form refuses only when
    // there's NO sleeve in the source account's currency.
    return eligibleSleeves.length === 0;
  }, [sourceAcct, destAcct, eligibleSleeves]);

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!sourceAccountId) e.sourceAccountId = "Pick a source (non-investment) account";
    if (!destAccountId) e.destAccountId = "Pick a brokerage account";
    if (sourceAccountId && destAccountId && sourceAccountId === destAccountId) {
      e.destAccountId = "Source and destination must differ";
    }
    if (!destCashSleeveHoldingId && !currencyMismatch)
      e.destCashSleeveHoldingId = "Pick a cash sleeve";
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
        destAccountId: Number(destAccountId),
        destCashSleeveHoldingId: Number(destCashSleeveHoldingId),
        amount: parseFloat(amount),
        date,
      };
      if (payee.trim()) body.payee = payee.trim();
      if (note.trim()) body.note = note.trim();
      if (tags.trim()) body.tags = tags.trim();
      if (isEdit) body.editId = editId;
      const res = await fetch("/api/portfolio/operations/deposit", {
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
      <OpPage title={isEdit ? "Edit Deposit" : "Brokerage deposit"}>
        <OpGroup>
          <OpNote>Loading…</OpNote>
        </OpGroup>
      </OpPage>
    );
  }
  if (loadError) {
    return (
      <OpPage title={isEdit ? "Edit Deposit" : "Brokerage deposit"}>
        <OpGroup>
          <OpNote tone="destructive">{loadError}</OpNote>
        </OpGroup>
      </OpPage>
    );
  }
  if (investmentAccounts.length === 0 || nonInvestmentAccounts.length === 0) {
    return (
      <OpPage title="Brokerage deposit">
        <OpGroup>
          <OpNote>
            Deposits move cash from a non-investment account into a brokerage cash sleeve. You
            need at least one of each.
          </OpNote>
          <Link href="/accounts" className="block px-4 py-3 text-sm text-primary">
            Go to Accounts →
          </Link>
        </OpGroup>
      </OpPage>
    );
  }

  return (
    <OpPage
      title={isEdit ? "Edit Deposit" : "Brokerage deposit"}
      saveLabel={isEdit ? "Save" : "Record"}
      saving={submitting}
      saveDisabled={submitting || currencyMismatch}
      onSubmit={handleSubmit}
    >
      <OpGroup label="Accounts">
        <OpRow label="From" error={errors.sourceAccountId}>
          <Select
            items={sourceAccountLabelById}
            value={sourceAccountId}
            onValueChange={(v) => setSourceAccountId(v ?? "")}
          >
            <SelectTrigger className={OP_SELECT}>
              <SelectValue placeholder="Pick a source account" />
            </SelectTrigger>
            <SelectContent alignItemWithTrigger={false} side="bottom">
              {nonInvestmentAccounts.map((a) => (
                <SelectItem key={a.id} value={String(a.id)}>
                  {a.name ?? `#${a.id}`} ({a.currency})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </OpRow>
        <OpRow label="To" error={errors.destAccountId}>
          <Select
            items={destAccountLabelById}
            value={destAccountId}
            onValueChange={(v) => setDestAccountId(v ?? "")}
          >
            <SelectTrigger className={OP_SELECT}>
              <SelectValue placeholder="Pick an investment account" />
            </SelectTrigger>
            <SelectContent alignItemWithTrigger={false} side="bottom">
              {investmentAccounts.map((a) => (
                <SelectItem key={a.id} value={String(a.id)}>
                  {a.name ?? `#${a.id}`} ({a.currency})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </OpRow>
        {eligibleSleeves.length > 1 && (
          <OpRow label="Cash sleeve">
            <Select
              items={sleeveLabelById}
              value={destCashSleeveHoldingId}
              onValueChange={(v) => setDestCashSleeveHoldingId(v ?? "")}
            >
              <SelectTrigger className={OP_SELECT}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent alignItemWithTrigger={false} side="bottom">
                {eligibleSleeves.map((s) => (
                  <SelectItem key={s.id} value={String(s.id)}>
                    {s.name ?? `Cash ${s.currency}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </OpRow>
        )}
      </OpGroup>

      {sourceAcct && destAcct && currencyMismatch && (
        <OpGroup>
          <OpNote tone="warning">
            No {sourceAcct.currency} cash sleeve in this brokerage. Either create a{" "}
            {sourceAcct.currency} sleeve on the brokerage via its Cash sleeves panel, or{" "}
            <Link href={`${NEW_OP_HREF}/fx-conversion`} className="underline">
              FX-convert
            </Link>{" "}
            to the destination currency first.
          </OpNote>
        </OpGroup>
      )}

      <OpGroup label="Amount">
        <OpRow label={sourceAcct ? `Amount (${sourceAcct.currency})` : "Amount"} error={errors.amount}>
          <AmountInput
            step="any"
            inputMode="decimal"
            value={amount}
            onValueChange={(nv) => setAmount(nv)}
            placeholder="100.00"
            className={OP_INPUT}
          />
        </OpRow>
        <OpRow label="Date" error={errors.date}>
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className={OP_INPUT}
          />
        </OpRow>
      </OpGroup>

      <OpGroup label="Details">
        <OpRow label="Payee">
          <Input
            value={payee}
            onChange={(e) => setPayee(e.target.value)}
            placeholder="Optional"
            className={OP_INPUT}
          />
        </OpRow>
        <OpRow label="Note">
          <Input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Optional"
            className={OP_INPUT}
          />
        </OpRow>
        <OpRow label="Tags">
          <Input
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="tag1, tag2 (optional)"
            className={OP_INPUT}
          />
        </OpRow>
      </OpGroup>

      {submitError && (
        <OpGroup>
          <OpNote tone="destructive">{submitError}</OpNote>
        </OpGroup>
      )}
    </OpPage>
  );
}
