"use client";

/**
 * IncomeExpenseForm — portfolio dividends/interest (income) or fees (expense).
 *
 * POST /api/portfolio/operations/income-expense:
 *   pick account → pick cash sleeve currency → toggle income/expense + amount
 *   optional: relatedHoldingId (for attribution), categoryId.
 *
 * Sign convention: positive amount = income, negative = expense. We always
 * collect a positive number from the user and negate when "Expense" is
 * selected — simpler UX than asking them to think in signs.
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
import { buildTxDrillUrl } from "@/lib/transactions/drill-url";
import { usePortfolioFormData } from "@/lib/hooks/usePortfolioFormData";
import { useAccountHoldingSelection } from "@/lib/hooks/useAccountHoldingSelection";
import { useSeedAccountFromParam } from "@/lib/hooks/useSeedAccountFromParam";
import { AmountInput } from "@/components/amount-input";
import { getDisplayLocale } from "@/lib/locale";

type Direction = "income" | "expense";

import { OpFooter, OpGroup, OpNote, OpPage, OpRow, OP_INPUT, OP_SELECT, safeReturnHref } from "./op-page";

export default function IncomeExpenseForm() {
  const router = useRouter();
  const { editId, isEdit } = useEditId();
  const searchParams = useSearchParams();
  const returnHref = safeReturnHref(searchParams.get("returnTo"));

  const { accounts, holdings, categories, loading, loadError, editData } =
    usePortfolioFormData({ editId, opType: "income-expense", includeCategories: true });

  const [accountId, setAccountId] = useState<string>("");
  const [currency, setCurrency] = useState<string>("");
  const [direction, setDirection] = useState<Direction>("income");
  // Settle into: "cash" (the cash sleeve, legacy) or "shares" (a holding —
  // income received as shares, single-leg DRIP). Offered when creating an
  // income entry, and when editing a row that was itself settled as shares.
  const [settleAs, setSettleAs] = useState<"cash" | "shares">("cash");
  // Whether the row being edited was originally a shares-settled (DRIP) row.
  // Keeps the toggle visible across a shares↔cash switch in edit mode.
  const [editLoadedAsShares, setEditLoadedAsShares] = useState(false);
  const [quantity, setQuantity] = useState<string>("");
  const [amount, setAmount] = useState<string>("");
  const [relatedHoldingId, setRelatedHoldingId] = useState<string>("");
  // Entry type drives auto-categorization. A preset (dividend/interest/fee)
  // resolves-or-creates its canonical category server-side; "other" falls back
  // to the manual category picker below.
  const [incomeType, setIncomeType] = useState<
    "dividend" | "interest" | "fee" | "other"
  >("dividend");
  const [categoryId, setCategoryId] = useState<string>("");
  const [date, setDate] = useState<string>(todayISO());
  const [payee, setPayee] = useState<string>("");
  const [note, setNote] = useState<string>("");
  const [tags, setTags] = useState<string>("");

  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [blockingClosureTxIds, setBlockingClosureTxIds] = useState<number[]>(
    [],
  );

  useEffect(() => {
    if (!editData) return;
    if (editData.accountId != null) setAccountId(String(editData.accountId));
    if (editData.currency) setCurrency(editData.currency as string);
    if (typeof editData.amount === "number") {
      setDirection(editData.amount < 0 ? "expense" : "income");
      setAmount(String(Math.abs(editData.amount)));
    }
    // Shares-settled (DRIP) income: load the destination holding + qty and
    // stay in shares mode so saving re-records it as shares (not a silent
    // conversion to cash). The form reuses `relatedHoldingId` state as the
    // holding the shares land on (submitted as `holdingId`).
    if (editData.settleAs === "shares") {
      setEditLoadedAsShares(true);
      setSettleAs("shares");
      setDirection("income");
      if (editData.quantity != null) setQuantity(String(editData.quantity));
      if (editData.holdingId != null)
        setRelatedHoldingId(String(editData.holdingId));
    } else if (editData.relatedHoldingId != null) {
      setRelatedHoldingId(String(editData.relatedHoldingId));
    }
    // Editing an existing row: keep its category exactly as-is via the
    // manual picker — don't re-infer a preset and silently re-tag.
    setIncomeType("other");
    if (editData.categoryId != null) setCategoryId(String(editData.categoryId));
    if (editData.date) setDate(editData.date as string);
    setPayee((editData.payee as string) ?? "");
    setNote((editData.note as string) ?? "");
    setTags((editData.tags as string) ?? "");
  }, [editData]);

  const { investmentAccounts, selectedAccount, accountHoldings } =
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

  // Source currency list from cash sleeves on the selected account.
  const cashSleeves = useMemo(
    () =>
      selectedAccount
        ? holdings.filter(
            (h) => h.accountId === selectedAccount.id && !!h.isCash,
          )
        : [],
    [holdings, selectedAccount],
  );

  // Auto-default currency to the account's currency when changing accounts
  // (or to the first sleeve if the account currency lacks a sleeve).
  useEffect(() => {
    if (!selectedAccount) {
      setCurrency("");
      return;
    }
    setCurrency((prev) => {
      const stillValid = cashSleeves.some((s) => s.currency === prev);
      if (stillValid) return prev;
      const matchAcct = cashSleeves.find(
        (s) => s.currency === selectedAccount.currency,
      );
      return matchAcct?.currency ?? cashSleeves[0]?.currency ?? "";
    });
  }, [selectedAccount, cashSleeves]);

  // value→label maps so base-ui Select triggers show names, not ids (FINLYNQ-197).
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
  const relatedHoldingLabelById = useMemo(
    () =>
      Object.fromEntries(
        accountHoldings.map((h) => [
          String(h.id),
          `${h.symbol ? `${h.symbol} — ` : ""}${h.name ?? `#${h.id}`}`,
        ]),
      ),
    [accountHoldings],
  );
  const categoryLabelById = useMemo(
    () =>
      Object.fromEntries(
        categories.map((c) => [
          String(c.id),
          `${c.name ?? `#${c.id}`}${c.group ? ` (${c.group})` : ""}`,
        ]),
      ),
    [categories],
  );
  // Direction and entry-type enum→label maps (value differs from displayed text).
  const directionLabels: Record<string, string> = {
    income: "Income (+)",
    expense: "Expense (−)",
  };
  // incomeType labels depend on direction context; cover the full set to
  // handle both directions without re-computing on direction change.
  const incomeTypeLabels: Record<string, string> = {
    dividend: "Dividend",
    interest: "Interest",
    fee: "Fee",
    other: direction === "income" ? "Other income" : "Other expense",
  };

  // Income-as-shares is income-only. Offered when creating an income entry,
  // and when editing a row that was originally settled as shares (so the edit
  // keeps it as shares instead of converting to cash). `editLoadedAsShares`
  // keeps the toggle visible across a shares↔cash switch in edit mode.
  const sharesAllowed =
    (!isEdit && direction === "income") || (isEdit && editLoadedAsShares);
  const sharesMode = sharesAllowed && settleAs === "shares";

  // Implied price/share preview for shares mode (cosmetic).
  const impliedPricePerShare = useMemo(() => {
    const q = parseFloat(quantity);
    const v = parseFloat(amount);
    if (!q || !v || Number.isNaN(q) || Number.isNaN(v) || q <= 0) return null;
    return v / q;
  }, [quantity, amount]);

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!accountId) e.accountId = "Pick an account";
    const amt = parseFloat(amount);
    if (!amount || Number.isNaN(amt) || amt <= 0)
      e.amount = sharesMode ? "Value must be > 0" : "Amount must be > 0";
    if (sharesMode) {
      if (!relatedHoldingId)
        e.relatedHoldingId = "Pick a holding to receive shares";
      const q = parseFloat(quantity);
      if (!quantity || Number.isNaN(q) || q <= 0)
        e.quantity = "Quantity must be > 0";
    } else {
      if (!currency) e.currency = "Pick a currency / cash sleeve";
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
      const positive = parseFloat(amount);
      const body: Record<string, unknown> = {
        accountId: Number(accountId),
        date,
      };
      if (sharesMode) {
        // Single-leg DRIP: income lands as shares on the chosen holding.
        // Value is always positive; quantity = shares; no currency (derived
        // from the holding server-side).
        body.settleAs = "shares";
        body.holdingId = Number(relatedHoldingId);
        body.quantity = parseFloat(quantity);
        body.amount = positive;
      } else {
        // Cash sleeve: positive = income, negative = expense.
        body.currency = currency;
        body.amount = direction === "income" ? positive : -positive;
        if (relatedHoldingId) body.relatedHoldingId = Number(relatedHoldingId);
      }
      // Preset entry types auto-resolve the category server-side; "other" uses
      // the manually-picked category. An explicit categoryId always wins on the
      // server, so for presets we deliberately omit it.
      if (incomeType === "other") {
        if (categoryId) body.categoryId = Number(categoryId);
      } else {
        body.incomeType = incomeType;
      }
      if (payee.trim()) body.payee = payee.trim();
      if (note.trim()) body.note = note.trim();
      if (tags.trim()) body.tags = tags.trim();
      // Always send editId on edit — both the cash and shares branches do an
      // edit-as-replace (cascade-delete the original, then re-record).
      if (isEdit) body.editId = editId;
      const res = await fetch("/api/portfolio/operations/income-expense", {
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
            `No ${data.currency ?? currency} cash sleeve exists in this account. Create one via the account's Cash sleeves panel first.`,
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
      <OpPage title={isEdit ? "Edit Income / expense" : "Income / expense"}>
        <OpGroup>
          <OpNote>Loading…</OpNote>
        </OpGroup>
      </OpPage>
    );
  }
  if (loadError) {
    return (
      <OpPage title={isEdit ? "Edit Income / expense" : "Income / expense"}>
        <OpGroup>
          <OpNote tone="destructive">{loadError}</OpNote>
        </OpGroup>
      </OpPage>
    );
  }
  if (investmentAccounts.length === 0) {
    return (
      <OpPage title="Income / expense">
        <OpGroup>
          <OpNote>Portfolio income and expense require an investment account.</OpNote>
          <Link href="/accounts" className="block px-4 py-3 text-sm text-primary">
            Go to Accounts →
          </Link>
        </OpGroup>
      </OpPage>
    );
  }

  return (
    <OpPage
      title={isEdit ? "Edit Income / expense" : "Income / expense"}
      saveLabel={isEdit ? "Save" : sharesMode ? "Record income" : direction === "income" ? "Record income" : "Record expense"}
      saving={submitting}
      saveDisabled={submitting || !!loadError}
      onSubmit={handleSubmit}
    >
      <OpGroup label="Entry">
        <OpRow label="Account" error={errors.accountId}>
          <Select
            items={accountLabelById}
            value={accountId}
            onValueChange={(v) => {
              setAccountId(v ?? "");
              setRelatedHoldingId("");
            }}
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

        <OpRow label="Direction">
          <Select
            items={directionLabels}
            value={direction}
            onValueChange={(v) => {
              const d = (v ?? "income") as Direction;
              setDirection(d);
              // Reset the entry-type preset to the sensible default for the
              // new sign (income→dividend, expense→fee).
              setIncomeType(d === "income" ? "dividend" : "fee");
              // Income-as-shares is income-only — drop back to cash for an
              // expense so the form stays consistent.
              if (d === "expense") setSettleAs("cash");
            }}
          >
            <SelectTrigger className={OP_SELECT}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent alignItemWithTrigger={false} side="bottom">
              <SelectItem value="income">Income (+)</SelectItem>
              <SelectItem value="expense">Expense (−)</SelectItem>
            </SelectContent>
          </Select>
        </OpRow>

        {sharesMode ? (
          <OpRow label="Shares" error={errors.quantity}>
            <AmountInput
              step="any"
              inputMode="decimal"
              value={quantity}
              onValueChange={(nv) => setQuantity(nv)}
              placeholder="e.g. 1.2345"
              className={OP_INPUT}
            />
          </OpRow>
        ) : (
          <OpRow label="Sleeve" error={errors.currency}>
            <Select
              value={currency}
              onValueChange={(v) => setCurrency(v ?? "")}
              disabled={!selectedAccount || cashSleeves.length === 0}
            >
              <SelectTrigger className={OP_SELECT}>
                <SelectValue
                  placeholder={
                    selectedAccount && cashSleeves.length === 0
                      ? "No cash sleeves on this account"
                      : "Pick a sleeve"
                  }
                />
              </SelectTrigger>
              <SelectContent alignItemWithTrigger={false} side="bottom">
                {cashSleeves.map((s) => (
                  <SelectItem key={s.id} value={s.currency}>
                    {s.currency}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </OpRow>
        )}

        {sharesAllowed && (
          <OpRow label="Settle into">
            <Select
              items={{
                cash: "Cash sleeve",
                shares: "Holding (shares)",
              }}
              value={settleAs}
              onValueChange={(v) => setSettleAs((v ?? "cash") as "cash" | "shares")}
            >
              <SelectTrigger className={OP_SELECT}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent alignItemWithTrigger={false} side="bottom">
                <SelectItem value="cash">Cash sleeve</SelectItem>
                <SelectItem value="shares">Holding (shares)</SelectItem>
              </SelectContent>
            </Select>
          </OpRow>
        )}

        <OpRow label="Entry type">
          <Select
            items={incomeTypeLabels}
            value={incomeType}
            onValueChange={(v) =>
              setIncomeType((v ?? "other") as "dividend" | "interest" | "fee" | "other")
            }
          >
            <SelectTrigger className={OP_SELECT}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent alignItemWithTrigger={false} side="bottom">
              {direction === "income" ? (
                <>
                  <SelectItem value="dividend">Dividend</SelectItem>
                  <SelectItem value="interest">Interest</SelectItem>
                  <SelectItem value="other">Other income</SelectItem>
                </>
              ) : (
                <>
                  <SelectItem value="fee">Fee</SelectItem>
                  <SelectItem value="other">Other expense</SelectItem>
                </>
              )}
            </SelectContent>
          </Select>
        </OpRow>

        <OpRow label={sharesMode ? "Dollar value" : "Amount"} error={errors.amount}>
          <AmountInput
            step="any"
            inputMode="decimal"
            value={amount}
            onValueChange={(nv) => setAmount(nv)}
            placeholder="25.00"
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

        <OpRow label={sharesMode ? "Receives" : "Holding"} error={sharesMode ? errors.relatedHoldingId : undefined}>
          <Select
            items={relatedHoldingLabelById}
            value={relatedHoldingId}
            onValueChange={(v) => setRelatedHoldingId(v ?? "")}
            disabled={!selectedAccount || accountHoldings.length === 0}
          >
            <SelectTrigger className={OP_SELECT}>
              <SelectValue
                placeholder={
                  selectedAccount
                    ? accountHoldings.length === 0
                      ? "No non-cash holdings"
                      : sharesMode
                        ? "Pick the holding the shares land on"
                        : "Optional, for attribution"
                    : "Pick an account first"
                }
              />
            </SelectTrigger>
            <SelectContent alignItemWithTrigger={false} side="bottom">
              {accountHoldings.map((h) => (
                <SelectItem key={h.id} value={String(h.id)}>
                  {h.symbol ? `${h.symbol} — ` : ""}
                  {h.name ?? `#${h.id}`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </OpRow>

        {incomeType === "other" && (
          <OpRow label="Category">
            <Select
              items={categoryLabelById}
              value={categoryId}
              onValueChange={(v) => setCategoryId(v ?? "")}
              disabled={categories.length === 0}
            >
              <SelectTrigger className={OP_SELECT}>
                <SelectValue
                  placeholder={
                    categories.length === 0
                      ? "No categories available"
                      : "Pick a category (optional)"
                  }
                />
              </SelectTrigger>
              <SelectContent alignItemWithTrigger={false} side="bottom">
                {categories.map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    {c.name ?? `#${c.id}`}
                    {c.group ? ` (${c.group})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </OpRow>
        )}
      </OpGroup>

      {sharesAllowed && (
        <OpFooter>
          {settleAs === "shares"
            ? "Dividend/income received AS SHARES: books one entry that adds shares to a holding (cost basis = value ÷ quantity). No cash sleeve is touched."
            : "Income lands as cash on the matching cash sleeve."}
        </OpFooter>
      )}
      {sharesMode && impliedPricePerShare != null && (
        <OpFooter>
          ≈{" "}
          {impliedPricePerShare.toLocaleString(getDisplayLocale(), {
            maximumFractionDigits: 6,
          })}{" "}
          per share
        </OpFooter>
      )}
      {incomeType !== "other" && (
        <OpFooter>
          Auto-categorized as{" "}
          <span className="font-medium">
            {incomeType === "dividend"
              ? "Dividends"
              : incomeType === "interest"
                ? "Interest"
                : "Investment Fees"}
          </span>{" "}
          so it shows in the right report (the category is created if you don&apos;t have it yet).
          Choose &ldquo;Other&rdquo; to pick a category manually.
        </OpFooter>
      )}

      <OpGroup label="Details">
        <OpRow label="Payee">
          <Input
            value={payee}
            onChange={(e) => setPayee(e.target.value)}
            placeholder="e.g. Quarterly dividend (optional)"
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

      {blockingClosureTxIds.length > 0 && (
        <OpGroup label="Blocked by">
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
        </OpGroup>
      )}
    </OpPage>
  );
}
