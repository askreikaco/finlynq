"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { isLocalWriteQueueActive, queueOfflineEntityEdit } from "@/lib/data/local-write-queue";
import { isNetworkFailure } from "@/lib/transactions/entry-mode";
import { Button } from "@/components/ui/button";
import { useActiveCurrencies } from "@/lib/hooks/useActiveCurrencies";
import { useDropdownOrder } from "@/components/dropdown-order-provider";
import { ACCOUNT_GROUP_DEFAULTS } from "@/lib/accounts/groups";
import { todayISO } from "@/lib/utils/date";
import {
  loadOpeningBalance,
  saveOpeningBalance,
  type OpeningBalance,
} from "@/lib/accounts/opening-balance-client";
import { cn } from "@/lib/utils";
import { Field, FieldGroup, type FieldComboboxOption } from "@/components/ui/field";
import { GroupField } from "./group-field";

const ACCOUNT_TYPES = [
  { value: "A", label: "Asset" },
  { value: "L", label: "Liability" },
];
const ACCOUNT_TYPE_LABELS: Record<string, string> = Object.fromEntries(
  ACCOUNT_TYPES.map((t) => [t.value, t.label]),
);

export type AccountFormAccount = {
  id: number;
  name: string;
  type: string;
  group: string;
  currency: string;
  note?: string | null;
  alias?: string | null;
  isInvestment?: boolean;
  archived?: boolean;
  invisible?: boolean;
};

type FormState = {
  name: string;
  alias: string;
  type: string;
  group: string;
  currency: string;
  note: string;
  isInvestment: boolean;
  invisible: boolean;
  obAmount: string;
  obDate: string;
};

function blankForm(defaultCurrency: string): FormState {
  return {
    name: "",
    alias: "",
    type: "A",
    group: ACCOUNT_GROUP_DEFAULTS.A?.[0] ?? "",
    currency: defaultCurrency,
    note: "",
    isInvestment: false,
    invisible: false,
    obAmount: "",
    obDate: todayISO(),
  };
}

function formFromAccount(a: AccountFormAccount): FormState {
  return {
    name: a.name,
    alias: a.alias ?? "",
    type: a.type,
    group: a.group || "",
    currency: a.currency,
    note: a.note ?? "",
    isInvestment: a.isInvestment === true,
    invisible: a.invisible === true,
    obAmount: "",
    obDate: todayISO(),
  };
}

/** "stack" = label above each field. "rows" = label-left rows in one card (New / Edit account pages). */
export type AccountFormVariant = "stack" | "rows";

export interface AccountFormProps {
  mode: "create" | "edit";
  /** edit: the account being edited. */
  account?: AccountFormAccount | null;
  /** create: default currency (the user's reporting/display currency). */
  defaultCurrency?: string;
  /** group-name suggestions for the GroupField. */
  existingGroups?: string[];
  /** optional alias-clash warning; excludeId is the account being edited (null on create). */
  aliasWarning?: (alias: string, excludeId: number | null) => string;
  /** Re-seeds the form each time this becomes true. Default true. */
  open?: boolean;
  variant?: AccountFormVariant;
  /** External busy flag (the edit page's archive / unarchive / delete in progress). */
  busy?: boolean;
  onCancel: () => void;
  onCreated?: (account: AccountFormAccount) => void;
  onSaved?: (account: AccountFormAccount) => void;
  /** Called after a successful save (the page navigates away here). */
  onComplete?: () => void;
}

const INFO = {
  name: "The account's display name.",
  alias:
    "Optional. Short nickname used when matching transactions, e.g. the last 4 digits of a card or a receipt label. " +
    "It must be unique: a name or alias shared with another account makes matches ambiguous.",
  type: "Credit cards should be Liability accounts; the balance is the amount owed.",
  group: "Free text. Pick a suggestion or type any group name, e.g. Checking or Emergency Fund.",
  currency: "The currency this account is kept in.",
  note: "Optional free-text note, e.g. Joint account.",
  openingBalance:
    "Optional. A single starting-balance entry for this account. Set the date to when the account opened so " +
    "Balance Over Time and Net Worth history start from the right point. Clearing the amount zeroes " +
    "the entry; it is not deleted.",
  isInvestment:
    'When enabled, every transaction in this account must reference a portfolio holding (a security or the auto-created "Cash" sleeve). ' +
    "Turning this on now will reassign any unattributed transactions to this account's Cash holding.",
  invisible: "Hidden from net worth, totals, reports and metrics. The account and its transactions stay here.",
} as const;

/**
 * Shared account form (create + edit): the same fields, validation, opening
 * balance and save logic on the New account page (create) and the Edit account
 * page (edit). Owns the form state; the caller owns the chrome (page, tabs, actions).
 */
export function AccountForm({
  mode,
  account,
  defaultCurrency = "USD",
  existingGroups = [],
  aliasWarning,
  open = true,
  variant = "stack",
  busy = false,
  onCancel,
  onCreated,
  onSaved,
  onComplete,
}: AccountFormProps) {
  const [form, setForm] = useState<FormState>(() => blankForm(defaultCurrency));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [obOriginal, setObOriginal] = useState<OpeningBalance | null>(null);
  // Once a create POST has succeeded, remember the id so a retry (e.g. after an
  // opening-balance hiccup) doesn't create a SECOND account.
  const createdIdRef = useRef<number | null>(null);

  const currencyOptions = useActiveCurrencies(form.currency);
  const sortCurrency = useDropdownOrder("currency");

  const isEdit = mode === "edit";

  // Seed the form whenever it opens.
  useEffect(() => {
    if (!open) return;
    createdIdRef.current = null;
    setErrors({});
    setSaveError("");
    if (isEdit && account) {
      setForm(formFromAccount(account));
      setObOriginal(null);
      // Opening balance lives in a backing transaction; load it for cash
      // accounts only (hidden for investment accounts).
      if (account.isInvestment !== true) {
        void loadOpeningBalance(account.id).then((ob) => {
          setObOriginal(ob);
          setForm((f) => ({
            ...f,
            obAmount: ob ? String(ob.amount) : "",
            obDate: ob ? ob.date : todayISO(),
          }));
        });
      }
    } else {
      setForm(blankForm(defaultCurrency));
      setObOriginal(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function setType(t: string) {
    // Changing type seeds the default group for that type.
    const defaultGroup = ACCOUNT_GROUP_DEFAULTS[t as "A" | "L"]?.[0] ?? "";
    setForm((f) => ({ ...f, type: t, group: defaultGroup }));
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!form.name.trim()) errs.name = "Name is required";
    if (!isEdit && !form.type) errs.type = "Type is required";
    if (!isEdit && !form.group.trim()) errs.group = "Group is required";
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setSaving(true);
    setSaveError("");
    try {
      const payload = {
        name: form.name.trim(),
        type: form.type,
        group: form.group.trim(),
        currency: form.currency,
        note: form.note.trim(),
        alias: form.alias.trim() || (isEdit ? null : undefined),
        isInvestment: form.isInvestment,
        invisible: form.invisible,
      };

      let accountId: number;
      let saved: AccountFormAccount;

      if (isEdit && account) {
        accountId = account.id;
        const res = await fetch("/api/accounts", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: account.id, ...payload }),
        });
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          setSaveError(d.error ?? "Failed to update account");
          return;
        }
        saved = await res.json();
      } else if (createdIdRef.current != null) {
        // Account was already created on a prior submit that failed at the
        // opening-balance step — don't create a duplicate, just retry the OB.
        accountId = createdIdRef.current;
        saved = { ...payload, id: accountId, alias: payload.alias ?? null };
      } else {
        const res = await fetch("/api/accounts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          setSaveError(d.error ?? "Failed to create account");
          return;
        }
        saved = await res.json();
        accountId = saved.id;
        createdIdRef.current = accountId;
      }

      // Persist the opening balance (cash accounts only; no-op when unchanged).
      const obRes = await saveOpeningBalance(
        accountId,
        form.isInvestment,
        { amount: form.obAmount, date: form.obDate },
        obOriginal,
      );
      if (!obRes.ok) {
        setSaveError(
          isEdit
            ? obRes.error
            : `Account created, but the opening balance failed: ${obRes.error}`,
        );
        // Edit: the account update committed; surface to the parent so the page
        // refreshes, but keep the form open with the error.
        if (isEdit) onSaved?.(saved);
        return;
      }

      if (isEdit) onSaved?.(saved);
      else onCreated?.(saved);
      onComplete?.();
    } catch (netErr) {
      // Offline queue (local-first L3): an edit of the editable fields is kept on this device. Creates and
      // type/currency/investment/opening-balance changes stay online (see queueAccountEditOffline).
      if (isEdit && account && (await queueAccountEditOffline(netErr, account))) {
        onSaved?.({ ...account, name: form.name.trim(), group: form.group.trim(), note: form.note.trim(), alias: form.alias.trim() || null, invisible: form.invisible });
        onComplete?.();
        return;
      }
      setSaveError(isEdit ? "Failed to update account" : "Failed to create account");
    } finally {
      setSaving(false);
    }
  }

  /** Saves the edit on this device when the request could not reach the server. False = not queued (online-only change). */
  async function queueAccountEditOffline(err: unknown, base: AccountFormAccount): Promise<boolean> {
    if (!isLocalWriteQueueActive() || !isNetworkFailure(err)) return false;
    const onlineOnly =
      form.type !== base.type || form.currency !== base.currency || form.isInvestment !== (base.isInvestment ?? false) || form.obAmount !== (obOriginal?.amount ?? form.obAmount) || form.obDate !== (obOriginal?.date ?? form.obDate);
    if (onlineOnly) return false;
    const next: Record<string, string | number | null> = {
      name: form.name.trim(),
      group: form.group.trim(),
      note: form.note.trim(),
      alias: form.alias.trim() || null,
      invisible: form.invisible ? 1 : 0,
    };
    const current: Record<string, string | number | null> = {
      name: base.name,
      group: base.group,
      note: base.note ?? "",
      alias: base.alias ?? null,
      invisible: base.invisible ? 1 : 0,
    };
    const patch: Record<string, string | number | null> = {};
    for (const k of Object.keys(next)) if (next[k] !== current[k]) patch[k] = next[k];
    if (Object.keys(patch).length === 0) return true;
    return queueOfflineEntityEdit("account", base.id, patch, current);
  }

  const aliasMsg = aliasWarning?.(form.alias, account?.id ?? null) ?? "";
  const v = variant;

  // "rows" (the edit page / pane) = one divided card; "stack" (dialog) = plain stacked fields. Same Fields either way.
  const fields = (
    <>
      <Field
        label="Account Name"
        info={INFO.name}
        id="account-form-name"
        error={errors.name}
        value={form.name}
        onChange={(e) => setForm({ ...form, name: e.target.value })}
        placeholder="e.g. TD Chequing"
        autoFocus
      />

      <Field
        label="Alias"
        optional
        info={INFO.alias}
        id="account-form-alias"
        warning={aliasMsg || undefined}
        value={form.alias}
        onChange={(e) => setForm({ ...form, alias: e.target.value })}
        placeholder="e.g. 1234 or Visa4242"
        maxLength={64}
      />

      <Field
        label="Type"
        control="select"
        info={INFO.type}
        error={errors.type}
        value={form.type}
        onValueChange={(t) => setType(t || "A")}
        options={ACCOUNT_TYPES.map((t) => ({ value: t.value, label: t.label }))}
      />

      <GroupField
        id="account-dialog-group"
        info={INFO.group}
        error={errors.group}
        type={form.type}
        value={form.group}
        existingGroups={existingGroups}
        onChange={(g) => setForm({ ...form, group: g })}
      />

      <Field
        label="Currency"
        control="combobox"
        info={INFO.currency}
        value={form.currency}
        onValueChange={(c) => setForm({ ...form, currency: c || defaultCurrency })}
        options={sortCurrency(
          currencyOptions.map((c): FieldComboboxOption => ({ value: c, label: c })),
          (c) => c.value,
          (a, z) => (a.label ?? "").localeCompare(z.label ?? ""),
        )}
        placeholder={defaultCurrency}
        searchPlaceholder="Search…"
        emptyMessage="No matches"
      />

      <Field
        label="Note"
        optional
        info={INFO.note}
        id="account-form-note"
        value={form.note}
        onChange={(e) => setForm({ ...form, note: e.target.value })}
        placeholder="e.g. Joint account"
      />

      {/* Opening balance (FINLYNQ-206) — cash accounts only. Backed by ONE
          kind='opening_balance' transaction; clearing zeroes it (never
          deletes). Hidden when "Investment account" is checked. */}
      {!form.isInvestment && (
        <>
          <Field
            label="Opening balance"
            optional
            control="amount"
            info={INFO.openingBalance}
            id="account-dialog-ob-amount"
            step="0.01"
            value={form.obAmount}
            onValueChange={(nv) => setForm({ ...form, obAmount: nv })}
            placeholder="0.00"
          />
          <Field
            label="Date"
            control="date"
            id="account-dialog-ob-date"
            value={form.obDate}
            onChange={(e) => setForm({ ...form, obDate: e.target.value })}
          />
        </>
      )}

      <Field
        label="Investment account"
        control="switch"
        info={INFO.isInvestment}
        id="account-dialog-isInvestment"
        checked={form.isInvestment}
        onCheckedChange={(checked) => setForm({ ...form, isInvestment: checked })}
      />

      <Field
        label="Invisible"
        control="switch"
        info={INFO.invisible}
        id="account-dialog-invisible"
        checked={form.invisible}
        onCheckedChange={(checked) => setForm({ ...form, invisible: checked })}
      />
    </>
  );

  return (
    <form onSubmit={handleSave} className="space-y-4">
      {v === "rows" ? <FieldGroup>{fields}</FieldGroup> : <div className="space-y-4">{fields}</div>}

      {saveError && <p className="text-sm text-destructive">{saveError}</p>}

      <div className={cn("flex gap-2", v === "stack" ? "pt-1" : "pt-2")}>
        <Button type="button" variant="outline" className="flex-1 pointer-coarse:min-h-row" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" className="flex-1 pointer-coarse:min-h-row" disabled={saving || busy}>
          {saving ? (isEdit ? "Saving…" : "Creating…") : isEdit ? "Save Changes" : "Create Account"}
        </Button>
      </div>

    </form>
  );
}
