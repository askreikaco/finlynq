"use client";

/**
 * Shared email-import rule editor dialog (2026-06-16; multi-condition 2026-06-17).
 *
 * Two modes:
 *   - "manager"   — create/edit a rule from /settings/import (POST/PUT
 *                   /api/email-rules). No email context.
 *   - "fromEmail" — "Create rule from this email" on the Email tab. Pre-filled
 *                   from the landed email; shows a live "will record" preview
 *                   computed with the pure applyEmailTransform; on save creates
 *                   the rule AND records THIS email through the same mapping.
 *
 * A rule is an AND group of conditions over sender/subject/body/payee (text) +
 * amount (numeric). State is seeded once via useState initializers — the parent
 * mounts this with a `key` (rule id / email id) so each open gets a fresh form.
 */

import { useMemo, useState } from "react";
import { Overlay } from "@/components/ui/overlay";
import { Button } from "@/components/ui/button";
import { Plus, Trash2 } from "lucide-react";
import { applyEmailTransform } from "@/lib/email-import/apply-transform";
import { formatCurrency } from "@/lib/currency";
import { SUPPORTED_FIAT_CURRENCIES } from "@/lib/fx/supported-currencies";
import { safeAccountName, safeName } from "@/lib/safe-name";
import { Field, FieldGroup } from "@/components/ui/field";
import {
  EMAIL_CONDITION_FIELDS,
  defaultEmailConditionForField,
  type EmailCondition,
  type EmailConditionField,
} from "@/lib/email-rules/schema";

export interface RuleDraftInit {
  id?: number | null;
  name?: string;
  conditions?: EmailCondition[];
  accountId?: number | null;
  categoryId?: number | null;
  /** FINLYNQ-189 — transfer destination. When set, the rule records a transfer
   *  (account → this account) instead of a category/expense. Mutually exclusive
   *  with categoryId. */
  transferDestAccountId?: number | null;
  mode?: "auto" | "review";
  flipSign?: boolean;
  dateSource?: "parsed" | "received";
  payeeOverride?: string | null;
  /** Recorded-currency override (ISO). null ⇒ use the account currency. */
  currency?: string | null;
}

interface AccountOpt {
  id: number;
  name: string | null;
  alias?: string | null;
  currency: string;
  isInvestment?: boolean;
  archived?: boolean;
}
interface CategoryOpt {
  id: number;
  name: string | null;
}

export interface FromEmailCtx {
  emailId: string;
  candidate: { date: string; amount: number; currency: string; payee: string } | null;
  receivedAt: string; // ISO
}

const PLACEHOLDER: Record<EmailConditionField, string> = {
  sender: "alerts@chase.com",
  subject: "transaction alert",
  body: "withdrawal",
  payee: "STARBUCKS",
  amount: "",
};

function toNum(s: string): number {
  if (s.trim() === "") return 0;
  const n = Number(s);
  return Number.isNaN(n) ? 0 : n;
}

/** One condition row — field/op/value selects; field-change swaps the whole row
 *  to a fresh typed default (mirrors the transaction-rules editor). */
function EmailConditionRow({
  cond,
  onChange,
  onRemove,
  canRemove,
}: {
  cond: EmailCondition;
  onChange: (next: EmailCondition) => void;
  onRemove: () => void;
  canRemove: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <Field
        control="select"
        value={cond.field}
        onValueChange={(v) => onChange(defaultEmailConditionForField((v as EmailConditionField) ?? "sender"))}
        compact
        className="w-[110px]"
        options={EMAIL_CONDITION_FIELDS.map((f) => ({ value: f.value, label: f.label }))}
      />

      {cond.field === "amount" ? (
        <>
          <Field
            control="select"
            value={cond.op}
            onValueChange={(v) => {
              const op = (v as "gt" | "lt" | "between") ?? "lt";
              onChange(
                op === "between"
                  ? { field: "amount", op: "between", min: 0, max: 0 }
                  : { field: "amount", op, value: 0 },
              );
            }}
            compact
            className="w-[130px]"
            options={[
              { value: "gt", label: "greater than" },
              { value: "lt", label: "less than" },
              { value: "between", label: "between" },
            ]}
          />
          {cond.op === "between" ? (
            <>
              <Field
                control="amount"
                step="0.01"
                value={String(cond.min)}
                placeholder="min"
                onValueChange={(nv) => onChange({ field: "amount", op: "between", min: toNum(nv), max: cond.max })}
                compact
                className="w-[90px]"
              />
              <span className="text-xs text-muted-foreground">–</span>
              <Field
                control="amount"
                step="0.01"
                value={String(cond.max)}
                placeholder="max"
                onValueChange={(nv) => onChange({ field: "amount", op: "between", min: cond.min, max: toNum(nv) })}
                compact
                className="w-[90px]"
              />
            </>
          ) : (
            <Field
              control="amount"
              step="0.01"
              value={String(cond.value)}
              placeholder="amount"
              onValueChange={(nv) => onChange({ field: "amount", op: cond.op, value: toNum(nv) })}
              compact
              className="w-[120px]"
            />
          )}
          <span className="text-xs text-muted-foreground">(by magnitude)</span>
        </>
      ) : (
        <>
          <Field
            control="select"
            value={cond.op}
            onValueChange={(v) => onChange({ ...cond, op: (v as "contains" | "exact" | "regex") ?? "contains" })}
            compact
            className="w-[120px]"
            options={[
              { value: "contains", label: "contains" },
              { value: "exact", label: "exact" },
              { value: "regex", label: "regex" },
            ]}
          />
          <Field
            placeholder={PLACEHOLDER[cond.field]}
            value={cond.value}
            onChange={(e) => onChange({ ...cond, value: e.target.value })}
            compact
            className="flex-1 min-w-[140px]"
          />
        </>
      )}

      {canRemove && (
        <Button
          iconOnly
          variant="ghost"
          className="h-8 w-8 text-muted-foreground hover:text-destructive"
          onClick={onRemove}
          aria-label="Remove condition"
          title="Remove condition"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  );
}

export function EmailRuleDialog({
  open,
  onOpenChange,
  accounts,
  categories,
  initial,
  mode,
  fromEmail,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accounts: AccountOpt[];
  categories: CategoryOpt[];
  initial?: RuleDraftInit;
  mode: "manager" | "fromEmail";
  fromEmail?: FromEmailCtx;
  onSaved: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [conditions, setConditions] = useState<EmailCondition[]>(
    initial?.conditions && initial.conditions.length > 0
      ? initial.conditions
      : [defaultEmailConditionForField("sender")],
  );
  const [accountId, setAccountId] = useState<number | null>(initial?.accountId ?? null);
  const [categoryId, setCategoryId] = useState<number | null>(initial?.categoryId ?? null);
  // FINLYNQ-189 — target kind: "category" (income/expense) or "transfer".
  const [targetKind, setTargetKind] = useState<"category" | "transfer">(
    initial?.transferDestAccountId != null ? "transfer" : "category",
  );
  const [transferDestAccountId, setTransferDestAccountId] = useState<number | null>(
    initial?.transferDestAccountId ?? null,
  );
  const [ruleMode, setRuleMode] = useState<"auto" | "review">(initial?.mode ?? "auto");
  const [flipSign, setFlipSign] = useState(initial?.flipSign ?? false);
  const [dateSource, setDateSource] = useState<"parsed" | "received">(initial?.dateSource ?? "parsed");
  const [payeeOverride, setPayeeOverride] = useState(initial?.payeeOverride ?? "");
  // null ⇒ inherit the target account's currency (the default).
  const [currency, setCurrency] = useState<string | null>(initial?.currency ?? null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const isEdit = initial?.id != null;
  const recordableAccounts = useMemo(
    () => accounts.filter((a) => !a.archived && a.isInvestment !== true),
    [accounts],
  );
  const accountCurrency =
    accountId != null ? accounts.find((a) => a.id === accountId)?.currency ?? null : null;
  const acctLabel = (id: number | null) => {
    if (id == null) return "Account";
    const a = accounts.find((x) => x.id === id);
    return a ? `${safeAccountName(a)} · ${a.currency}` : `Account #${id}`;
  };
  const catLabel = (id: number | null) => {
    if (id == null) return "No category";
    const c = categories.find((x) => x.id === id);
    return c ? safeName(c.name, "category", c.id) : `Category #${id}`;
  };
  // FINLYNQ-189 — transfer destinations: recordable (non-investment, non-archived)
  // accounts EXCLUDING the chosen source account.
  const destAccounts = useMemo(
    () => recordableAccounts.filter((a) => a.id !== accountId),
    [recordableAccounts, accountId],
  );
  const destLabel = (id: number | null) => {
    if (id == null) return "Destination account";
    const a = accounts.find((x) => x.id === id);
    return a ? `${safeAccountName(a)} · ${a.currency}` : `Account #${id}`;
  };

  /** Keep a saved id selectable (archived account, deleted category) so the closed select still names it. */
  const withCurrent = (opts: { value: string; label: string }[], id: number | null, label: (id: number | null) => string) =>
    id == null || opts.some((o) => o.value === String(id)) ? opts : [{ value: String(id), label: label(id) }, ...opts];

  const updateCondition = (i: number, next: EmailCondition) =>
    setConditions((cs) => cs.map((c, j) => (j === i ? next : c)));
  const addCondition = () =>
    setConditions((cs) => [...cs, defaultEmailConditionForField("body")]);
  const removeCondition = (i: number) =>
    setConditions((cs) => cs.filter((_, j) => j !== i));

  // Live "will record" preview (fromEmail mode) — the pure transform applied to
  // the parsed candidate, so flip / date-source / rename are visible pre-save.
  const preview = useMemo(() => {
    if (mode !== "fromEmail" || !fromEmail?.candidate) return null;
    const c = fromEmail.candidate;
    const eff = applyEmailTransform(
      { date: c.date, amount: c.amount, payee: c.payee },
      { flipSign, dateSource, payeeOverride: payeeOverride.trim() || null },
      fromEmail.receivedAt ? fromEmail.receivedAt.slice(0, 10) : null,
    );
    // Display the currency the record path WILL use: override → account → parsed.
    return { ...eff, currency: currency ?? accountCurrency ?? c.currency };
  }, [mode, fromEmail, flipSign, dateSource, payeeOverride, currency, accountCurrency]);

  const save = async () => {
    if (!name.trim() || accountId == null) {
      setError("Name and account are required.");
      return;
    }
    if (conditions.length === 0) {
      setError("Add at least one condition.");
      return;
    }
    for (const c of conditions) {
      if (c.field !== "amount" && !c.value.trim()) {
        setError("Every text condition needs a value.");
        return;
      }
    }
    if (targetKind === "transfer") {
      if (transferDestAccountId == null) {
        setError("Pick a destination account for the transfer.");
        return;
      }
      // v1 same-currency only — mirror the web cross-currency transfer refusal.
      const destCurrency = accounts.find((a) => a.id === transferDestAccountId)?.currency;
      if (accountCurrency && destCurrency && accountCurrency !== destCurrency) {
        setError(
          `Transfers must be same-currency for now: the account is ${accountCurrency} but the destination is ${destCurrency}.`,
        );
        return;
      }
    } else if (mode === "fromEmail" && categoryId == null) {
      setError("Pick a category — recording this email now needs one.");
      return;
    }
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const all = conditions.map((c) =>
        c.field === "amount" ? c : { ...c, value: c.value.trim() },
      );
      const isTransfer = targetKind === "transfer";
      const payload = {
        name: name.trim(),
        conditions: { all },
        accountId,
        // Mutually exclusive: transfer mode clears the category.
        categoryId: isTransfer ? null : categoryId,
        transferDestAccountId: isTransfer ? transferDestAccountId : null,
        mode: ruleMode,
        flipSign,
        dateSource,
        payeeOverride: payeeOverride.trim() || null,
        currency: currency, // null ⇒ inherit the account currency
      };
      const res = await fetch(isEdit ? `/api/email-rules/${initial!.id}` : "/api/email-rules", {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b.error ?? `HTTP ${res.status}`);
      }

      // From-email: also record THIS email now through the same mapping.
      if (mode === "fromEmail" && fromEmail) {
        const rec = await fetch(`/api/import/email-inbox/${fromEmail.emailId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "record",
            accountId,
            // Transfer mode records a transfer (category ignored).
            categoryId: isTransfer ? undefined : categoryId,
            transferDestAccountId: isTransfer ? transferDestAccountId : undefined,
            flipSign,
            dateSource,
            payeeOverride: payeeOverride.trim() || undefined,
            currency: currency ?? undefined,
          }),
        });
        if (!rec.ok) {
          const b = await rec.json().catch(() => ({}));
          const reason = b.code ?? b.error ?? `HTTP ${rec.status}`;
          setNotice(
            reason === "sign_category_mismatch"
              ? "Rule created — but this email didn't record: the amount sign doesn't match the category. Adjust the flip/category and use Record on the row."
              : `Rule created — but this email didn't record (${reason}).`,
          );
          onSaved();
          setSaving(false);
          return;
        }
        const body = await rec.json().catch(() => ({}));
        if (body.action === "duplicate_skipped") {
          setNotice("Rule created. This email matched an existing transaction, so it was skipped as a duplicate.");
          onSaved();
          setSaving(false);
          return;
        }
        if (body.action === "possible_duplicate") {
          setNotice(
            `Rule created. This email looks like a possible duplicate of an existing transaction${
              body.duplicateOfTransactionId ? ` (#${body.duplicateOfTransactionId})` : ""
            }, so it wasn't recorded. Use “Record anyway” on the row if it's distinct.`,
          );
          onSaved();
          setSaving(false);
          return;
        }
      }

      onSaved();
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Overlay
      open={open}
      onClose={() => onOpenChange(false)}
      size="xl"
      title={mode === "fromEmail" ? "Create rule from this email" : isEdit ? "Edit email rule" : "New email rule"}
      actions={[
        { label: "Cancel", disabled: saving },
        {
          label: mode === "fromEmail" ? "Create rule & record" : isEdit ? "Save changes" : "Add rule",
          kind: "primary",
          onClick: () => void save(),
          disabled: saving,
        },
      ]}
    >

        <div className="space-y-3">
          {error && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive">
              {error}
            </div>
          )}
          {notice && (
            <div className="rounded-md border border-warning/30 bg-warning/10 p-2 text-xs text-warning">
              {notice}
            </div>
          )}

          {/* Name */}
          <Field
            label="Name"
            placeholder="Rule name (e.g. Chase alerts)"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />

          {/* Conditions (AND) */}
          <div className="space-y-2">
            <Field control="custom" label="When ALL of these match">
              <div className="space-y-2">
                {conditions.map((cond, i) => (
                  <EmailConditionRow
                    key={i}
                    cond={cond}
                    onChange={(next) => updateCondition(i, next)}
                    onRemove={() => removeCondition(i)}
                    canRemove={conditions.length > 1}
                  />
                ))}
              </div>
            </Field>
            <Button size="sm" variant="outline" className="gap-1.5" onClick={addCondition}>
              <Plus className="h-3.5 w-3.5" /> Add condition
            </Button>
          </div>

          {/* Target */}
          <Field
            control="custom"
            label="Record it into"
            info={targetKind === "transfer" ? "Records a transfer from the account above into the destination. Same-currency only for now." : undefined}
          >
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Field
                control="select"
                value={accountId != null ? String(accountId) : ""}
                onValueChange={(v) => {
                  const next = v ? parseInt(v, 10) : null;
                  setAccountId(next);
                  // Keep the transfer dest valid (can't equal the new source).
                  if (next != null && transferDestAccountId === next) {
                    setTransferDestAccountId(null);
                  }
                }}
                placeholder="Account"
                aria-label="Account"
                className="w-[190px]"
                options={withCurrent(
                  recordableAccounts.map((a) => ({ value: String(a.id), label: `${safeAccountName(a)} · ${a.currency}` })),
                  accountId,
                  acctLabel,
                )}
              />

              {/* FINLYNQ-189 — Category vs Transfer (mutually exclusive). */}
              <Field
                control="select"
                aria-label="Target kind"
                value={targetKind}
                onValueChange={(v) => {
                  const kind = (v as "category" | "transfer") || "category";
                  setTargetKind(kind);
                  // Clear the other side so we never persist both.
                  if (kind === "transfer") setCategoryId(null);
                  else setTransferDestAccountId(null);
                }}
                className="w-[130px]"
                options={[{ value: "category", label: "Category" }, { value: "transfer", label: "Transfer to" }]}
              />

              {targetKind === "transfer" ? (
                <Field
                  control="select"
                  aria-label="Destination account"
                  value={transferDestAccountId != null ? String(transferDestAccountId) : ""}
                  onValueChange={(v) => setTransferDestAccountId(v ? parseInt(v, 10) : null)}
                  placeholder="Destination account"
                  className="w-[190px]"
                  options={withCurrent(
                    destAccounts.map((a) => ({ value: String(a.id), label: `${safeAccountName(a)} · ${a.currency}` })),
                    transferDestAccountId,
                    destLabel,
                  )}
                />
              ) : (
                <Field
                  control="select"
                  aria-label="Category"
                  value={categoryId != null ? String(categoryId) : "none"}
                  onValueChange={(v) => setCategoryId(v && v !== "none" ? parseInt(v, 10) : null)}
                  placeholder="Category"
                  className="w-[180px]"
                  options={[
                    { value: "none", label: "No category" },
                    ...withCurrent(
                      categories.map((c) => ({ value: String(c.id), label: safeName(c.name, "category", c.id) })),
                      categoryId,
                      catLabel,
                    ),
                  ]}
                />
              )}

              <Field
                control="select"
                aria-label="Rule mode"
                value={ruleMode}
                onValueChange={(v) => setRuleMode((v as "auto" | "review") || "auto")}
                className="w-[120px]"
                options={[{ value: "auto", label: "auto" }, { value: "review", label: "review" }]}
              />
            </div>
          </Field>

          {/* Mapping / transforms */}
          <FieldGroup label="Field mapping">
            <Field
              label="Reverse amount sign"
              control="switch"
              info="For alerts that report expenses as positive."
              checked={flipSign}
              onCheckedChange={setFlipSign}
            />
            <Field
              label="Use date"
              control="select"
              value={dateSource}
              onValueChange={(v) => setDateSource((v as "parsed" | "received") || "parsed")}
              options={[
                { value: "parsed", label: "from the email body" },
                { value: "received", label: "the email's received date" },
              ]}
            />
            <Field
              label="Payee"
              optional
              placeholder="Always use this payee"
              value={payeeOverride}
              onChange={(e) => setPayeeOverride(e.target.value)}
            />
            <Field
              label="Currency"
              control="select"
              info="Email alerts often show only “$”."
              value={currency ?? "account"}
              onValueChange={(v) => setCurrency(!v || v === "account" ? null : v)}
              options={[
                { value: "account", label: `Account currency${accountCurrency ? ` (${accountCurrency})` : ""}` },
                ...SUPPORTED_FIAT_CURRENCIES.map((c) => ({ value: c, label: c })),
              ]}
            />
          </FieldGroup>

          {/* Live preview (fromEmail) */}
          {preview && (
            <div className="rounded-md border border-pos/30 bg-pos/10 p-2.5 text-sm">
              <span className="text-xs text-muted-foreground">Will record: </span>
              <span className="font-medium">{formatCurrency(preview.amount, preview.currency)}</span>
              <span className="mx-1.5 text-muted-foreground">·</span>
              <span>{preview.payee}</span>
              <span className="mx-1.5 text-muted-foreground">·</span>
              <span>{preview.date}</span>
            </div>
          )}

          <p data-keep="warning" className="text-xs text-muted-foreground">
            Auto-record needs a category (the income/expense sign must match).
          </p>
        </div>
    </Overlay>
  );
}
