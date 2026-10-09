"use client";

/**
 * BuyForm — Phase 2 of plan/portfolio-lots-and-performance.md.
 *
 * Records a Buy operation via POST /api/portfolio/operations/buy:
 *   pick investment account → pick non-cash holding → enter qty + totalCost
 *
 * Cash leg is inferred server-side from the (account, holding.currency) sleeve.
 * If the sleeve doesn't exist the server returns code:"cash_sleeve_not_found"
 * which we surface inline with a pointer to the account page.
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
import { formatCurrency } from "@/lib/currency";
import { todayISO } from "@/lib/utils/date";
import { useEditId } from "@/lib/hooks/useEditId";
import { buildTxDrillUrl } from "@/lib/transactions/drill-url";
import { usePortfolioFormData } from "@/lib/hooks/usePortfolioFormData";
import { useAccountHoldingSelection } from "@/lib/hooks/useAccountHoldingSelection";
import { useSeedAccountFromParam } from "@/lib/hooks/useSeedAccountFromParam";
import { AmountInput } from "@/components/amount-input";
import { getDisplayLocale } from "@/lib/locale";

import { OpFooter, OpGroup, OpNote, OpPage, OpRow, OP_INPUT, OP_SELECT, safeReturnHref } from "./op-page";

export default function BuyForm() {
  const router = useRouter();
  const { editId, isEdit } = useEditId();
  const searchParams = useSearchParams();
  const returnHref = safeReturnHref(searchParams.get("returnTo"));

  const { accounts, holdings, loading, loadError, editData } =
    usePortfolioFormData({ editId, opType: "buy" });

  const [accountId, setAccountId] = useState<string>("");
  const [holdingId, setHoldingId] = useState<string>("");
  const [qty, setQty] = useState<string>("");
  const [totalCost, setTotalCost] = useState<string>("");
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
    if (editData.holdingId != null) setHoldingId(String(editData.holdingId));
    if (editData.qty != null) setQty(String(editData.qty));
    if (editData.totalCost != null) setTotalCost(String(editData.totalCost));
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

  const selectedHolding = useMemo(
    () =>
      holdingId
        ? accountHoldings.find((h) => String(h.id) === holdingId) ?? null
        : null,
    [holdingId, accountHoldings],
  );

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
  const holdingLabelById = useMemo(
    () =>
      Object.fromEntries(
        accountHoldings.map((h) => [
          String(h.id),
          `${h.symbol ? `${h.symbol} — ` : ""}${h.name ?? `#${h.id}`} (${h.currency})`,
        ]),
      ),
    [accountHoldings],
  );

  // Cash-sleeve check: matching (account, currency, isCash=true) row must exist.
  const cashSleeve = useMemo(() => {
    if (!selectedAccount || !selectedHolding) return null;
    return (
      holdings.find(
        (h) =>
          h.accountId === selectedAccount.id &&
          !!h.isCash &&
          h.currency === selectedHolding.currency,
      ) ?? null
    );
  }, [holdings, selectedAccount, selectedHolding]);

  const cashSleeveMissing = !!selectedHolding && !cashSleeve;

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!accountId) e.accountId = "Pick an account";
    if (!holdingId) e.holdingId = "Pick a holding";
    const qtyNum = parseFloat(qty);
    if (!qty || Number.isNaN(qtyNum) || qtyNum <= 0)
      e.qty = "Quantity must be > 0";
    const costNum = parseFloat(totalCost);
    if (!totalCost || Number.isNaN(costNum) || costNum <= 0)
      e.totalCost = "Total cost must be > 0";
    if (!date) e.date = "Pick a date";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    setBlockingClosureTxIds([]);
    if (!validate()) return;
    if (cashSleeveMissing) {
      setSubmitError(
        `No ${selectedHolding?.currency} cash sleeve exists in this account.`,
      );
      return;
    }
    setSubmitting(true);
    try {
      const body: Record<string, unknown> = {
        accountId: Number(accountId),
        holdingId: Number(holdingId),
        qty: parseFloat(qty),
        totalCost: parseFloat(totalCost),
        date,
      };
      if (payee.trim()) body.payee = payee.trim();
      if (note.trim()) body.note = note.trim();
      if (tags.trim()) body.tags = tags.trim();
      if (isEdit) body.editId = editId;
      const res = await fetch("/api/portfolio/operations/buy", {
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
            `No ${data.currency ?? selectedHolding?.currency ?? ""} cash sleeve exists in this account. Create one via the account's Cash sleeves panel first.`,
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
      <OpPage title={isEdit ? "Edit Buy" : "Buy"}>
        <OpGroup>
          <OpNote>Loading…</OpNote>
        </OpGroup>
      </OpPage>
    );
  }
  if (loadError) {
    return (
      <OpPage title={isEdit ? "Edit Buy" : "Buy"}>
        <OpGroup>
          <OpNote tone="destructive">{loadError}</OpNote>
        </OpGroup>
      </OpPage>
    );
  }
  if (investmentAccounts.length === 0) {
    return (
      <OpPage title="Buy">
        <OpGroup>
          <OpNote>
            No investment accounts. Buy operations require an investment account. Mark one of
            your accounts as an investment account first.
          </OpNote>
          <Link href="/accounts" className="block px-4 py-3 text-sm text-primary">
            Go to Accounts →
          </Link>
        </OpGroup>
      </OpPage>
    );
  }

  const costNum = parseFloat(totalCost);
  const showPreview =
    selectedHolding && !Number.isNaN(costNum) && costNum > 0 && !!cashSleeve;

  return (
    <OpPage
      title={isEdit ? "Edit Buy" : "Buy"}
      saveLabel={isEdit ? "Save" : "Record"}
      saving={submitting}
      saveDisabled={cashSleeveMissing || !!loadError}
      onSubmit={handleSubmit}
    >
      <OpGroup label="Trade">
        <OpRow label="Account" error={errors.accountId}>
          <Select
            items={accountLabelById}
            value={accountId}
            onValueChange={(v) => {
              setAccountId(v ?? "");
              setHoldingId("");
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

        <OpRow label="Holding" error={errors.holdingId}>
          <Select
            items={holdingLabelById}
            value={holdingId}
            onValueChange={(v) => setHoldingId(v ?? "")}
            disabled={!selectedAccount}
          >
            <SelectTrigger className={OP_SELECT}>
              <SelectValue
                placeholder={
                  selectedAccount
                    ? accountHoldings.length === 0
                      ? "No non-cash holdings in this account"
                      : "Pick a holding"
                    : "Pick an account first"
                }
              />
            </SelectTrigger>
            <SelectContent alignItemWithTrigger={false} side="bottom">
              {accountHoldings.map((h) => (
                <SelectItem key={h.id} value={String(h.id)}>
                  {h.symbol ? `${h.symbol} — ` : ""}
                  {h.name ?? `#${h.id}`} ({h.currency})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </OpRow>

        {cashSleeveMissing && (
          <OpNote tone="destructive">
            No {selectedHolding?.currency} cash sleeve exists in this account. Create one in the{" "}
            <Link href={`/accounts/${selectedAccount?.id ?? ""}`} className="underline">
              account page
            </Link>{" "}
            first.
          </OpNote>
        )}

        <OpRow label="Quantity" error={errors.qty}>
          <AmountInput
            step="any"
            inputMode="decimal"
            value={qty}
            onValueChange={(nv) => setQty(nv)}
            placeholder="100"
            className={OP_INPUT}
          />
        </OpRow>

        <OpRow
          label={
            <>
              Total cost
              {selectedHolding ? ` (${selectedHolding.currency})` : ""}
            </>
          }
          error={errors.totalCost}
        >
          <AmountInput
            step="any"
            inputMode="decimal"
            value={totalCost}
            onValueChange={(nv) => setTotalCost(nv)}
            placeholder="1000.00"
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

      {selectedHolding && (
        <OpFooter>
          Currently holding{" "}
          {Number(selectedHolding.currentShares ?? 0).toLocaleString(getDisplayLocale())} shares.
        </OpFooter>
      )}
      {showPreview && selectedHolding && (
        <OpFooter>
          Will debit the {selectedHolding.currency} cash sleeve by{" "}
          <span className="font-mono text-foreground">
            {formatCurrency(costNum, selectedHolding.currency)}
          </span>
          .
        </OpFooter>
      )}

      <OpGroup label="Details">
        <OpRow label="Payee">
          <Input
            value={payee}
            onChange={(e) => setPayee(e.target.value)}
            placeholder="Broker name (optional)"
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
