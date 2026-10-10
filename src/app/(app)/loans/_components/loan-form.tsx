"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Combobox, type ComboboxItemShape } from "@/components/ui/combobox";
import { useDropdownOrder } from "@/components/dropdown-order-provider";
import { useActiveCurrencies } from "@/lib/hooks/useActiveCurrencies";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { parseSaveError } from "@/lib/save-error";
import { AmountInput } from "@/components/amount-input";
import { FormGroup } from "@/components/forms";
import { TW } from "@/lib/design/tokens";
import { LOAN_TYPE_OPTIONS, type Loan, type LoanAccount } from "./loan-types";

const FREQUENCY_OPTIONS = [
  { value: "weekly", label: "Weekly" },
  { value: "biweekly", label: "Biweekly" },
  { value: "semi_monthly", label: "Semi-monthly" },
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "annual", label: "Annual" },
] as const;

const ROW = `flex ${TW.rowTall} items-center gap-3 px-4 py-2`;
const ROW_LABEL = `${TW.rowLabel} shrink-0 text-sm text-muted-foreground`;
const ROW_CONTROL = "border-0 bg-transparent px-0 shadow-none focus-visible:border-transparent focus-visible:ring-0 dark:bg-transparent";

function Row({ label, htmlFor, error, children }: { label: ReactNode; htmlFor?: string; error?: string; children: ReactNode }) {
  return (
    <div className={ROW}>
      <Label htmlFor={htmlFor} className={ROW_LABEL}>{label}</Label>
      <div className="min-w-0 flex-1 space-y-1">
        {children}
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
    </div>
  );
}

type FormState = {
  name: string; type: string; principal: string; currency: string; annualRate: string;
  termMonths: string; startDate: string; paymentAmount: string; paymentFrequency: string;
  extraPayment: string; residualValue: string; accountId: string;
};

function blankForm(currency: string): FormState {
  return {
    name: "", type: "mortgage", principal: "", currency, annualRate: "",
    termMonths: "", startDate: "", paymentAmount: "", paymentFrequency: "monthly",
    extraPayment: "0", residualValue: "", accountId: "",
  };
}

/** Seed from the loan's NATIVE fields — never the converted companions, or
 *  saving would silently rewrite the principal in the display currency. */
function formFromLoan(loan: Loan): FormState {
  return {
    name: loan.name ?? "",
    type: loan.type,
    principal: String(loan.principal),
    currency: loan.currency,
    annualRate: String(loan.annualRate),
    termMonths: loan.termMonths == null ? "" : String(loan.termMonths),
    startDate: loan.startDate,
    paymentAmount: loan.paymentAmount == null ? "" : String(loan.paymentAmount),
    paymentFrequency: loan.paymentFrequency,
    extraPayment: String(loan.extraPayment ?? 0),
    residualValue: loan.residualValue == null ? "" : String(loan.residualValue),
    accountId: loan.accountId == null ? "" : String(loan.accountId),
  };
}

export interface LoanFormProps {
  mode: "create" | "edit";
  /** edit: the loan being edited. */
  loan?: Loan | null;
  /** create: the user's display currency (seeded once the provider resolves). */
  defaultCurrency: string;
  accounts: LoanAccount[];
  onCancel: () => void;
  /** Called after a successful save; the page navigates away. */
  onSaved: () => void;
}

/**
 * Shared loan form (create + edit) for /loans/new and /loans/[id]/edit. One
 * payload builder for both verbs, so a field added here reaches create and
 * edit together. Keeps the user's input on any failure.
 */
export function LoanForm({ mode, loan, defaultCurrency, accounts, onCancel, onSaved }: LoanFormProps) {
  const isEdit = mode === "edit" && !!loan;
  const [form, setForm] = useState<FormState>(() => (isEdit && loan ? formFromLoan(loan) : blankForm(defaultCurrency)));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  // The display currency resolves asynchronously; until the user picks one,
  // a create form follows it (the old dialog seeded at open for the same reason).
  const [currencyTouched, setCurrencyTouched] = useState(false);
  const [pendingRedenominate, setPendingRedenominate] = useState<{ from: string; to: string } | null>(null);
  const currencyOptions = useActiveCurrencies(form.currency);
  const sortAccount = useDropdownOrder("account");

  useEffect(() => {
    if (!isEdit && !currencyTouched) setForm((f) => ({ ...f, currency: defaultCurrency }));
  }, [defaultCurrency, isEdit, currencyTouched]);

  function validateForm() {
    const e: Record<string, string> = {};
    if (!form.name.trim()) e.name = "Name is required";
    if (!form.principal || parseFloat(form.principal) <= 0) e.principal = "Principal must be greater than 0";
    if (!form.annualRate || parseFloat(form.annualRate) < 0) e.annualRate = "Rate must be 0 or more";
    if (form.annualRate && parseFloat(form.annualRate) > 100) e.annualRate = "Rate must be 100 or less";
    // FINLYNQ-136: term OR payment — payment-driven loans solve for the term.
    if (!form.termMonths && !form.paymentAmount) e.termMonths = "Enter a term or a payment amount";
    if (form.termMonths && parseInt(form.termMonths) <= 0) e.termMonths = "Term must be greater than 0";
    if (form.paymentAmount && parseFloat(form.paymentAmount) <= 0) e.paymentAmount = "Payment must be greater than 0";
    if (form.residualValue && form.principal && parseFloat(form.residualValue) >= parseFloat(form.principal)) e.residualValue = "Residual must be less than principal";
    if (!form.startDate) e.startDate = "Start date is required";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  // ONE payload shape for both verbs.
  function buildPayload() {
    return {
      name: form.name,
      type: form.type,
      principal: parseFloat(form.principal),
      currency: form.currency || defaultCurrency,
      annualRate: parseFloat(form.annualRate),
      termMonths: form.termMonths ? parseInt(form.termMonths) : null,
      startDate: form.startDate,
      paymentAmount: form.paymentAmount ? parseFloat(form.paymentAmount) : null,
      paymentFrequency: form.paymentFrequency,
      extraPayment: parseFloat(form.extraPayment) || 0,
      residualValue: form.type === "lease" && form.residualValue ? parseFloat(form.residualValue) : null,
      accountId: form.accountId ? parseInt(form.accountId) : null,
    };
  }

  async function doSave() {
    // `saving` gates re-entry — /api/loans has no idempotency key, so a
    // double-submit would book the loan twice.
    if (saving) return;
    setSaving(true);
    setPendingRedenominate(null);
    try {
      const res = await fetch("/api/loans", {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isEdit && loan ? { id: loan.id, ...buildPayload() } : buildPayload()),
      });
      if (!res.ok) {
        // e.g. payment below the period interest, or 423 with no DEK. Keep the
        // form open and the input intact.
        const message = await parseSaveError(res, isEdit ? "Failed to save loan" : "Failed to create loan");
        setErrors((prev) => ({ ...prev, form: message }));
        return;
      }
      onSaved();
    } catch {
      setErrors((prev) => ({ ...prev, form: "Couldn't reach the server. Check your connection and try again." }));
    } finally {
      setSaving(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (saving || !validateForm()) return;
    const from = isEdit ? loan?.currency : undefined;
    const to = form.currency || defaultCurrency;
    // Changing the currency of an EXISTING loan reinterprets its stored
    // numbers rather than converting them — confirm before that lands.
    if (isEdit && from && from !== to) {
      setPendingRedenominate({ from, to });
      return;
    }
    await doSave();
  }

  const isFormValid = form.name.trim() !== "" && form.principal !== "" && parseFloat(form.principal) > 0 && form.annualRate !== "" && parseFloat(form.annualRate) >= 0 && parseFloat(form.annualRate) <= 100 && (form.termMonths !== "" ? parseInt(form.termMonths) > 0 : form.paymentAmount !== "" && parseFloat(form.paymentAmount) > 0) && form.startDate !== "";

  return (
    <>
      <form onSubmit={handleSubmit} className="space-y-4">
        <FormGroup>
          <Row label="Name" htmlFor="loan-name" error={errors.name}>
            <Input id="loan-name" className={ROW_CONTROL} value={form.name} onChange={(e) => { setForm({ ...form, name: e.target.value }); setErrors({ ...errors, name: "" }); }} />
          </Row>
          <Row label="Type">
            <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v ?? "mortgage" })}>
              <SelectTrigger className={ROW_CONTROL}><SelectValue /></SelectTrigger>
              <SelectContent>
                {LOAN_TYPE_OPTIONS.map((t) => (<SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>))}
              </SelectContent>
            </Select>
          </Row>
          <Row label="Currency">
            <Select value={form.currency} onValueChange={(v) => { setCurrencyTouched(true); setForm({ ...form, currency: v ?? defaultCurrency }); }}>
              <SelectTrigger className={ROW_CONTROL}><SelectValue /></SelectTrigger>
              <SelectContent>
                {currencyOptions.map((c) => (<SelectItem key={c} value={c}>{c}</SelectItem>))}
              </SelectContent>
            </Select>
          </Row>
          <Row label="Principal" htmlFor="loan-principal" error={errors.principal}>
            <AmountInput id="loan-principal" className={ROW_CONTROL} step="0.01" value={form.principal} onValueChange={(nv) => { setForm({ ...form, principal: nv }); setErrors({ ...errors, principal: "" }); }} />
          </Row>
          <Row label="Annual Rate (%)" htmlFor="loan-rate" error={errors.annualRate}>
            <AmountInput id="loan-rate" className={ROW_CONTROL} step="0.01" value={form.annualRate} onValueChange={(nv) => { setForm({ ...form, annualRate: nv }); setErrors({ ...errors, annualRate: "" }); }} />
          </Row>
          <Row label="Term (months)" htmlFor="loan-term" error={errors.termMonths}>
            <Input id="loan-term" className={ROW_CONTROL} type="number" placeholder="From payment" value={form.termMonths} onChange={(e) => { setForm({ ...form, termMonths: e.target.value }); setErrors({ ...errors, termMonths: "" }); }} />
          </Row>
          <Row label="Payment" htmlFor="loan-payment" error={errors.paymentAmount}>
            <AmountInput id="loan-payment" className={ROW_CONTROL} step="0.01" placeholder="From term" value={form.paymentAmount} onValueChange={(nv) => { setForm({ ...form, paymentAmount: nv }); setErrors({ ...errors, paymentAmount: "", termMonths: "" }); }} />
          </Row>
          <Row label="Frequency">
            <Select value={form.paymentFrequency} onValueChange={(v) => setForm({ ...form, paymentFrequency: v ?? "monthly" })}>
              <SelectTrigger className={ROW_CONTROL}><SelectValue /></SelectTrigger>
              <SelectContent>
                {FREQUENCY_OPTIONS.map((f) => (<SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>))}
              </SelectContent>
            </Select>
          </Row>
          <Row label="Extra/Payment">
            <AmountInput className={ROW_CONTROL} step="0.01" value={form.extraPayment} onValueChange={(nv) => setForm({ ...form, extraPayment: nv })} />
          </Row>
          <Row label="Start Date" htmlFor="loan-start" error={errors.startDate}>
            <Input id="loan-start" className={ROW_CONTROL} type="date" value={form.startDate} onChange={(e) => { setForm({ ...form, startDate: e.target.value }); setErrors({ ...errors, startDate: "" }); }} />
          </Row>
          {form.type === "lease" && (
            <Row label="Residual / Buyout" error={errors.residualValue}>
              <AmountInput className={ROW_CONTROL} step="0.01" placeholder="Balance at term end" value={form.residualValue} onValueChange={(nv) => { setForm({ ...form, residualValue: nv }); setErrors({ ...errors, residualValue: "" }); }} />
            </Row>
          )}
          <Row label="Linked account">
            <Combobox
              value={form.accountId}
              // Mirror the server's precedence (explicit > linked account >
              // display currency): picking an account moves the currency
              // with it, so the form can't imply one and store another.
              onValueChange={(v) => {
                const acct = accounts.find((a) => String(a.id) === v);
                if (acct?.currency) setCurrencyTouched(true);
                setForm((f) => ({ ...f, accountId: v, currency: acct?.currency || f.currency }));
              }}
              items={sortAccount(
                accounts.map((a): ComboboxItemShape => ({ value: String(a.id), label: a.name })),
                (a) => Number(a.value),
                (a, z) => (a.label ?? "").localeCompare(z.label ?? ""),
              )}
              placeholder="None"
              searchPlaceholder="Search accounts…"
              emptyMessage="No matches"
              className="w-full"
            />
          </Row>
        </FormGroup>
        {isEdit && loan && form.currency !== loan.currency && (
          <p className="text-xs text-warning">
            Changing the currency re-labels the amounts above as {form.currency}. It does not convert them.
          </p>
        )}
        {errors.form && <p className="text-xs text-destructive">{errors.form}</p>}
        <div className="flex gap-2">
          <Button type="button" variant="outline" className="flex-1" onClick={onCancel} disabled={saving}>Cancel</Button>
          <Button type="submit" className="flex-1" disabled={!isFormValid || saving}>
            {saving ? "Saving…" : isEdit ? "Save changes" : "Add loan"}
          </Button>
        </div>
      </form>

      {/* Re-denomination is not a conversion: the stored numbers stay put and
          only their currency label changes. Confirmed, never silent. */}
      <ConfirmDialog
        open={pendingRedenominate !== null}
        onOpenChange={(open) => { if (!open) setPendingRedenominate(null); }}
        title="Change loan currency?"
        description={
          <>
            This re-labels the loan from <strong>{pendingRedenominate?.from}</strong> to{" "}
            <strong>{pendingRedenominate?.to}</strong>. The amounts are <strong>not</strong> converted —
            a principal of {form.principal || "0"} stays {form.principal || "0"}, now read as{" "}
            {pendingRedenominate?.to}.
          </>
        }
        confirmLabel="Change currency"
        busy={saving}
        onConfirm={doSave}
      />
    </>
  );
}
