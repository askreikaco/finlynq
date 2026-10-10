"use client";

/**
 * TransactionFormBody — the Add/Edit Transaction field list (transaction and
 * transfer modes), shared by TransactionDialog (variant "dialog", keeps its
 * bottom button row) and the full-page edit routes (variant "page", the page
 * header carries Save/Delete/Duplicate and the form is submitted via `formId`).
 * Logic comes from useTransactionForm; this file is presentation only.
 */

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AutoTextarea } from "@/components/ui/auto-textarea";

/** Note field look (Input-like box), two-row minimum, grows to max-h-48 then scrolls. */
const NOTE_TEXTAREA_CLASS =
  "min-h-[calc(var(--spacing-row-tall)*2)] max-h-48 rounded-lg border border-input bg-transparent px-2.5 py-1.5 transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Combobox, type ComboboxItemShape } from "@/components/ui/combobox";
import { Badge } from "@/components/ui/badge";
import { AmountInput } from "@/components/amount-input";
import { formatCurrency, formatDate, currencyDecimals, fxPreviewText } from "@/lib/currency";
import { ChevronDown, Link2, Plus, Scissors, Trash2 } from "lucide-react";
import { labelForSource } from "@/lib/tx-source";
import { getDisplayLocale } from "@/lib/locale";
import { FxPreviewLine } from "./fx-preview-line";
import { LotReallocationNotice } from "@/components/portfolio/lot-reallocation-notice";
import type { DialogLinkedSibling } from "./transaction-dialog";
import type { TransactionFormState } from "./use-transaction-form";

export interface TransactionFormBodyProps {
  f: TransactionFormState;
  /** "dialog": keeps the in-form Duplicate/Delete/submit row. "page": the page header owns those actions. */
  variant: "dialog" | "page";
  /** Id given to the <form> so a header button can submit it with `form=`. */
  formId?: string;
  /** Linked-siblings panel: a sibling row opens its own edit page (page variant). */
  onLinkedSiblingClick?: (sibling: DialogLinkedSibling) => void;
}

export function TransactionFormBody({
  f,
  variant,
  formId,
  onLinkedSiblingClick,
}: TransactionFormBodyProps) {
  const {
    form,
    setForm,
    currencyOptions,
    showAdvanced,
    setShowAdvanced,
    showSplits,
    setShowSplits,
    splitRows,
    setSplitRows,
    dialogMode,
    transferForm,
    setTransferForm,
    transferEdit,
    destHoldingTouched,
    setDestHoldingTouched,
    destQuantityTouched,
    setDestQuantityTouched,
    setTransferReceivedTouched,
    transferBooked,
    fxPreview,
    transferFxPreview,
    submitError,
    saving,
    reallocPreview,
    reallocPending,
    linkedSiblings,
    alsoCreateRule,
    setAlsoCreateRule,
    ruleNotice,
    editingTx,
    transferEditCredit,
    editId,
    sortAccount,
    sortCategory,
    sortHolding,
    displayCurrency,
    handleSubmit,
    handleTransferSubmit,
    splitAllocated,
    splitRemaining,
    splitBalanced,
    ruleEligible,
    ruleSelectedCategory,
    accounts,
    categories,
    holdings,
    emptySplitRow,
  } = f;
  return (
    <>
        {dialogMode === "transaction" && (
          <form
            id={formId}
            onSubmit={(e) => handleSubmit(e, ruleEligible && alsoCreateRule ? "auto" : "none")}
            className="space-y-4"
          >
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Date</Label>
                <Input
                  type="date"
                  value={form.date}
                  onChange={(e) => setForm({ ...form, date: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label>Amount</Label>
                <AmountInput
                  step="0.01"
                  value={form.amount}
                  onValueChange={(v) => setForm({ ...form, amount: v })}
                  placeholder="-50.00"
                  required
                />
              </div>
            </div>
            <FxPreviewLine preview={fxPreview} className="text-xs text-muted-foreground -mt-2" />
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Account</Label>
                <Combobox
                  value={form.accountId}
                  onValueChange={(v) => {
                    const acct = accounts.find((a) => String(a.id) === v);
                    const stillValid = form.portfolioHoldingId
                      ? holdings.some(
                          (h) => h.name === form.portfolioHoldingId && String(h.accountId) === v,
                        )
                      : true;
                    setForm({
                      ...form,
                      accountId: v,
                      currency: acct?.currency ?? displayCurrency,
                      portfolioHoldingId: stillValid ? form.portfolioHoldingId : "",
                    });
                  }}
                  items={sortAccount(
                    accounts
                      .filter((a) => !!editId || (a.isInvestment !== true && a.archived !== true))
                      .map((a): ComboboxItemShape => ({ value: String(a.id), label: a.name })),
                    (a) => Number(a.value),
                    (a, z) => (a.label ?? "").localeCompare(z.label ?? ""),
                  )}
                  placeholder="Select account"
                  searchPlaceholder="Search accounts…"
                  emptyMessage="No matches"
                  className="w-full"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Category</Label>
                <Combobox
                  value={form.categoryId}
                  onValueChange={(v) => setForm({ ...form, categoryId: v })}
                  items={sortCategory(
                    categories.map((c): ComboboxItemShape => ({
                      value: String(c.id),
                      label: `${c.group} - ${c.name}`,
                    })),
                    (c) => Number(c.value),
                    (a, z) => (a.label ?? "").localeCompare(z.label ?? ""),
                  )}
                  placeholder="Select category"
                  searchPlaceholder="Search categories…"
                  emptyMessage="No matches"
                  className="w-full"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Payee</Label>
                <Input value={form.payee} onChange={(e) => setForm({ ...form, payee: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Currency</Label>
                <Select value={form.currency} onValueChange={(v) => setForm({ ...form, currency: v ?? displayCurrency })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {currencyOptions.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Note</Label>
              <AutoTextarea
                value={form.note}
                onChange={(e) => setForm({ ...form, note: e.target.value })}
                className={NOTE_TEXTAREA_CLASS}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Tags (comma-separated)</Label>
              <Input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} />
            </div>

            {(() => {
              const sel = accounts.find((a) => String(a.id) === form.accountId);
              if (sel?.isInvestment !== true) return null;
              const accountHoldings = holdings.filter((h) => h.accountId === sel.id);
              const cash = accountHoldings.find((h) => !h.symbol);
              const items: ComboboxItemShape[] = [
                ...(cash
                  ? [{ value: cash.name, label: `${cash.name} (auto) — cash sleeve` } satisfies ComboboxItemShape]
                  : []),
                ...sortHolding(
                  accountHoldings
                    .filter((h) => h !== cash)
                    .map((h): ComboboxItemShape => ({
                      value: h.name,
                      label: h.symbol ? `${h.name} (${h.symbol})` : h.name,
                    })),
                  (h) => accountHoldings.find((x) => x.name === h.value)?.id ?? h.value,
                  (a, z) => (a.label ?? "").localeCompare(z.label ?? ""),
                ),
              ];
              return (
                <div className="space-y-1.5 rounded-md border border-chart-5/30 bg-chart-5/10 p-3">
                  <Label>
                    Portfolio Holding <span className="text-destructive">*</span>
                  </Label>
                  <Combobox
                    value={form.portfolioHoldingId}
                    onValueChange={(v) => setForm({ ...form, portfolioHoldingId: v })}
                    items={items}
                    placeholder={cash ? "Cash (auto)" : "Pick a holding"}
                    searchPlaceholder="Search holdings…"
                    emptyMessage="No matches"
                    className="w-full"
                  />
                  <p className="text-xs text-muted-foreground">
                    {sel.name} is an investment account — every transaction must reference a holding. Pick the symbol you traded, or leave the default Cash sleeve for cash legs (deposits, fees, dividends paid as cash).
                  </p>
                </div>
              );
            })()}

            {editId && linkedSiblings.length > 0 && (
              <div className="space-y-2 rounded-lg border border-info/30 bg-info/10 p-3">
                <div className="text-xs text-info/80">
                  This transaction is part of a multi-leg group; legs are edited individually.
                </div>
                <div className="flex items-center gap-1.5 text-xs font-medium text-info">
                  <Link2 className="h-3.5 w-3.5" />
                  Linked transaction{linkedSiblings.length > 1 ? "s" : ""}
                </div>
                <div className="space-y-1">
                  {linkedSiblings.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => onLinkedSiblingClick?.(s)}
                      className="flex w-full items-center justify-between gap-2 rounded-md bg-background/50 px-2 py-1.5 text-xs hover:bg-background transition-colors border border-transparent hover:border-info/30"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-muted-foreground font-mono shrink-0">{formatDate(s.date)}</span>
                        <span className="truncate font-medium">{s.accountName ?? "—"}</span>
                        {s.portfolioHolding && (
                          <span className="text-muted-foreground truncate">· {s.portfolioHolding}</span>
                        )}
                      </div>
                      <span
                        className={`font-mono font-semibold shrink-0 ${s.amount >= 0 ? "text-pos" : "text-destructive"}`}
                      >
                        {formatCurrency(s.amount, s.currency)}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <button
              type="button"
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors w-full"
              onClick={() => setShowSplits(!showSplits)}
            >
              <Scissors className={`h-4 w-4 transition-transform ${showSplits ? "text-chart-5" : ""}`} />
              {showSplits ? "Hide splits" : "Split this transaction"}
            </button>

            {showSplits && (
              <div className="space-y-2 border rounded-lg p-3 bg-muted/20">
                <div className="text-xs text-muted-foreground font-medium">
                  Split rows (must sum to total amount)
                </div>
                {splitRows.map((row, i) => (
                  <div key={i} className="flex gap-1.5 items-center">
                    <Combobox
                      value={row.categoryId}
                      onValueChange={(v) => {
                        const next = [...splitRows];
                        next[i] = { ...next[i], categoryId: v };
                        setSplitRows(next);
                      }}
                      items={sortCategory(
                        categories.map((c): ComboboxItemShape => ({
                          value: String(c.id),
                          label: c.name,
                        })),
                        (c) => Number(c.value),
                        (a, z) => (a.label ?? "").localeCompare(z.label ?? ""),
                      )}
                      placeholder="Category"
                      searchPlaceholder="Search categories…"
                      emptyMessage="No matches"
                      size="sm"
                      className="h-7 flex-1 text-xs"
                    />
                    <AmountInput
                      step="0.01"
                      min="0"
                      className="h-7 text-xs w-24 font-mono"
                      placeholder="0.00"
                      value={row.amount}
                      onValueChange={(nv) => {
                        const next = [...splitRows];
                        next[i] = { ...next[i], amount: nv };
                        setSplitRows(next);
                      }}
                    />
                    <Input
                      className="h-7 text-xs w-24"
                      placeholder="Note"
                      value={row.note}
                      onChange={(e) => {
                        const next = [...splitRows];
                        next[i] = { ...next[i], note: e.target.value };
                        setSplitRows(next);
                      }}
                    />
                    <Button aria-label="Remove split row"
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0 text-muted-foreground"
                      onClick={() => setSplitRows(splitRows.filter((_, j) => j !== i))}
                      disabled={splitRows.length <= 2}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full h-7 text-xs"
                  onClick={() => setSplitRows([...splitRows, emptySplitRow()])}
                >
                  <Plus className="h-3 w-3 mr-1" /> Add row
                </Button>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">
                    Allocated:{" "}
                    <span className="font-mono">{formatCurrency(splitAllocated, form.currency)}</span>
                  </span>
                  {splitBalanced ? (
                    <Badge variant="outline" className="text-xs border-pos/30 text-pos bg-pos/10">
                      Balanced
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-xs border-destructive/30 text-destructive bg-destructive/10">
                      {splitRemaining > 0
                        ? `${formatCurrency(splitRemaining, form.currency)} left`
                        : `${formatCurrency(Math.abs(splitRemaining), form.currency)} over`}
                    </Badge>
                  )}
                </div>
              </div>
            )}

            <button
              type="button"
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors w-full"
              onClick={() => setShowAdvanced(!showAdvanced)}
            >
              <ChevronDown className={`h-4 w-4 transition-transform ${showAdvanced ? "rotate-180" : ""}`} />
              Advanced Options
            </button>

            {showAdvanced && (
              <div className="space-y-4 border rounded-lg p-4 bg-muted/20">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>Quantity</Label>
                    <AmountInput
                      step="0.0001"
                      value={form.quantity}
                      onValueChange={(nv) => setForm({ ...form, quantity: nv })}
                      placeholder="e.g. 10"
                    />
                  </div>
                  {accounts.find((a) => String(a.id) === form.accountId)?.isInvestment !== true && (
                    <div className="space-y-1.5">
                      <Label>Portfolio Holding</Label>
                      <Combobox
                        value={form.portfolioHoldingId}
                        onValueChange={(v) => setForm({ ...form, portfolioHoldingId: v })}
                        items={(() => {
                          const accountHoldings = form.accountId
                            ? holdings.filter((h) => String(h.accountId) === form.accountId)
                            : holdings;
                          return [
                            ...sortHolding(
                              accountHoldings.map((h): ComboboxItemShape => ({
                                value: h.name,
                                label: `${h.symbol ? `${h.name} (${h.symbol})` : h.name}${h.accountName ? ` — ${h.accountName}` : ""}`,
                              })),
                              (h) => accountHoldings.find((x) => x.name === h.value)?.id ?? h.value,
                              (a, z) => (a.label ?? "").localeCompare(z.label ?? ""),
                            ),
                            ...(form.portfolioHoldingId &&
                            !holdings.some((h) => h.name === form.portfolioHoldingId)
                              ? [
                                  {
                                    value: form.portfolioHoldingId,
                                    label: form.portfolioHoldingId,
                                  } satisfies ComboboxItemShape,
                                ]
                              : []),
                          ];
                        })()}
                        placeholder="None"
                        searchPlaceholder="Search holdings…"
                        emptyMessage="No matches"
                        className="w-full"
                      />
                    </div>
                  )}
                </div>
                <div className="flex min-h-row items-center justify-between gap-3">
                  <Label htmlFor="isBusiness" className="flex-1 cursor-pointer">
                    Business expense
                  </Label>
                  <Switch
                    id="isBusiness"
                    checked={form.isBusiness}
                    onCheckedChange={(v) => setForm({ ...form, isBusiness: v })}
                    className="shrink-0"
                  />
                </div>
              </div>
            )}

            {submitError && (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {submitError.message}{" "}
                {submitError.currency && (
                  <Link href="/settings/general" className="underline hover:no-underline">
                    Add a custom rate
                  </Link>
                )}
              </div>
            )}

            {/* FINLYNQ-176 — lot-locked edit: show the reallocation preview and
                a confirm button to proceed (reallocate dependents). */}
            {(reallocPreview || reallocPending) && (
              <div className="space-y-2">
                <LotReallocationNotice preview={reallocPreview} loading={reallocPending} />
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  className="w-full"
                  disabled={reallocPending || saving}
                  onClick={(e) => handleSubmit(e, "none", true)}
                >
                  Reallocate &amp; save
                </Button>
              </div>
            )}

            {editingTx && (() => {
              const created = editingTx.createdAt ? new Date(editingTx.createdAt).toLocaleString() : null;
              const updated = editingTx.updatedAt ? new Date(editingTx.updatedAt).toLocaleString() : null;
              const sourceLabel = editingTx.source ? labelForSource(editingTx.source) : null;
              if (!created && !updated && !sourceLabel) return null;
              return (
                <div className="text-xs text-muted-foreground border-t pt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
                  {created && <span>Created {created}</span>}
                  {updated && <span>· Updated {updated}</span>}
                  {sourceLabel && (
                    <Badge variant="outline" className="text-xs py-0 px-1.5">
                      {sourceLabel}
                    </Badge>
                  )}
                </div>
              );
            })()}

            {/* Rule suggestion (FINLYNQ-125) — opt-in, new-entry tx mode only.
                The tx saves + reconciles first; the rule is best-effort. */}
            {ruleEligible && (
              <div className="space-y-1.5 rounded-md border border-info/30 bg-info/10 p-3">
                <div className="flex min-h-row items-center justify-between gap-3">
                  <Label htmlFor="alsoCreateRule" className="flex-1 cursor-pointer">
                    Also create a rule for next time
                  </Label>
                  <Switch
                    id="alsoCreateRule"
                    checked={alsoCreateRule}
                    onCheckedChange={(v) => setAlsoCreateRule(v)}
                    className="shrink-0"
                  />
                </div>
                <p className="text-xs text-muted-foreground pl-6">
                  Payee contains{" "}
                  <span className="font-mono text-foreground">
                    &ldquo;{form.payee.trim()}&rdquo;
                  </span>{" "}
                  → {ruleSelectedCategory?.name}
                  {" · "}
                  <button
                    type="button"
                    className="underline hover:no-underline text-info disabled:opacity-50"
                    disabled={saving}
                    onClick={(e) => handleSubmit(e, "customize")}
                  >
                    Customize…
                  </button>
                </p>
              </div>
            )}

            {ruleNotice && (
              <div className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
                {ruleNotice}
              </div>
            )}

            {variant === "dialog" && (
              <div className="flex gap-2">
                <Button type="submit" className="flex-1" disabled={saving}>
                  {saving
                    ? `${editId ? "Updating" : "Creating"}…`
                    : `${editId ? "Update" : "Create"} Transaction`}
                </Button>
              </div>
            )}
          </form>
        )}

        {dialogMode === "transfer" && (
          <form id={formId} onSubmit={handleTransferSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Date</Label>
                <Input
                  type="date"
                  value={transferForm.date}
                  onChange={(e) => setTransferForm({ ...transferForm, date: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label>Amount sent</Label>
                <AmountInput
                  step="0.01"
                  min="0"
                  value={transferForm.amount}
                  onValueChange={(v) => {
                    setTransferReceivedTouched(false);
                    setTransferForm({ ...transferForm, amount: v });
                  }}
                  placeholder="100.00"
                  required
                />
              </div>
            </div>
            {(() => {
              const fromAcctPicker = accounts.find((a) => String(a.id) === transferForm.fromAccountId);
              const toAcctPicker = accounts.find((a) => String(a.id) === transferForm.toAccountId);
              const fromIsInv = fromAcctPicker?.isInvestment === true;
              const toIsInv = toAcctPicker?.isInvestment === true;
              const allowSameAccount =
                (fromIsInv && toIsInv) ||
                (fromIsInv && !toAcctPicker) ||
                (!fromAcctPicker && toIsInv);
              return (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>From account</Label>
                    <Combobox
                      value={transferForm.fromAccountId}
                      onValueChange={(v) => setTransferForm({ ...transferForm, fromAccountId: v })}
                      items={sortAccount(
                        accounts
                          .filter((a) => !!editId || (a.isInvestment !== true && a.archived !== true))
                          .filter((a) => allowSameAccount || String(a.id) !== transferForm.toAccountId)
                          .map((a): ComboboxItemShape => ({
                            value: String(a.id),
                            label: `${a.name} · ${a.currency}`,
                          })),
                        (a) => Number(a.value),
                        (a, z) => (a.label ?? "").localeCompare(z.label ?? ""),
                      )}
                      placeholder="Source account"
                      searchPlaceholder="Search accounts…"
                      emptyMessage="No matches"
                      className="w-full"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>To account</Label>
                    <Combobox
                      value={transferForm.toAccountId}
                      onValueChange={(v) => setTransferForm({ ...transferForm, toAccountId: v })}
                      items={sortAccount(
                        accounts
                          .filter((a) => !!editId || (a.isInvestment !== true && a.archived !== true))
                          .filter((a) => allowSameAccount || String(a.id) !== transferForm.fromAccountId)
                          .map((a): ComboboxItemShape => ({
                            value: String(a.id),
                            label: `${a.name} · ${a.currency}`,
                          })),
                        (a) => Number(a.value),
                        (a, z) => (a.label ?? "").localeCompare(z.label ?? ""),
                      )}
                      placeholder="Destination account"
                      searchPlaceholder="Search accounts…"
                      emptyMessage="No matches"
                      className="w-full"
                    />
                  </div>
                </div>
              );
            })()}

            {(() => {
              const fromAcct = accounts.find((a) => String(a.id) === transferForm.fromAccountId);
              const toAcct = accounts.find((a) => String(a.id) === transferForm.toAccountId);
              const fromInv = fromAcct?.isInvestment === true;
              const toInv = toAcct?.isInvestment === true;
              if (!fromInv && !toInv) return null;

              const bothInv = fromInv && toInv;

              const sourceHoldings = fromAcct ? holdings.filter((h) => h.accountId === fromAcct.id) : [];
              const destHoldings = toAcct ? holdings.filter((h) => h.accountId === toAcct.id) : [];

              const buildHoldingItems = (acctHoldings: typeof holdings): ComboboxItemShape[] =>
                sortHolding(
                  acctHoldings.map((h): ComboboxItemShape => ({
                    value: bothInv ? h.name : String(h.id),
                    label: h.symbol ? `${h.name} (${h.symbol})` : h.name,
                  })),
                  (h) =>
                    acctHoldings.find((x) => (bothInv ? x.name === h.value : String(x.id) === h.value))?.id ?? h.value,
                  (a, z) => (a.label ?? "").localeCompare(z.label ?? ""),
                );

              if (bothInv) {
                const sourceName = transferForm.holdingName.trim();
                const destExactMatch =
                  sourceName !== "" ? destHoldings.find((h) => h.name === sourceName) ?? null : null;
                const destSentinel = "__same_as_source__";
                const destSelectValue =
                  transferForm.destHoldingName.trim() !== "" &&
                  transferForm.destHoldingName.trim() !== sourceName
                    ? transferForm.destHoldingName.trim()
                    : destSentinel;
                return (
                  <div className="space-y-3 rounded-md border border-chart-5/30 bg-chart-5/10 p-3">
                    <p className="text-xs text-muted-foreground">
                      Both accounts are investment accounts — pick the holding to transfer and the quantity. Source holding must already exist. Destination defaults to the same holding name (auto-created if missing). Cash amount may be 0 for a pure in-kind move.
                    </p>
                    {fromAcct && toAcct && fromAcct.id === toAcct.id && (
                      <p className="text-xs text-warning">
                        Same-account rebalance — pick a different destination holding to move shares between two positions in this brokerage.
                      </p>
                    )}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs">
                          Source holding (in {fromAcct?.name ?? "—"}){" "}
                          <span className="text-destructive">*</span>
                        </Label>
                        <Combobox
                          value={transferForm.holdingName}
                          onValueChange={(v) => setTransferForm({ ...transferForm, holdingName: v ?? "" })}
                          items={buildHoldingItems(sourceHoldings)}
                          placeholder="Pick a holding"
                          searchPlaceholder="Search holdings…"
                          emptyMessage="No matches"
                          size="sm"
                          className="w-full"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">
                          Quantity (shares) <span className="text-destructive">*</span>
                        </Label>
                        <AmountInput
                          step="0.0001"
                          min="0"
                          value={transferForm.quantity}
                          onValueChange={(nv) => setTransferForm({ ...transferForm, quantity: nv })}
                          placeholder="e.g. 10.0000"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs">Destination holding (in {toAcct?.name ?? "—"})</Label>
                        {toAcct ? (
                          <Select
                            value={destSelectValue}
                            onValueChange={(v) => {
                              const val = v ?? destSentinel;
                              if (val === destSentinel) {
                                setDestHoldingTouched(false);
                                setTransferForm({ ...transferForm, destHoldingName: "" });
                              } else if (val === "__custom__") {
                                setDestHoldingTouched(true);
                              } else {
                                setDestHoldingTouched(true);
                                setTransferForm({ ...transferForm, destHoldingName: val });
                              }
                            }}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Same as source">
                                {(v) => {
                                  const val = v == null ? "" : String(v);
                                  if (!val || val === destSentinel) {
                                    if (!sourceName) return "Same as source";
                                    const matchShares = Number(destExactMatch?.currentShares ?? 0);
                                    return destExactMatch
                                      ? `${sourceName} (existing · ${matchShares.toLocaleString(getDisplayLocale(), { maximumFractionDigits: 4 })} shares)`
                                      : `${sourceName} (will create)`;
                                  }
                                  if (val === "__custom__") return transferForm.destHoldingName || "Custom name";
                                  const h = destHoldings.find((x) => x.name === val);
                                  const shares = Number(h?.currentShares ?? 0);
                                  return `${val} · ${shares.toLocaleString(getDisplayLocale(), { maximumFractionDigits: 4 })} shares`;
                                }}
                              </SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value={destSentinel}>
                                {sourceName
                                  ? destExactMatch
                                    ? `Same as source — binds to existing "${sourceName}" (${Number(
                                        destExactMatch.currentShares ?? 0,
                                      ).toLocaleString(getDisplayLocale(), { maximumFractionDigits: 4 })} shares)`
                                    : `Same as source — auto-create "${sourceName}"`
                                  : "Same as source"}
                              </SelectItem>
                              {destHoldings
                                .filter((h) => h.name !== sourceName)
                                .map((h) => {
                                  const shares = Number(h.currentShares ?? 0);
                                  const qty = ` · ${shares.toLocaleString(getDisplayLocale(), { maximumFractionDigits: 4 })} shares`;
                                  return (
                                    <SelectItem key={h.id} value={h.name}>
                                      {h.symbol ? `${h.name} (${h.symbol})${qty}` : `${h.name}${qty}`}
                                    </SelectItem>
                                  );
                                })}
                              <SelectItem value="__custom__">+ Type a different name…</SelectItem>
                            </SelectContent>
                          </Select>
                        ) : (
                          <Input value="" placeholder="Pick a destination account first" disabled />
                        )}
                        {destHoldingTouched && destSelectValue === "__custom__" && (
                          <Input
                            value={transferForm.destHoldingName}
                            onChange={(e) => setTransferForm({ ...transferForm, destHoldingName: e.target.value })}
                            placeholder={`New holding name in ${toAcct?.name ?? "destination"}`}
                          />
                        )}
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Destination quantity</Label>
                        <AmountInput
                          step="0.0001"
                          min="0"
                          value={destQuantityTouched ? transferForm.destQuantity : transferForm.quantity}
                          onValueChange={(nv) => {
                            setDestQuantityTouched(true);
                            setTransferForm({ ...transferForm, destQuantity: nv });
                          }}
                          placeholder={transferForm.quantity || "e.g. 10.0000"}
                        />
                        {destQuantityTouched &&
                          transferForm.destQuantity &&
                          parseFloat(transferForm.destQuantity) !== parseFloat(transferForm.quantity || "0") && (
                            <p className="text-xs text-warning">
                              Asymmetric — the destination will receive a different share count (split / merger / conversion).
                            </p>
                          )}
                        {destQuantityTouched && (
                          <button
                            type="button"
                            className="text-xs text-muted-foreground hover:text-foreground underline"
                            onClick={() => {
                              setDestQuantityTouched(false);
                              setTransferForm({ ...transferForm, destQuantity: "" });
                            }}
                          >
                            Reset to source quantity
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              }

              if (transferEdit) return null;
              return (
                <div className="space-y-2 rounded-md border border-chart-5/30 bg-chart-5/10 p-3">
                  <p className="text-xs text-muted-foreground">
                    Investment account leg — every transfer into an investment account must reference a holding and the share count moving through it.
                  </p>
                  {fromInv && fromAcct && (
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs">
                          Holding in {fromAcct.name} <span className="text-destructive">*</span>
                        </Label>
                        <Combobox
                          value={transferForm.fromHoldingId}
                          onValueChange={(v) => setTransferForm({ ...transferForm, fromHoldingId: v ?? "" })}
                          items={buildHoldingItems(sourceHoldings)}
                          placeholder="Pick a holding"
                          searchPlaceholder="Search holdings…"
                          emptyMessage="No matches"
                          size="sm"
                          className="w-full"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">
                          Quantity (shares) <span className="text-destructive">*</span>
                        </Label>
                        <AmountInput
                          step="0.0001"
                          min="0"
                          value={transferForm.quantity}
                          onValueChange={(nv) => setTransferForm({ ...transferForm, quantity: nv })}
                          placeholder="e.g. 10.0000"
                        />
                      </div>
                    </div>
                  )}
                  {toInv && toAcct && (
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs">
                          Holding in {toAcct.name} <span className="text-destructive">*</span>
                        </Label>
                        <Combobox
                          value={transferForm.toHoldingId}
                          onValueChange={(v) => setTransferForm({ ...transferForm, toHoldingId: v ?? "" })}
                          items={buildHoldingItems(destHoldings)}
                          placeholder="Pick a holding"
                          searchPlaceholder="Search holdings…"
                          emptyMessage="No matches"
                          size="sm"
                          className="w-full"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">
                          Quantity (shares) <span className="text-destructive">*</span>
                        </Label>
                        <AmountInput
                          step="0.0001"
                          min="0"
                          value={transferForm.quantity}
                          onValueChange={(nv) => setTransferForm({ ...transferForm, quantity: nv })}
                          placeholder="e.g. 10.0000"
                        />
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}

            {(() => {
              const fromAcct = accounts.find((a) => String(a.id) === transferForm.fromAccountId);
              const toAcct = accounts.find((a) => String(a.id) === transferForm.toAccountId);
              const isCrossCcy = !!fromAcct && !!toAcct && fromAcct.currency !== toAcct.currency;
              if (!isCrossCcy) return null;
              // FINLYNQ-317 — the caption reports the rate the CURRENT form
              // values imply, because that is the rate that will be booked. A
              // transfer settles at the rate the bank gave, which is rarely the
              // market rate for the date, so captioning the market rate next to
              // a hand-entered amount contradicts the field beside it.
              const sentNum = parseFloat(transferForm.amount);
              const recvNum = parseFloat(transferForm.receivedAmount);
              const impliedRate =
                Number.isFinite(sentNum) && sentNum > 0 && Number.isFinite(recvNum) && recvNum > 0
                  ? recvNum / sentNum
                  : null;
              // Cent-level tolerance: both sides are round2'd on write.
              const isAsBooked =
                !!transferBooked &&
                impliedRate != null &&
                Math.abs(sentNum - transferBooked.sent) < 0.005 &&
                Math.abs(recvNum - transferBooked.received) < 0.005;
              const matchesPreview =
                transferFxPreview.state === "ok" &&
                impliedRate != null &&
                Math.abs(impliedRate - transferFxPreview.rate) < 1e-6;
              const rateSource = isAsBooked
                ? "as booked"
                : matchesPreview && transferFxPreview.state === "ok"
                  ? transferFxPreview.source
                  : "entered";
              // Market rate for the transfer's own date, shown as a reference
              // only when it disagrees with what is actually booked.
              const showMarketRef =
                transferFxPreview.state === "ok" && impliedRate != null && !matchesPreview;
              return (
                <div className="space-y-2 rounded-md border border-warning/30 bg-warning/10 p-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">Amount received ({toAcct!.currency})</Label>
                    {impliedRate != null ? (
                      <span className="text-xs text-muted-foreground">
                        rate {impliedRate.toFixed(6)} · {rateSource}
                      </span>
                    ) : transferFxPreview.state === "loading" ? (
                      <span className="text-xs text-muted-foreground">Calculating…</span>
                    ) : transferFxPreview.state === "ok" ? (
                      <span className="text-xs text-muted-foreground">
                        rate {transferFxPreview.rate.toFixed(6)} · {transferFxPreview.source}
                      </span>
                    ) : null}
                  </div>
                  <AmountInput
                    step="0.01"
                    min="0"
                    value={transferForm.receivedAmount}
                    onValueChange={(nv) => {
                      setTransferReceivedTouched(true);
                      setTransferForm({ ...transferForm, receivedAmount: nv });
                    }}
                    placeholder={
                      transferFxPreview.state === "ok"
                        ? fxPreviewText(transferFxPreview.converted, toAcct?.currency ?? displayCurrency)
                        : `0.${"0".repeat(currencyDecimals(toAcct?.currency ?? displayCurrency))}`
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    {isAsBooked
                      ? "Saved from the original transfer. Override with the actual amount your bank credited."
                      : "Pre-filled from market FX. Override with the actual amount your bank credited."}
                  </p>
                  {showMarketRef && transferFxPreview.state === "ok" && (
                    <p className="text-xs text-muted-foreground">
                      Market rate on {formatDate(transferFxPreview.date)}:{" "}
                      {transferFxPreview.rate.toFixed(6)} ({transferFxPreview.source}) →{" "}
                      {formatCurrency(transferFxPreview.converted, transferFxPreview.to)}
                    </p>
                  )}
                  {transferFxPreview.state === "needs-override" && (
                    <p className="text-xs text-warning">
                      No FX rate cached for this pair —{" "}
                      <Link href="/settings/general" className="underline">
                        add a custom rate
                      </Link>{" "}
                      or type the amount manually.
                    </p>
                  )}
                  {transferFxPreview.state === "error" && (
                    <p className="text-xs text-destructive">{transferFxPreview.message}</p>
                  )}
                </div>
              );
            })()}

            <div className="space-y-1.5">
              <Label>Note (applied to both legs)</Label>
              <AutoTextarea
                value={transferForm.note}
                onChange={(e) => setTransferForm({ ...transferForm, note: e.target.value })}
                placeholder="e.g. rent buffer"
                className={NOTE_TEXTAREA_CLASS}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Tags (comma-separated, applied to both legs)</Label>
              <Input
                value={transferForm.tags}
                onChange={(e) => setTransferForm({ ...transferForm, tags: e.target.value })}
              />
            </div>

            {transferEdit && (() => {
              const debit = editingTx;
              const credit = transferEditCredit;
              if (!debit && !credit) return null;
              const createdCandidates = [debit?.createdAt, credit?.createdAt]
                .filter((v): v is string => !!v)
                .map((v) => new Date(v).getTime())
                .filter((v) => !Number.isNaN(v));
              const updatedCandidates = [debit?.updatedAt, credit?.updatedAt]
                .filter((v): v is string => !!v)
                .map((v) => new Date(v).getTime())
                .filter((v) => !Number.isNaN(v));
              const created = createdCandidates.length
                ? new Date(Math.min(...createdCandidates)).toLocaleString()
                : null;
              const updated = updatedCandidates.length
                ? new Date(Math.max(...updatedCandidates)).toLocaleString()
                : null;
              const src = debit?.source ?? credit?.source ?? null;
              const sourceLabel = src ? labelForSource(src) : null;
              if (!created && !updated && !sourceLabel) return null;
              return (
                <div className="text-xs text-muted-foreground border-t pt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
                  {created && <span>Created {created}</span>}
                  {updated && <span>· Updated {updated}</span>}
                  {sourceLabel && (
                    <Badge variant="outline" className="text-xs py-0 px-1.5">
                      {sourceLabel}
                    </Badge>
                  )}
                </div>
              );
            })()}

            {submitError && (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {submitError.message}{" "}
                {submitError.currency && (
                  <Link href="/settings/general" className="underline hover:no-underline">
                    Add a custom rate
                  </Link>
                )}
              </div>
            )}

            {variant === "dialog" && (
              <div className="flex gap-2">
                <Button type="submit" className="flex-1">
                  {transferEdit ? "Update Transfer" : "Create Transfer"}
                </Button>
              </div>
            )}
          </form>
        )}
    </>
  );
}
