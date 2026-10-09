"use client";

/**
 * TransferForm — in-kind transfer between two investment accounts.
 *
 * POST /api/portfolio/operations/transfer with a single holdingId. The
 * model assumes the holding row is account-agnostic (one portfolio_holdings
 * row references both accounts via holding_accounts). The picker lists
 * holdings from the SOURCE account; the destination account must already
 * be paired with that holding row — we warn the user under the dest
 * picker so they create the pairing first if missing.
 *
 * No cash leg — both legs are in-kind (qty>0 / qty<0, amount=0).
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

import { OpFooter, OpGroup, OpNote, OpPage, OpRow, OP_INPUT, OP_SELECT, safeReturnHref } from "./op-page";

export default function TransferForm() {
  const router = useRouter();
  const { editId, isEdit } = useEditId();
  const searchParams = useSearchParams();
  const returnHref = safeReturnHref(searchParams.get("returnTo"));

  const { accounts, holdings, loading, loadError, editData } =
    usePortfolioFormData({ editId, opType: "transfer" });

  const [sourceAccountId, setSourceAccountId] = useState<string>("");
  const [destAccountId, setDestAccountId] = useState<string>("");
  const [holdingId, setHoldingId] = useState<string>("");
  const [qty, setQty] = useState<string>("");
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
    if (editData.sourceAccountId != null) setSourceAccountId(String(editData.sourceAccountId));
    if (editData.destAccountId != null) setDestAccountId(String(editData.destAccountId));
    if (editData.holdingId != null) setHoldingId(String(editData.holdingId));
    if (editData.qty != null) setQty(String(editData.qty));
    if (editData.date) setDate(editData.date as string);
    setPayee((editData.payee as string) ?? "");
    setNote((editData.note as string) ?? "");
  }, [editData]);

  const {
    investmentAccounts,
    selectedAccount: sourceAccount,
    accountHoldings: sourceHoldings,
  } = useAccountHoldingSelection(accounts, holdings, sourceAccountId);

  const destAccountOptions = useMemo(
    () => investmentAccounts.filter((a) => String(a.id) !== sourceAccountId),
    [investmentAccounts, sourceAccountId],
  );

  // FINLYNQ-227 — pre-select the "from" investment account from `?account=<id>`.
  useSeedAccountFromParam({
    isEdit,
    field: "source",
    validIds: useMemo(
      () => investmentAccounts.map((a) => a.id),
      [investmentAccounts],
    ),
    setValue: setSourceAccountId,
  });

  const selectedHolding = useMemo(
    () =>
      holdingId
        ? sourceHoldings.find((h) => String(h.id) === holdingId) ?? null
        : null,
    [holdingId, sourceHoldings],
  );

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
        destAccountOptions.map((a) => [
          String(a.id),
          `${a.name ?? `#${a.id}`} (${a.currency})`,
        ]),
      ),
    [destAccountOptions],
  );
  const holdingLabelById = useMemo(
    () =>
      Object.fromEntries(
        sourceHoldings.map((h) => [
          String(h.id),
          `${h.symbol ? `${h.symbol} — ` : ""}${h.name ?? `#${h.id}`} (${h.currency})`,
        ]),
      ),
    [sourceHoldings],
  );

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!sourceAccountId) e.sourceAccountId = "Pick a source account";
    if (!destAccountId) e.destAccountId = "Pick a destination account";
    if (sourceAccountId && destAccountId && sourceAccountId === destAccountId) {
      e.destAccountId = "Source and destination must differ";
    }
    if (!holdingId) e.holdingId = "Pick a holding";
    const qtyNum = parseFloat(qty);
    if (!qty || Number.isNaN(qtyNum) || qtyNum <= 0)
      e.qty = "Quantity must be > 0";
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
        sourceAccountId: Number(sourceAccountId),
        destAccountId: Number(destAccountId),
        holdingId: Number(holdingId),
        qty: parseFloat(qty),
        date,
      };
      if (payee.trim()) body.payee = payee.trim();
      if (note.trim()) body.note = note.trim();
      if (isEdit) body.editId = editId;
      const res = await fetch("/api/portfolio/operations/transfer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data: {
          error?: string;
          code?: string;
          blockingClosureTxIds?: unknown;
        } = await res.json().catch(() => ({}));
        if (data.code === "portfolio_edit_blocked") {
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
      <OpPage title={isEdit ? "Edit In-kind transfer" : "In-kind transfer"}>
        <OpGroup>
          <OpNote>Loading…</OpNote>
        </OpGroup>
      </OpPage>
    );
  }
  if (loadError) {
    return (
      <OpPage title={isEdit ? "Edit In-kind transfer" : "In-kind transfer"}>
        <OpGroup>
          <OpNote tone="destructive">{loadError}</OpNote>
        </OpGroup>
      </OpPage>
    );
  }
  if (investmentAccounts.length < 2) {
    return (
      <OpPage title="In-kind transfer">
        <OpGroup>
          <OpNote>
            In-kind transfers require two investment accounts. You currently have{" "}
            {investmentAccounts.length}.
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
      title={isEdit ? "Edit In-kind transfer" : "In-kind transfer"}
      saveLabel={isEdit ? "Save" : "Record"}
      saving={submitting}
      saveDisabled={submitting || !!loadError}
      onSubmit={handleSubmit}
    >
      <OpGroup label="Accounts">
        <OpRow label="From" error={errors.sourceAccountId}>
          <Select
            items={sourceAccountLabelById}
            value={sourceAccountId}
            onValueChange={(v) => {
              setSourceAccountId(v ?? "");
              setHoldingId("");
              if (v === destAccountId) setDestAccountId("");
            }}
          >
            <SelectTrigger className={OP_SELECT}>
              <SelectValue placeholder="Pick source" />
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
        <OpRow label="To" error={errors.destAccountId}>
          <Select
            items={destAccountLabelById}
            value={destAccountId}
            onValueChange={(v) => setDestAccountId(v ?? "")}
            disabled={!sourceAccountId}
          >
            <SelectTrigger className={OP_SELECT}>
              <SelectValue placeholder="Pick destination" />
            </SelectTrigger>
            <SelectContent alignItemWithTrigger={false} side="bottom">
              {destAccountOptions.map((a) => (
                <SelectItem key={a.id} value={String(a.id)}>
                  {a.name ?? `#${a.id}`} ({a.currency})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </OpRow>
      </OpGroup>
      <OpFooter>
        Make sure the destination account is already paired with the holding you pick below.
      </OpFooter>

      <OpGroup label="Shares">
        <OpRow label="Holding" error={errors.holdingId}>
          <Select
            items={holdingLabelById}
            value={holdingId}
            onValueChange={(v) => setHoldingId(v ?? "")}
            disabled={!sourceAccount}
          >
            <SelectTrigger className={OP_SELECT}>
              <SelectValue
                placeholder={
                  sourceAccount
                    ? sourceHoldings.length === 0
                      ? "No non-cash holdings in source"
                      : "Pick a holding"
                    : "Pick source account first"
                }
              />
            </SelectTrigger>
            <SelectContent alignItemWithTrigger={false} side="bottom">
              {sourceHoldings.map((h) => (
                <SelectItem key={h.id} value={String(h.id)}>
                  {h.symbol ? `${h.symbol} — ` : ""}
                  {h.name ?? `#${h.id}`} ({h.currency})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </OpRow>
        <OpRow label="Quantity" error={errors.qty}>
          <AmountInput
            step="any"
            inputMode="decimal"
            value={qty}
            onValueChange={(nv) => setQty(nv)}
            placeholder="50"
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
          Source has {Number(selectedHolding.currentShares ?? 0).toLocaleString(getDisplayLocale())}{" "}
          shares available.
        </OpFooter>
      )}

      <OpGroup label="Details">
        <OpRow label="Payee">
          <Input
            value={payee}
            onChange={(e) => setPayee(e.target.value)}
            placeholder="e.g. ACATS transfer"
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
