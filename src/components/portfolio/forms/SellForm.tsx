"use client";

/**
 * SellForm — Phase 2 of plan/portfolio-lots-and-performance.md.
 *
 * POST /api/portfolio/operations/sell:
 *   pick investment account → pick non-cash holding → enter qty + totalProceeds
 *   optional: "Choose specific lots" → LotPicker (FIFO when empty/omitted).
 *
 * Cash leg is inferred from the (account, holding.currency) sleeve;
 * missing sleeve surfaces with the same "create one first" message as Buy.
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
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import LotPicker from "./LotPicker";
import { todayISO } from "@/lib/utils/date";
import { isOversell, shortAmount } from "@/lib/portfolio/oversell";
import { useEditId } from "@/lib/hooks/useEditId";
import { buildTxDrillUrl } from "@/lib/transactions/drill-url";
import { usePortfolioFormData } from "@/lib/hooks/usePortfolioFormData";
import { useAccountHoldingSelection } from "@/lib/hooks/useAccountHoldingSelection";
import { useSeedAccountFromParam } from "@/lib/hooks/useSeedAccountFromParam";
import { AmountInput } from "@/components/amount-input";
import { getDisplayLocale } from "@/lib/locale";

import { OpFooter, OpGroup, OpNote, OpPage, OpRow, OP_INPUT, OP_SELECT, safeReturnHref } from "./op-page";

export default function SellForm() {
  const router = useRouter();
  const { editId, isEdit } = useEditId();
  const searchParams = useSearchParams();
  const returnHref = safeReturnHref(searchParams.get("returnTo"));

  const { accounts, holdings, loading, loadError, editData } =
    usePortfolioFormData({ editId, opType: "sell" });

  const [accountId, setAccountId] = useState<string>("");
  const [holdingId, setHoldingId] = useState<string>("");
  const [qty, setQty] = useState<string>("");
  const [totalProceeds, setTotalProceeds] = useState<string>("");
  const [date, setDate] = useState<string>(todayISO());
  const [payee, setPayee] = useState<string>("");
  const [note, setNote] = useState<string>("");
  const [tags, setTags] = useState<string>("");

  const [useLotPicker, setUseLotPicker] = useState(false);
  const [lotSelection, setLotSelection] = useState<
    { lotId: number; qty: number }[]
  >([]);
  // When the lot picker is active, the qty field is auto-computed from the
  // sum of per-lot inputs (read-only display).
  const lotSelectionTotal = lotSelection.reduce((s, l) => s + l.qty, 0);
  const effectiveSellQty = useLotPicker
    ? lotSelectionTotal
    : parseFloat(qty);

  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [blockingClosureTxIds, setBlockingClosureTxIds] = useState<number[]>(
    [],
  );
  // Oversell confirmation (FINLYNQ-162) — selling more than the current long
  // position opens a short (a supported feature); warn-but-allow before commit.
  const [oversellConfirmOpen, setOversellConfirmOpen] = useState(false);

  useEffect(() => {
    if (!editData) return;
    if (editData.accountId != null) setAccountId(String(editData.accountId));
    if (editData.holdingId != null) setHoldingId(String(editData.holdingId));
    if (editData.qty != null) setQty(String(editData.qty));
    if (editData.totalProceeds != null) setTotalProceeds(String(editData.totalProceeds));
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
    const qtyNum = useLotPicker ? lotSelectionTotal : parseFloat(qty);
    if (useLotPicker) {
      if (!(qtyNum > 0)) e.qty = "Pick at least one lot with qty > 0";
    } else {
      if (!qty || Number.isNaN(qtyNum) || qtyNum <= 0)
        e.qty = "Quantity must be > 0";
    }
    const proceedsNum = parseFloat(totalProceeds);
    if (!totalProceeds || Number.isNaN(proceedsNum) || proceedsNum <= 0)
      e.totalProceeds = "Total proceeds must be > 0";
    if (!date) e.date = "Pick a date";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  // Current long position for the selected holding, from data the form already
  // has (cached/displayed qty — advisory only). accountHoldings already excludes
  // cash sleeves, so the oversell concept never applies to a cash row.
  const heldQty = Number(selectedHolding?.currentShares ?? 0);
  const wouldOpenShort =
    !isEdit && isOversell(effectiveSellQty, heldQty);
  const shortUnits = shortAmount(effectiveSellQty, heldQty);

  function handleSubmit(e: React.FormEvent) {
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
    // Oversell gate (FINLYNQ-162): if the sell exceeds the long position, ask
    // for confirmation BEFORE committing. Confirming proceeds; the sell is
    // never blocked (a short lot opens — supported via holding_lots.side).
    if (wouldOpenShort) {
      setOversellConfirmOpen(true);
      return;
    }
    void performSubmit();
  }

  async function performSubmit() {
    setSubmitting(true);
    try {
      // Phase 3 — when the lot picker is active the qty is the sum of per-lot
      // inputs. Otherwise the user types qty manually (FIFO closes).
      const submitQty = useLotPicker ? lotSelectionTotal : parseFloat(qty);
      const body: Record<string, unknown> = {
        accountId: Number(accountId),
        holdingId: Number(holdingId),
        qty: submitQty,
        totalProceeds: parseFloat(totalProceeds),
        date,
      };
      if (payee.trim()) body.payee = payee.trim();
      if (note.trim()) body.note = note.trim();
      if (tags.trim()) body.tags = tags.trim();
      // Phase 3 lotSelection shape — array of {lotId, qty} per the picker.
      // Empty selection with picker on = same as FIFO (server default), so skip.
      if (useLotPicker && lotSelection.length > 0) {
        body.lotSelection = {
          method: "SPECIFIC",
          lots: lotSelection,
          // Legacy fallback for any reader that still expects lotIds.
          lotIds: lotSelection.map((l) => l.lotId),
        };
      }
      if (isEdit) body.editId = editId;
      const res = await fetch("/api/portfolio/operations/sell", {
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
      <OpPage title={isEdit ? "Edit Sell" : "Sell"}>
        <OpGroup>
          <OpNote>Loading…</OpNote>
        </OpGroup>
      </OpPage>
    );
  }
  if (loadError) {
    return (
      <OpPage title={isEdit ? "Edit Sell" : "Sell"}>
        <OpGroup>
          <OpNote tone="destructive">{loadError}</OpNote>
        </OpGroup>
      </OpPage>
    );
  }
  if (investmentAccounts.length === 0) {
    return (
      <OpPage title="Sell">
        <OpGroup>
          <OpNote>
            No investment accounts. Sell operations require an investment account. Mark one of
            your accounts as an investment account first.
          </OpNote>
          <Link href="/accounts" className="block px-4 py-3 text-sm text-primary">
            Go to Accounts →
          </Link>
        </OpGroup>
      </OpPage>
    );
  }

  const proceedsNum = parseFloat(totalProceeds);
  const showPreview =
    selectedHolding &&
    !Number.isNaN(proceedsNum) &&
    proceedsNum > 0 &&
    !!cashSleeve;

  return (
    <>
      <OpPage
        title={isEdit ? "Edit Sell" : "Sell"}
        saveLabel={isEdit ? "Save" : "Record"}
        saving={submitting}
        saveDisabled={submitting || cashSleeveMissing || !!loadError}
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
                setUseLotPicker(false);
                setLotSelection([]);
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
              onValueChange={(v) => {
                setHoldingId(v ?? "");
                setLotSelection([]);
              }}
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

          {selectedHolding && (
            <OpNote>
              Currently holding{" "}
              {Number(selectedHolding.currentShares ?? 0).toLocaleString(getDisplayLocale())} shares.
            </OpNote>
          )}
          {cashSleeveMissing && (
            <OpNote tone="destructive">
              No {selectedHolding?.currency} cash sleeve exists in this account. Create one in the{" "}
              <Link href={`/accounts/${selectedAccount?.id ?? ""}`} className="underline">
                account page
              </Link>{" "}
              first.
            </OpNote>
          )}

          <OpRow
            label={useLotPicker ? "Qty (lots)" : "Quantity"}
            error={errors.qty}
          >
            <AmountInput
              step="any"
              inputMode="decimal"
              value={useLotPicker ? String(lotSelectionTotal || "") : qty}
              onValueChange={(nv) => setQty(nv)}
              placeholder="100"
              readOnly={useLotPicker}
              className={OP_INPUT}
            />
          </OpRow>

          <OpRow
            label={
              <>
                Proceeds
                {selectedHolding ? ` (${selectedHolding.currency})` : ""}
              </>
            }
            error={errors.totalProceeds}
          >
            <AmountInput
              step="any"
              inputMode="decimal"
              value={totalProceeds}
              onValueChange={(nv) => setTotalProceeds(nv)}
              placeholder="1100.00"
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

        {showPreview && selectedHolding && (
          <OpFooter>
            Will credit the {selectedHolding.currency} cash sleeve by{" "}
            <span className="font-mono text-foreground">
              {formatCurrency(proceedsNum, selectedHolding.currency)}
            </span>
            .
          </OpFooter>
        )}

        {selectedHolding && (
          <OpGroup label="Lots">
            <label className="flex min-h-11 items-center gap-3 px-4 text-sm">
              <input
                type="checkbox"
                checked={useLotPicker}
                onChange={(e) => {
                  setUseLotPicker(e.target.checked);
                  if (!e.target.checked) setLotSelection([]);
                }}
                className="size-5"
              />
              <span>Choose specific lots (advanced). FIFO by default.</span>
            </label>
            {useLotPicker && (
              <div className="px-0 py-0">
                <LotPicker
                  holdingId={selectedHolding.id}
                  currency={selectedHolding.currency}
                  selection={lotSelection}
                  onChange={setLotSelection}
                />
              </div>
            )}
          </OpGroup>
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

      {/* Oversell confirmation (FINLYNQ-162): a confirm step inside the form, not an operation dialog. */}
      <ConfirmDialog
        open={oversellConfirmOpen}
        onOpenChange={setOversellConfirmOpen}
        title="Sell more than you hold?"
        description={
          <>
            This will open a short position of{" "}
            <span className="font-medium text-foreground">
              {shortUnits.toLocaleString(getDisplayLocale())}
            </span>{" "}
            {selectedHolding?.symbol ?? "units"} (you hold{" "}
            {heldQty.toLocaleString(getDisplayLocale())}, selling{" "}
            {effectiveSellQty.toLocaleString(getDisplayLocale())}). Short positions are supported —
            continue?
          </>
        }
        confirmLabel="Open short & sell"
        cancelLabel="Cancel"
        onConfirm={() => {
          setOversellConfirmOpen(false);
          void performSubmit();
        }}
      />
    </>
  );
}
