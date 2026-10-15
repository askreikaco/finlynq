"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { isLocalWriteQueueActive, queueOfflineEntityEdit } from "@/lib/data/local-write-queue";
import { isNetworkFailure } from "@/lib/transactions/entry-mode";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Combobox, type ComboboxItemShape } from "@/components/ui/combobox";
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
import { TW } from "@/lib/design/tokens";
import { GroupField } from "./group-field";
import { AmountInput } from "@/components/amount-input";
import { FieldLabel, FormField } from "@/components/forms";

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
 * One field. Label + (i) tip on top, control below, then at most a short error / warning. Same layout in the 25% pane,
 * the page and the stacked variant ("rows" = padded rows inside one divided card).
 */
function Field({
  variant,
  label,
  htmlFor,
  info,
  error,
  warning,
  children,
}: {
  variant: AccountFormVariant;
  label: string;
  htmlFor?: string;
  info?: ReactNode;
  error?: string;
  warning?: string;
  children: ReactNode;
}) {
  return (
    <FormField
      label={label}
      htmlFor={htmlFor}
      info={info}
      error={error}
      warning={warning}
      className={variant === "rows" ? "px-4 py-3" : undefined}
    >
      {children}
    </FormField>
  );
}

function CheckField({
  variant,
  id,
  label,
  checked,
  onChange,
  info,
}: {
  variant: AccountFormVariant;
  id: string;
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  info: ReactNode;
}) {
  return (
    <div className={cn("flex items-center justify-between gap-2", variant === "rows" && `px-4 py-2 ${TW.row}`)}>
      <FieldLabel label={label} htmlFor={id} info={info} className="flex-1" />
      <Switch id={id} checked={checked} onCheckedChange={(v) => onChange(v)} className="shrink-0" />
    </div>
  );
}

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

  // Type + Group share a line in the stacked dialog; separate rows on the page / pane.
  const pair = (node: ReactNode) =>
    v === "stack" ? <div className="grid grid-cols-2 gap-3">{node}</div> : <>{node}</>;

  return (
    <form onSubmit={handleSave} className="space-y-4">
      <div
        className={cn(
          v === "rows" && `[&>*:not(:last-child)]:shadow-[var(--list-divider)] overflow-hidden ${TW.group} border border-border bg-card`,
          v === "stack" && "space-y-4",
        )}
      >
        <Field variant={v} label="Account Name" htmlFor="account-form-name" info={INFO.name} error={errors.name}>
          <Input
            id="account-form-name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="e.g. TD Chequing"
            autoFocus
          />
        </Field>

        <Field variant={v} label="Alias" htmlFor="account-form-alias" info={INFO.alias} warning={aliasMsg}>
          <Input
            id="account-form-alias"
            value={form.alias}
            onChange={(e) => setForm({ ...form, alias: e.target.value })}
            placeholder="e.g. 1234"
            maxLength={64}
          />
        </Field>

        {pair(
          <>
            <Field variant={v} label="Type" info={INFO.type} error={errors.type}>
              <Select items={ACCOUNT_TYPE_LABELS} value={form.type} onValueChange={(t) => setType(t ?? "A")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ACCOUNT_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field variant={v} label="Group" htmlFor="account-dialog-group" info={INFO.group} error={errors.group}>
              <GroupField
                inputId="account-dialog-group"
                type={form.type}
                value={form.group}
                existingGroups={existingGroups}
                onChange={(g) => setForm({ ...form, group: g })}
              />
            </Field>
          </>,
        )}

        <Field variant={v} label="Currency" info={INFO.currency}>
          <Combobox
            value={form.currency}
            onValueChange={(c) => setForm({ ...form, currency: c || defaultCurrency })}
            items={sortCurrency(
              currencyOptions.map((c): ComboboxItemShape => ({ value: c, label: c })),
              (c) => c.value,
              (a, z) => (a.label ?? "").localeCompare(z.label ?? ""),
            )}
            placeholder={defaultCurrency}
            searchPlaceholder="Search…"
            emptyMessage="No matches"
            className="w-full"
          />
        </Field>

        <Field variant={v} label="Note" htmlFor="account-form-note" info={INFO.note}>
          <Input
            id="account-form-note"
            value={form.note}
            onChange={(e) => setForm({ ...form, note: e.target.value })}
          />
        </Field>

        {/* Opening balance (FINLYNQ-206) — cash accounts only. Backed by ONE
            kind='opening_balance' transaction; clearing zeroes it (never
            deletes). Hidden when "Investment account" is checked. */}
        {!form.isInvestment &&
          (v === "stack" ? (
            <div className="space-y-2 rounded-lg border border-border/60 p-3">
              <FieldLabel label="Opening balance" info={INFO.openingBalance} />
              <div className="grid grid-cols-2 gap-3">
                <Field variant={v} label="Amount" htmlFor="account-dialog-ob-amount">
                  <AmountInput
                    id="account-dialog-ob-amount"
                    step="0.01"
                    value={form.obAmount}
                    onValueChange={(nv) => setForm({ ...form, obAmount: nv })}
                    placeholder="0.00"
                  />
                </Field>
                <Field variant={v} label="Date" htmlFor="account-dialog-ob-date">
                  <Input
                    id="account-dialog-ob-date"
                    type="date"
                    value={form.obDate}
                    onChange={(e) => setForm({ ...form, obDate: e.target.value })}
                  />
                </Field>
              </div>
            </div>
          ) : (
            <>
              <Field variant={v} label="Opening balance" htmlFor="account-dialog-ob-amount" info={INFO.openingBalance}>
                <AmountInput
                  id="account-dialog-ob-amount"
                  step="0.01"
                  value={form.obAmount}
                  onValueChange={(nv) => setForm({ ...form, obAmount: nv })}
                  placeholder="0.00"
                />
              </Field>
              <Field variant={v} label="Date" htmlFor="account-dialog-ob-date">
                <Input
                  id="account-dialog-ob-date"
                  type="date"
                  value={form.obDate}
                  onChange={(e) => setForm({ ...form, obDate: e.target.value })}
                />
              </Field>
            </>
          ))}

        <CheckField
          variant={v}
          id="account-dialog-isInvestment"
          label="Investment account"
          checked={form.isInvestment}
          onChange={(checked) => setForm({ ...form, isInvestment: checked })}
          info={INFO.isInvestment}
        />

        <CheckField
          variant={v}
          id="account-dialog-invisible"
          label="Invisible"
          checked={form.invisible}
          onChange={(checked) => setForm({ ...form, invisible: checked })}
          info={INFO.invisible}
        />
      </div>

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
