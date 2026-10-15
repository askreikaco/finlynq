"use client";

/**
 * FxConversionForm — convert one cash sleeve to another inside a single
 * investment account.
 *
 * POST /api/portfolio/operations/fx-conversion:
 *   pick account → from currency + amount → to currency + amount → optional fee.
 *
 * Source the from/to currency lists from the existing cash sleeves on the
 * selected account (you can't fx-convert to a sleeve you don't have).
 * The inferred rate (toAmount / fromAmount) is shown read-only.
 */

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { todayISO } from "@/lib/utils/date";
import { useEditId } from "@/lib/hooks/useEditId";
import { buildTxDrillUrl } from "@/lib/transactions/drill-url";
import { usePortfolioFormData } from "@/lib/hooks/usePortfolioFormData";
import { useAccountHoldingSelection } from "@/lib/hooks/useAccountHoldingSelection";
import { useSeedAccountFromParam } from "@/lib/hooks/useSeedAccountFromParam";
import { Field, FieldGroup } from "@/components/ui/field";
import { OpFooter, OpNote, OpPage, safeReturnHref } from "./op-page";

export default function FxConversionForm() {
  const router = useRouter();
  const { editId, isEdit } = useEditId();
  const searchParams = useSearchParams();
  const returnHref = safeReturnHref(searchParams.get("returnTo"));

  const { accounts, holdings, loading, loadError, editData } =
    usePortfolioFormData({ editId, opType: "fx-conversion" });

  const [accountId, setAccountId] = useState<string>("");
  const [fromCurrency, setFromCurrency] = useState<string>("");
  const [fromAmount, setFromAmount] = useState<string>("");
  const [toCurrency, setToCurrency] = useState<string>("");
  const [toAmount, setToAmount] = useState<string>("");
  const [feeAmount, setFeeAmount] = useState<string>("");
  const [feeOnSleeveCurrency, setFeeOnSleeveCurrency] = useState<string>("");
  const [date, setDate] = useState<string>(todayISO());
  const [payee, setPayee] = useState<string>("");
  const [note, setNote] = useState<string>("");

  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [blockingClosureTxIds, setBlockingClosureTxIds] = useState<number[]>(
    [],
  );

  useEffect(() => {
    if (!editData) return;
    if (editData.accountId != null) setAccountId(String(editData.accountId));
    if (editData.fromCurrency) setFromCurrency(editData.fromCurrency as string);
    if (editData.fromAmount != null) setFromAmount(String(editData.fromAmount));
    if (editData.toCurrency) setToCurrency(editData.toCurrency as string);
    if (editData.toAmount != null) setToAmount(String(editData.toAmount));
    if (typeof editData.feeAmount === "number" && editData.feeAmount > 0) {
      setFeeAmount(String(editData.feeAmount));
      // feeOnSleeveCurrency is the form's authoritative field; fall back
      // to feeCurrency if the load only returned the legacy name.
      setFeeOnSleeveCurrency(
        ((editData.feeOnSleeveCurrency ?? editData.feeCurrency) as string) ?? "",
      );
    }
    if (editData.date) setDate(editData.date as string);
    setPayee((editData.payee as string) ?? "");
    setNote((editData.note as string) ?? "");
  }, [editData]);

  const { investmentAccounts, selectedAccount } =
    useAccountHoldingSelection(accounts, holdings, accountId);

  // FINLYNQ-227 — pre-select the investment account from `?account=<id>`.
  useSeedAccountFromParam({
    isEdit,
    field: "source",
    validIds: useMemo(
      () => investmentAccounts.map((a) => a.id),
      [investmentAccounts],
    ),
    setValue: setAccountId,
  });

  // value→label map so the account trigger shows a name, not an id (FINLYNQ-197).
  const accountLabelById = useMemo(
    () =>
      Object.fromEntries(
        investmentAccounts.map((a) => [
          String(a.id),
          `${a.name ?? `#${a.id}`} (${a.currency})`,
        ]),
      ),
    [investmentAccounts],
  );

  const cashSleeves = useMemo(
    () =>
      selectedAccount
        ? holdings.filter(
            (h) => h.accountId === selectedAccount.id && !!h.isCash,
          )
        : [],
    [holdings, selectedAccount],
  );

  // Distinct currencies (one sleeve per currency is the norm but defensive).
  const sleeveCurrencies = useMemo(() => {
    const set = new Set<string>();
    for (const s of cashSleeves) set.add(s.currency);
    return Array.from(set);
  }, [cashSleeves]);

  const toCurrencyOptions = useMemo(
    () => sleeveCurrencies.filter((c) => c !== fromCurrency),
    [sleeveCurrencies, fromCurrency],
  );

  const inferredRate = useMemo(() => {
    const from = parseFloat(fromAmount);
    const to = parseFloat(toAmount);
    if (Number.isNaN(from) || Number.isNaN(to) || from <= 0) return null;
    return to / from;
  }, [fromAmount, toAmount]);

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!accountId) e.accountId = "Pick an account";
    if (!fromCurrency) e.fromCurrency = "Pick a from currency";
    if (!toCurrency) e.toCurrency = "Pick a to currency";
    if (fromCurrency && toCurrency && fromCurrency === toCurrency) {
      e.toCurrency = "From and to must differ";
    }
    const fAmt = parseFloat(fromAmount);
    if (!fromAmount || Number.isNaN(fAmt) || fAmt <= 0)
      e.fromAmount = "From amount must be > 0";
    const tAmt = parseFloat(toAmount);
    if (!toAmount || Number.isNaN(tAmt) || tAmt <= 0)
      e.toAmount = "To amount must be > 0";
    if (feeAmount.trim()) {
      const feeNum = parseFloat(feeAmount);
      if (Number.isNaN(feeNum) || feeNum <= 0)
        e.feeAmount = "Fee must be > 0 or empty";
    }
    if (!date) e.date = "Pick a date";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    setBlockingClosureTxIds([]);
    if (!validate()) return;
    setSubmitting(true);
    try {
      const body: Record<string, unknown> = {
        accountId: Number(accountId),
        fromCurrency,
        fromAmount: parseFloat(fromAmount),
        toCurrency,
        toAmount: parseFloat(toAmount),
        date,
      };
      if (feeAmount.trim()) {
        const feeNum = parseFloat(feeAmount);
        if (!Number.isNaN(feeNum) && feeNum > 0) {
          body.feeAmount = feeNum;
          // Default the fee sleeve to the from-currency when the user
          // doesn't pick one — matches the server's resolve order.
          body.feeOnSleeveCurrency = feeOnSleeveCurrency || fromCurrency;
          body.feeCurrency = feeOnSleeveCurrency || fromCurrency;
        }
      }
      if (payee.trim()) body.payee = payee.trim();
      if (note.trim()) body.note = note.trim();
      if (isEdit) body.editId = editId;
      const res = await fetch("/api/portfolio/operations/fx-conversion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data: {
          error?: string;
          code?: string;
          currency?: string;
          blockingClosureTxIds?: unknown;
        } = await res.json().catch(() => ({}));
        if (data.code === "cash_sleeve_not_found") {
          setSubmitError(
            `No ${data.currency ?? ""} cash sleeve exists in this account. Create one via the account's Cash sleeves panel first.`,
          );
        } else if (data.code === "portfolio_edit_blocked") {
          setBlockingClosureTxIds(
            Array.isArray(data.blockingClosureTxIds)
              ? (data.blockingClosureTxIds.filter(
                  (n) => typeof n === "number",
                ) as number[])
              : [],
          );
          setSubmitError(
            data.error ?? "Edit blocked — dependent transactions exist",
          );
        } else {
          setSubmitError(data.error ?? `Save failed (${res.status})`);
        }
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
      <OpPage title={isEdit ? "Edit FX conversion" : "FX conversion"}>
        <FieldGroup>
          <OpNote>Loading…</OpNote>
        </FieldGroup>
      </OpPage>
    );
  }
  if (loadError) {
    return (
      <OpPage title={isEdit ? "Edit FX conversion" : "FX conversion"}>
        <FieldGroup>
          <OpNote tone="destructive">{loadError}</OpNote>
        </FieldGroup>
      </OpPage>
    );
  }
  if (investmentAccounts.length === 0) {
    return (
      <OpPage title="FX conversion">
        <FieldGroup>
          <OpNote>
            FX conversions require an investment account with multi-currency cash sleeves.
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
      title={isEdit ? "Edit FX conversion" : "FX conversion"}
      saveLabel={isEdit ? "Save" : "Record"}
      saving={submitting}
      saveDisabled={submitting || !!loadError}
      onSubmit={handleSubmit}
    >
      <FieldGroup label="Account">
        <Field
          label="Account"
          error={errors.accountId}
          control="select"
          value={accountId}
          onValueChange={(v) => {
            setAccountId(v ?? "");
            setFromCurrency("");
            setToCurrency("");
            setFeeOnSleeveCurrency("");
          }}
          placeholder="Pick an investment account"
          options={investmentAccounts.map((a) => ({ value: String(a.id), label: <>{a.name ?? `#${a.id}`} ({a.currency})</> }))}
        />
        {selectedAccount && sleeveCurrencies.length < 2 && (
          <OpNote tone="warning">
            This account has fewer than 2 cash sleeves. Add another currency sleeve in the{" "}
            <Link href={`/accounts/${selectedAccount.id}`} className="underline">
              account page
            </Link>{" "}
            before converting.
          </OpNote>
        )}
      </FieldGroup>

      <FieldGroup label="Convert">
        <Field
          label="From"
          error={errors.fromCurrency}
          control="select"
          value={fromCurrency}
          onValueChange={(v) => {
            setFromCurrency(v ?? "");
            if (v && v === toCurrency) setToCurrency("");
          }}
          disabled={!selectedAccount || sleeveCurrencies.length === 0}
          placeholder="Pick currency"
          options={sleeveCurrencies.map((c) => ({ value: c, label: c }))}
        />
        <Field
          label={fromCurrency ? `Amount (${fromCurrency})` : "Amount"}
          error={errors.fromAmount}
          control="amount"
          step="any"
          inputMode="decimal"
          value={fromAmount}
          onValueChange={(nv) => setFromAmount(nv)}
          placeholder="100.00"
        />
        <Field
          label="To"
          error={errors.toCurrency}
          control="select"
          value={toCurrency}
          onValueChange={(v) => setToCurrency(v ?? "")}
          disabled={!fromCurrency || toCurrencyOptions.length === 0}
          placeholder="Pick currency"
          options={toCurrencyOptions.map((c) => ({ value: c, label: c }))}
        />
        <Field
          label={toCurrency ? `Amount (${toCurrency})` : "Amount"}
          error={errors.toAmount}
          control="amount"
          step="any"
          inputMode="decimal"
          value={toAmount}
          onValueChange={(nv) => setToAmount(nv)}
          placeholder="73.50"
        />
      </FieldGroup>

      {inferredRate !== null && fromCurrency && toCurrency && (
        <OpFooter>
          Inferred rate:{" "}
          <span className="font-mono text-foreground">
            1 {fromCurrency} = {inferredRate.toFixed(6)} {toCurrency}
          </span>
        </OpFooter>
      )}

      <FieldGroup label="Fee">
        <Field
          label="Amount"
          error={errors.feeAmount}
          control="amount"
          step="any"
          inputMode="decimal"
          value={feeAmount}
          onValueChange={(nv) => setFeeAmount(nv)}
          placeholder="0.00 (optional)"
        />
        <Field
          label="Charged to"
          control="select"
          value={feeOnSleeveCurrency}
          onValueChange={(v) => setFeeOnSleeveCurrency(v ?? "")}
          disabled={!feeAmount.trim() || sleeveCurrencies.length === 0}
          placeholder={feeAmount.trim() ? "Default = from currency" : "Enter fee first"}
          options={sleeveCurrencies.map((c) => ({ value: c, label: c }))}
        />
      </FieldGroup>

      <FieldGroup label="Details">
        <Field
          label="Date"
          error={errors.date}
          control="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
        <Field
          label="Payee"
          value={payee}
          onChange={(e) => setPayee(e.target.value)}
          placeholder="e.g. Norbert's Gambit (optional)"
        />
        <Field label="Note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional" />
      </FieldGroup>

      {submitError && (
        <FieldGroup>
          <OpNote tone="destructive">{submitError}</OpNote>
        </FieldGroup>
      )}

      {blockingClosureTxIds.length > 0 && (
        <FieldGroup label="Blocked by">
          <OpNote tone="warning">Delete these dependent transactions first:</OpNote>
          {blockingClosureTxIds.map((id) => (
            <Link
              key={id}
              href={buildTxDrillUrl({ id: String(id) })}
              className="block px-4 py-3 text-sm text-warning underline hover:no-underline"
            >
              Transaction #{id}
            </Link>
          ))}
        </FieldGroup>
      )}
    </OpPage>
  );
}
