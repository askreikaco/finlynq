"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Combobox, type ComboboxItemShape } from "@/components/ui/combobox";
import { useDropdownOrder } from "@/components/dropdown-order-provider";
import { useDisplayCurrency } from "@/components/currency-provider";
import { useActiveCurrencies } from "@/lib/hooks/useActiveCurrencies";
import { AmountInput } from "@/components/amount-input";
import { parseSaveError } from "@/lib/save-error";
import { TW } from "@/lib/design/tokens";
import { FREQUENCY_LABELS, SUBSCRIPTION_FREQUENCIES, frequencyOrMonthly } from "@/lib/subscriptions/schedule";
import type { Subscription } from "./types";

export type SubscriptionDraft = {
  name: string;
  amount: string;
  currency: string;
  frequency: string;
  categoryId: string;
  accountId: string;
  nextDate: string;
  notes: string;
  cancelReminderDate: string;
};

export const EMPTY_DRAFT: SubscriptionDraft = {
  name: "",
  amount: "",
  currency: "",
  frequency: "monthly",
  categoryId: "",
  accountId: "",
  nextDate: "",
  notes: "",
  cancelReminderDate: "",
};

export function draftFromSubscription(sub: Subscription): SubscriptionDraft {
  return {
    name: sub.name ?? "",
    amount: String(sub.amount),
    currency: sub.currency,
    frequency: frequencyOrMonthly(sub.frequency),
    categoryId: sub.categoryId ? String(sub.categoryId) : "",
    accountId: sub.accountId ? String(sub.accountId) : "",
    nextDate: sub.nextDate ?? "",
    notes: sub.notes ?? "",
    cancelReminderDate: sub.cancelReminderDate ?? "",
  };
}

type Option = { id: number; name: string | null };

export interface SubscriptionFormProps {
  mode: "create" | "edit";
  /** edit: the subscription being edited (PUT). */
  editing?: Subscription | null;
  /** create: seed (blank, or a detected payment under review from the query string). */
  initial: SubscriptionDraft;
  categories: Option[];
  accounts: Option[];
  onCancel: () => void;
  /** Called after a successful save; the page navigates away. */
  onSaved: () => void;
}

const ROW = `flex ${TW.rowTall} items-center gap-3 px-4 py-2`;
const ROW_LABEL = `${TW.rowLabel} shrink-0 text-sm text-muted-foreground`;
const ROW_CONTROL = "border-0 bg-transparent px-0 shadow-none focus-visible:border-transparent focus-visible:ring-0 dark:bg-transparent";

function Row({ label, htmlFor, children }: { label: string; htmlFor?: string; children: React.ReactNode }) {
  return (
    <div className={ROW}>
      <Label htmlFor={htmlFor} className={ROW_LABEL}>{label}</Label>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

/**
 * Add / edit a subscription, rendered by /subscriptions/new and
 * /subscriptions/[id]/edit. One payload builder for both modes. Keeps the
 * user's input on any failure.
 */
export function SubscriptionForm({ mode, editing, initial, categories, accounts, onCancel, onSaved }: SubscriptionFormProps) {
  const { displayCurrency } = useDisplayCurrency();
  const isEdit = mode === "edit" && !!editing;
  const [form, setForm] = useState<SubscriptionDraft>(() => (isEdit && editing ? draftFromSubscription(editing) : initial));
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const sortAccount = useDropdownOrder("account");
  const sortCategory = useDropdownOrder("category");
  const sortCurrency = useDropdownOrder("currency");

  // The currency dropdown is driven by the user's own active set, never a
  // hardcoded list (#291). `form.currency` stays empty until the user picks one
  // and late-binds to the display currency, so the async CurrencyProvider fetch
  // can't be captured stale.
  const formCurrency = form.currency || displayCurrency;
  const currencyOptions = useActiveCurrencies(formCurrency);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    const amount = parseFloat(form.amount);
    if (!form.name.trim()) return setError("Name is required");
    if (!Number.isFinite(amount) || amount <= 0) return setError("Amount must be greater than 0");

    const payload = {
      name: form.name.trim(),
      amount,
      currency: formCurrency,
      frequency: form.frequency,
      categoryId: form.categoryId ? parseInt(form.categoryId) : null,
      accountId: form.accountId ? parseInt(form.accountId) : null,
      nextDate: form.nextDate || null,
      notes: form.notes || null,
      cancelReminderDate: form.cancelReminderDate || null,
    };

    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/subscriptions", {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isEdit && editing ? { id: editing.id, ...payload } : payload),
      });
      if (!res.ok) {
        setError(await parseSaveError(res, "Failed to save subscription"));
        return;
      }
      onSaved();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
        <Row label="Name" htmlFor="sub-name">
          <Input
            id="sub-name"
            className={ROW_CONTROL}
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="e.g. Netflix, car insurance, domain renewal"
            required
          />
        </Row>
        <Row label="Amount per payment" htmlFor="sub-amount">
          <AmountInput
            id="sub-amount"
            className={ROW_CONTROL}
            step="0.01"
            value={form.amount}
            onValueChange={(v) => setForm({ ...form, amount: v })}
            required
          />
        </Row>
        <Row label="How often">
          <Select value={form.frequency} onValueChange={(v) => setForm({ ...form, frequency: v ?? "monthly" })}>
            <SelectTrigger className={ROW_CONTROL}>
              <SelectValue>{(v: unknown) => FREQUENCY_LABELS[frequencyOrMonthly(String(v ?? ""))]}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {SUBSCRIPTION_FREQUENCIES.map((f) => (
                <SelectItem key={f} value={f}>{FREQUENCY_LABELS[f]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Row>
        <Row label="Currency">
          <Combobox
            value={formCurrency}
            onValueChange={(v) => setForm({ ...form, currency: v || displayCurrency })}
            items={sortCurrency(
              currencyOptions.map((c): ComboboxItemShape => ({ value: c, label: c })),
              (c) => c.value,
              (a, z) => (a.label ?? "").localeCompare(z.label ?? ""),
            )}
            placeholder={displayCurrency}
            searchPlaceholder="Search…"
            emptyMessage="No matches"
            className="w-full"
          />
        </Row>
        <Row label="Next payment" htmlFor="sub-next">
          <Input
            id="sub-next"
            className={ROW_CONTROL}
            type="date"
            value={form.nextDate}
            onChange={(e) => setForm({ ...form, nextDate: e.target.value })}
          />
        </Row>
        <Row label="Category">
          <Combobox
            value={form.categoryId}
            onValueChange={(v) => setForm({ ...form, categoryId: v })}
            items={sortCategory(
              categories.map((c): ComboboxItemShape => ({ value: String(c.id), label: c.name ?? "" })),
              (c) => Number(c.value),
              (a, z) => (a.label ?? "").localeCompare(z.label ?? ""),
            )}
            placeholder="None"
            searchPlaceholder="Search categories…"
            emptyMessage="No matches"
            className="w-full"
          />
        </Row>
        <Row label="Paid from">
          <Combobox
            value={form.accountId}
            onValueChange={(v) => setForm({ ...form, accountId: v })}
            items={sortAccount(
              accounts.map((a): ComboboxItemShape => ({ value: String(a.id), label: a.name ?? "" })),
              (a) => Number(a.value),
              (a, z) => (a.label ?? "").localeCompare(z.label ?? ""),
            )}
            placeholder="None"
            searchPlaceholder="Search accounts…"
            emptyMessage="No matches"
            className="w-full"
          />
        </Row>
        <Row label="Remind me to cancel on" htmlFor="sub-reminder">
          <Input
            id="sub-reminder"
            className={ROW_CONTROL}
            type="date"
            value={form.cancelReminderDate}
            onChange={(e) => setForm({ ...form, cancelReminderDate: e.target.value })}
          />
        </Row>
        <Row label="Notes" htmlFor="sub-notes">
          <Input id="sub-notes" className={ROW_CONTROL} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </Row>
      </div>
      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
      <div className="flex gap-2">
        <Button type="button" variant="outline" className="flex-1" onClick={onCancel} disabled={saving}>Cancel</Button>
        <Button type="submit" className="flex-1" disabled={saving}>
          {saving ? "Saving…" : isEdit ? "Save changes" : "Add subscription"}
        </Button>
      </div>
    </form>
  );
}
