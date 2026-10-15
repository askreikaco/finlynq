"use client";

/**
 * Shared transaction-rule editor FORM (no dialog chrome). Hosts:
 *   - /settings/rules/new and /settings/rules/[id]/edit (full pages, via
 *     app/(app)/settings/rules/new and [id]/edit pages)
 *   - RuleEditorDialog (rule-editor-dialog.tsx), kept for the transaction
 *     "Customize…" flow until transactions moves to /settings/rules/new.
 *
 * The form never bakes in a URL. The host's `onSubmit` owns the fetch and
 * returns { ok, error? }; on { ok: false } the error renders inline and the
 * form stays open. `renderActions` lets each host place its own Cancel/Save.
 *
 * Reuses (do NOT re-copy): Condition/Action/ConditionGroup from
 * @/lib/rules/schema, computePureActionPatch from @/lib/rules/execute,
 * useDropdownOrder("category") (FINLYNQ-89), shadcn primitives.
 *
 * The editor does NOT pre-filter side-effect actions (set_account,
 * create_transfer, record_investment_op); the server is the authority and the
 * editor surfaces any refusal inline.
 */

import { useMemo, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { InfoTip } from "@/components/ui/info-tip";
import { Label } from "@/components/ui/label";
import { useDropdownOrder } from "@/components/dropdown-order-provider";
import {
  Plus, Trash2, AlertTriangle, ChevronUp, ChevronDown,
} from "lucide-react";
import { computePureActionPatch } from "@/lib/rules/execute";
import type { Condition, Action, ConditionGroup } from "@/lib/rules/schema";
import { Field, type FieldComboboxOption } from "@/components/ui/field";
import { defaultConditionForField, defaultActionForKind } from "@/lib/rules/schema";
export type Category = { id: number; name: string; type: string; group: string };
export type Account = { id: number; name: string };
export type Holding = { id: number; name: string };

export type RuleSeed = {
  id?: number;
  name: string;
  conditions: ConditionGroup;
  actions: Action[];
  priority: number;
  isActive: boolean;
};

export type RuleEditorPayload = {
  name: string;
  conditions: ConditionGroup;
  actions: Action[];
  priority: number;
  isActive: boolean;
};

export type SubmitResult = { ok: true } | { ok: false; error: string };

export const CONDITION_FIELDS: Array<{ value: Condition["field"]; label: string }> = [
  { value: "payee", label: "Payee" },
  { value: "note", label: "Note" },
  { value: "tags", label: "Tags" },
  { value: "amount", label: "Amount" },
  { value: "account", label: "Account" },
  { value: "currency", label: "Currency" },
  { value: "date", label: "Date" },
  // FINLYNQ-208 — investment-import captured fields.
  { value: "ticker", label: "Ticker" },
  { value: "security_name", label: "Security name" },
  { value: "quantity", label: "Quantity" },
];

export const ACTION_KINDS: Array<{ value: Action["kind"]; label: string; sideEffect?: true }> = [
  { value: "set_category", label: "Set category" },
  { value: "set_tags", label: "Set tags" },
  { value: "rename_payee", label: "Rename payee" },
  { value: "set_entered_currency", label: "Set entered currency" },
  // `set_portfolio_holding` ("Set holding") intentionally NOT offered — removed
  // from the new-rule menu (FINLYNQ-208 feedback). The schema member + executor
  // support stay so any pre-existing rule that uses it keeps working.
  { value: "set_account", label: "Move to account (approve-time only)", sideEffect: true },
  { value: "create_transfer", label: "Create transfer pair (approve-time only)", sideEffect: true },
  // FINLYNQ-208 — record a lot-aware investment op (buy/sell/dividend/…).
  { value: "record_investment_op", label: "Record investment transaction", sideEffect: true },
];

/** Investment op types the action can record (mirrors the schema enum). */
const INVESTMENT_OPS: Array<{ value: string; label: string }> = [
  { value: "buy", label: "Buy" },
  { value: "sell", label: "Sell" },
  { value: "dividend", label: "Dividend" },
  { value: "interest", label: "Interest" },
  { value: "fee", label: "Fee" },
  { value: "deposit", label: "Deposit (bank → investment)" },
  { value: "withdrawal", label: "Withdrawal (investment → bank)" },
];

/** Row-variable sources the user can bind a numeric param to. */
const VAR_SOURCES: Array<{ value: string; label: string }> = [
  { value: "row_amount", label: "Row amount" },
  { value: "row_quantity", label: "Row quantity" },
  { value: "row_price", label: "Row price/unit" },
  { value: "fixed", label: "Fixed value" },
];

export function blankCondition(): Condition {
  return defaultConditionForField("payee");
}

export function blankAction(): Action {
  return defaultActionForKind("set_category", 0);
}

/**
 * Strip op-irrelevant + placeholder-zero FK fields from a
 * `record_investment_op` action before submit (FINLYNQ-208 fix).
 *
 * The op `Select` keeps the action's shape across op switches (e.g. selecting
 * Deposit reveals the Bank-account picker, which seeds `counterpartyAccountId`,
 * then switching back to Buy hides it again). The hidden field's value lingers,
 * and a `0` (the editor's "unset" sentinel from `parseInt(v ?? "0")`) is a
 * *present* value, so the server's `z.number().int().positive().optional()`
 * rejects it with the cryptic "Too small: expected number to be >0" instead of
 * the friendly per-op validator ever running. Drop any optional FK that the
 * current op can't use, or that is non-positive, so the wire payload matches
 * exactly the fields the op needs.
 */
function sanitizeActionForSubmit(action: Action): Action {
  if (action.kind !== "record_investment_op") return action;
  const a = { ...action };
  const isCashOnAccount = a.op === "deposit" || a.op === "withdrawal";
  const isIncome = a.op === "dividend" || a.op === "interest" || a.op === "fee";
  const canSettleAsShares = a.op === "dividend" || a.op === "interest";
  // Counterparty only applies to deposit/withdrawal.
  if (!isCashOnAccount || !a.counterpartyAccountId || a.counterpartyAccountId <= 0) {
    delete a.counterpartyAccountId;
  }
  // Explicit holding is dropped when resolving from the row ticker or when unset.
  if (a.useRowTicker || !a.holdingId || a.holdingId <= 0) {
    delete a.holdingId;
  }
  // Explicit category only applies to the income/cash ops.
  if (!isIncome || !a.categoryId || a.categoryId <= 0) {
    delete a.categoryId;
  }
  // Shares settle mode only applies to dividend/interest income.
  if (!canSettleAsShares) {
    delete a.settleAs;
  }
  return a;
}

export type RuleEditorActionState = {
  submitting: boolean;
  /** Validates and submits. Hosts wire this to their Save button. */
  save: () => void;
};

export interface RuleEditorFormProps {
  /** When set, the form edits this rule (its id is the caller's concern). */
  rule?: RuleSeed | null;
  /** Seeds for fresh forms. Ignored when `rule` is set. */
  initialName?: string;
  initialConditions?: Condition[];
  initialActions?: Action[];
  initialPriority?: number;
  initialIsActive?: boolean;
  categories: Category[];
  accounts: Account[];
  holdings: Holding[];
  /** Called after onSubmit returns ok. */
  onSaved: () => void;
  onSubmit: (payload: RuleEditorPayload) => Promise<SubmitResult>;
  /** Host-owned Cancel / Save row (dialog footer or page bottom bar). */
  renderActions: (state: RuleEditorActionState) => ReactNode;
}

export function RuleEditorForm({
  rule,
  initialName,
  initialConditions,
  initialActions,
  initialPriority,
  initialIsActive,
  categories,
  accounts,
  holdings,
  onSaved,
  onSubmit,
  renderActions,
}: RuleEditorFormProps) {
  const [name, setName] = useState(rule?.name ?? initialName ?? "");
  const [priority, setPriority] = useState(rule?.priority ?? initialPriority ?? 0);
  const [isActive, setIsActive] = useState(rule?.isActive ?? initialIsActive ?? true);
  const [conditions, setConditions] = useState<Condition[]>(
    rule?.conditions?.all ?? initialConditions ?? [blankCondition()],
  );
  const [actions, setActions] = useState<Action[]>(
    rule?.actions ?? initialActions ?? [blankAction()],
  );
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Live preview state.
  const [samplePayee, setSamplePayee] = useState("Whole Foods");
  const [sampleAmount, setSampleAmount] = useState(100);
  const livePatch = useMemo(() => {
    return computePureActionPatch(actions);
  }, [actions]);

  function updateCondition(i: number, patch: Partial<Condition>) {
    const next = [...conditions];
    next[i] = { ...next[i], ...patch } as Condition;
    setConditions(next);
  }
  function moveAction(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= actions.length) return;
    const next = [...actions];
    [next[i], next[j]] = [next[j], next[i]];
    setActions(next);
  }
  function updateAction(i: number, patch: Partial<Action>) {
    const next = [...actions];
    next[i] = { ...next[i], ...patch } as Action;
    setActions(next);
  }

  async function handleSave() {
    setError("");
    if (!name.trim()) { setError("Name is required"); return; }
    if (conditions.length === 0) { setError("At least one condition is required"); return; }
    if (actions.length === 0) { setError("At least one action is required"); return; }
    setSubmitting(true);
    try {
      const result = await onSubmit({
        name: name.trim(),
        conditions: { all: conditions },
        actions: actions.map(sanitizeActionForSubmit),
        priority,
        isActive,
      });
      if (!result.ok) {
        setError(result.error ?? "Failed to save rule");
        return;
      }
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      {error && (
        <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-lg">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field
            label="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Grocery stores"
          />
          <Field
            label="Priority"
            control="number"
            value={priority}
            onChange={(e) => setPriority(parseInt(e.target.value) || 0)}
          />
        </div>
        <Field
          label="Active"
          control="switch"
          id="rule-active"
          checked={isActive}
          onCheckedChange={(v) => setIsActive(v)}
          className="shrink-0"
        />

        {/* Conditions */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1">
              <Label>Conditions</Label>
              <InfoTip label="About conditions" text="All conditions must match (AND)." />
            </span>
            <Button size="sm" variant="outline" aria-label="Add condition" onClick={() => setConditions([...conditions, blankCondition()])}>
              <Plus className="h-3 w-3 mr-1" /> Add
            </Button>
          </div>
          {conditions.map((cond, i) => (
            <ConditionRow
              key={i}
              cond={cond}
              accounts={accounts}
              onChange={(patch) => updateCondition(i, patch)}
              onRemove={() => setConditions(conditions.filter((_, j) => j !== i))}
            />
          ))}
        </div>

        {/* Actions */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1">
              <Label>Actions</Label>
              <InfoTip label="About actions" text="Applied in order." />
            </span>
            <Button size="sm" variant="outline" aria-label="Add action" onClick={() => setActions([...actions, blankAction()])}>
              <Plus className="h-3 w-3 mr-1" /> Add
            </Button>
          </div>
          {actions.map((act, i) => (
            <ActionRow
              key={i}
              action={act}
              categories={categories}
              accounts={accounts}
              holdings={holdings}
              onChange={(patch) => updateAction(i, patch)}
              onRemove={() => setActions(actions.filter((_, j) => j !== i))}
              onMoveUp={i > 0 ? () => moveAction(i, -1) : undefined}
              onMoveDown={i < actions.length - 1 ? () => moveAction(i, 1) : undefined}
            />
          ))}
        </div>

        {/* Live preview */}
        <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
          <span className="flex items-center gap-1">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Preview</Label>
            <InfoTip label="About preview" text="Pure actions only. Side-effect actions (set account, transfer, investment transaction) run only on staging-approve or reconcile, so they are not in the patch." />
          </span>
          <div className="grid grid-cols-2 gap-2">
            <Field
              value={samplePayee}
              onChange={(e) => setSamplePayee(e.target.value)}
              placeholder="Sample payee"
            />
            <Field
              control="amount"
              value={sampleAmount}
              onValueChange={(nv) => setSampleAmount(parseFloat(nv) || 0)}
              placeholder="Sample amount"
            />
          </div>
          <div className="text-xs space-y-0.5 text-muted-foreground">
            <p data-keep="data">Sample: <span className="font-mono">{samplePayee || "(empty)"}</span> @ ${sampleAmount}</p>
            <p data-keep="data">Action patch: <span className="font-mono">{JSON.stringify(livePatch)}</span></p>
          </div>
        </div>
      </div>

      {renderActions({ submitting, save: () => { void handleSave(); } })}
    </>
  );
}


function ConditionRow({
  cond,
  accounts,
  onChange,
  onRemove,
}: {
  cond: Condition;
  accounts: Account[];
  onChange: (patch: Partial<Condition>) => void;
  onRemove: () => void;
}) {
  function setField(field: Condition["field"]) {
    // When switching field, blank to a fully-typed default for the new shape.
    // The factory map (rules/schema.ts) owns each variant's default, so a wrong
    // field on a variant is a compile error there instead of a silent type hole.
    onChange(defaultConditionForField(field, accounts[0]?.id ?? 0));
  }

  return (
    <div className="flex items-center gap-2">
      <Field
        control="select"
        value={cond.field}
        onValueChange={(v) => setField((v ?? "payee") as Condition["field"])}
        className="w-32"
        options={CONDITION_FIELDS.map((f) => ({ value: f.value, label: f.label }))}
      />

      {/* Operator + value vary per field. */}
      {(cond.field === "payee" || cond.field === "note" || cond.field === "tags" ||
        cond.field === "ticker" || cond.field === "security_name") && (
        <>
          <Field
            control="select"
            value={cond.op}
            onValueChange={(v) => onChange({ op: (v ?? "contains") as "contains" | "exact" | "regex" } as Partial<Condition>)}
            className="w-28"
            options={[
              { value: "contains", label: "contains" },
              { value: "exact", label: "exact" },
              { value: "regex", label: "regex" },
            ]}
          />
          <Field
            value={(cond as { value: string }).value ?? ""}
            onChange={(e) => onChange({ value: e.target.value } as Partial<Condition>)}
            placeholder={cond.field === "ticker" ? "VTI" : ""}
            className="flex-1"
          />
        </>
      )}

      {cond.field === "quantity" && cond.op !== "between" && (
        <>
          <Field
            control="select"
            value={cond.op}
            onValueChange={(v) => onChange({ op: (v ?? "gt") as "gt" | "lt" | "eq" | "between" } as Partial<Condition>)}
            className="w-28"
            options={[
              { value: "gt", label: ">" },
              { value: "lt", label: "<" },
              { value: "eq", label: "=" },
              { value: "between", label: "between" },
            ]}
          />
          <Field
            control="amount"
            value={(cond as { value: number }).value}
            onValueChange={(nv) => onChange({ value: parseFloat(nv) || 0 } as Partial<Condition>)}
            className="flex-1"
          />
        </>
      )}
      {cond.field === "quantity" && cond.op === "between" && (
        <>
          <Field
            control="select"
            value="between"
            onValueChange={(v) => onChange({ op: (v ?? "between") as "gt" | "lt" | "eq" | "between" } as Partial<Condition>)}
            className="w-28"
            options={[
              { value: "gt", label: ">" },
              { value: "lt", label: "<" },
              { value: "eq", label: "=" },
              { value: "between", label: "between" },
            ]}
          />
          <Field
            control="amount"
            value={(cond as { min: number }).min ?? 0}
            onValueChange={(nv) => onChange({ min: parseFloat(nv) || 0 } as Partial<Condition>)}
            placeholder="min"
            className="w-24"
          />
          <Field
            control="amount"
            value={(cond as { max: number }).max ?? 0}
            onValueChange={(nv) => onChange({ max: parseFloat(nv) || 0 } as Partial<Condition>)}
            placeholder="max"
            className="w-24"
          />
        </>
      )}

      {cond.field === "amount" && cond.op !== "between" && (
        <>
          <Field
            control="select"
            value={cond.op}
            onValueChange={(v) => onChange({ op: (v ?? "gt") as "gt" | "lt" | "eq" | "between" } as Partial<Condition>)}
            className="w-28"
            options={[
              { value: "gt", label: ">" },
              { value: "lt", label: "<" },
              { value: "eq", label: "=" },
              { value: "between", label: "between" },
            ]}
          />
          <Field
            control="amount"
            value={(cond as { value: number }).value}
            onValueChange={(nv) => onChange({ value: parseFloat(nv) || 0 } as Partial<Condition>)}
            className="flex-1"
          />
        </>
      )}
      {cond.field === "amount" && cond.op === "between" && (
        <>
          <Field
            control="select"
            value="between"
            onValueChange={(v) => onChange({ op: (v ?? "between") as "gt" | "lt" | "eq" | "between" } as Partial<Condition>)}
            className="w-28"
            options={[
              { value: "gt", label: ">" },
              { value: "lt", label: "<" },
              { value: "eq", label: "=" },
              { value: "between", label: "between" },
            ]}
          />
          <Field
            control="amount"
            value={(cond as { min: number }).min ?? 0}
            onValueChange={(nv) => onChange({ min: parseFloat(nv) || 0 } as Partial<Condition>)}
            placeholder="min"
            className="w-24"
          />
          <Field
            control="amount"
            value={(cond as { max: number }).max ?? 0}
            onValueChange={(nv) => onChange({ max: parseFloat(nv) || 0 } as Partial<Condition>)}
            placeholder="max"
            className="w-24"
          />
        </>
      )}

      {cond.field === "account" && (
        <>
          <Field
            control="select"
            value={cond.op}
            onValueChange={(v) => onChange({ op: (v ?? "is") as "is" | "is_not" } as Partial<Condition>)}
            className="w-24"
            options={[{ value: "is", label: "is" }, { value: "is_not", label: "is not" }]}
          />
          <Field
            control="combobox"
            value={String((cond as { accountId: number }).accountId)}
            onValueChange={(v) => onChange({ accountId: parseInt(v ?? "0") } as Partial<Condition>)}
            options={accounts.map((a): FieldComboboxOption => ({ value: String(a.id), label: a.name }))}
            placeholder="Select account"
            searchPlaceholder="Search accounts…"
            emptyMessage="No matches"
            className="flex-1"
          />
        </>
      )}

      {cond.field === "currency" && (
        <>
          <Field
            control="select"
            value={cond.op}
            onValueChange={(v) => onChange({ op: (v ?? "is") as "is" | "is_not" } as Partial<Condition>)}
            className="w-24"
            options={[{ value: "is", label: "is" }, { value: "is_not", label: "is not" }]}
          />
          <Field
            value={(cond as { value: string }).value ?? ""}
            onChange={(e) => onChange({ value: e.target.value.toUpperCase() } as Partial<Condition>)}
            placeholder="USD"
            className="w-24"
          />
        </>
      )}

      {cond.field === "date" && cond.op === "weekday" && (
        <>
          <Field
            control="select"
            value="weekday"
            onValueChange={(v) => onChange({ op: (v ?? "weekday") as "weekday" | "day_of_month" | "between" } as Partial<Condition>)}
            className="w-32"
            options={[
              { value: "weekday", label: "weekday is" },
              { value: "day_of_month", label: "day of month" },
              { value: "between", label: "between" },
            ]}
          />
          <Field
            control="number"
            min={0}
            max={6}
            value={(cond as { weekday: number }).weekday}
            onChange={(e) => onChange({ weekday: parseInt(e.target.value) || 0 } as Partial<Condition>)}
            className="w-20"
          />
          <span className="text-xs text-muted-foreground">0=Sun…6=Sat (UTC)</span>
        </>
      )}
      {cond.field === "date" && cond.op === "day_of_month" && (
        <>
          <Field
            control="select"
            value="day_of_month"
            onValueChange={(v) => onChange({ op: (v ?? "day_of_month") as "weekday" | "day_of_month" | "between" } as Partial<Condition>)}
            className="w-32"
            options={[
              { value: "weekday", label: "weekday is" },
              { value: "day_of_month", label: "day of month" },
              { value: "between", label: "between" },
            ]}
          />
          <Field
            control="number"
            min={1}
            max={31}
            value={(cond as { day: number }).day}
            onChange={(e) => onChange({ day: parseInt(e.target.value) || 1 } as Partial<Condition>)}
            className="w-20"
          />
        </>
      )}
      {cond.field === "date" && cond.op === "between" && (
        <>
          <Field
            control="select"
            value="between"
            onValueChange={(v) => onChange({ op: (v ?? "between") as "weekday" | "day_of_month" | "between" } as Partial<Condition>)}
            className="w-32"
            options={[
              { value: "weekday", label: "weekday is" },
              { value: "day_of_month", label: "day of month" },
              { value: "between", label: "between" },
            ]}
          />
          <Field
            control="date"
            value={(cond as { from: string }).from}
            onChange={(e) => onChange({ from: e.target.value } as Partial<Condition>)}
            className="w-36"
          />
          <Field
            control="date"
            value={(cond as { to: string }).to}
            onChange={(e) => onChange({ to: e.target.value } as Partial<Condition>)}
            className="w-36"
          />
        </>
      )}

      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={onRemove} aria-label="Remove condition">
        <Trash2 className="h-3 w-3" />
      </Button>
    </div>
  );
}

function ActionRow({
  action,
  categories,
  accounts,
  holdings,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
}: {
  action: Action;
  categories: Category[];
  accounts: Account[];
  holdings: Holding[];
  onChange: (patch: Partial<Action>) => void;
  onRemove: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
}) {
  const sortCategory = useDropdownOrder("category");

  function setKind(kind: Action["kind"]) {
    // The id arg seeds the single FK each kind needs (category / account /
    // holding); FK-less kinds (set_tags, rename_payee, set_entered_currency)
    // ignore it. The factory map (rules/schema.ts) owns each kind's default.
    const seedId =
      kind === "set_category"
        ? categories[0]?.id ?? 0
        : kind === "set_portfolio_holding"
          ? holdings[0]?.id ?? 0
          : accounts[0]?.id ?? 0;
    onChange(defaultActionForKind(kind, seedId));
  }

  const isInvestmentOp = action.kind === "record_investment_op";
  const isSideEffect =
    action.kind === "set_account" || action.kind === "create_transfer" || isInvestmentOp;

  return (
    <div
      className={`${isSideEffect ? "border-l-2 border-warning/50 pl-2" : ""} ${
        isInvestmentOp ? "flex flex-col gap-2" : "flex items-center gap-2"
      }`}
    >
      <div className={isInvestmentOp ? "flex items-center gap-2" : "contents"}>
      <Field
        control="select"
        value={action.kind}
        onValueChange={(v) => setKind((v ?? "set_category") as Action["kind"])}
        className="w-56"
        options={ACTION_KINDS.map((k) => ({ value: k.value, label: k.label }))}
      />

      {action.kind === "set_category" && (
        <Field
          control="combobox"
          value={String(action.categoryId)}
          onValueChange={(v) => onChange({ categoryId: parseInt(v ?? "0") } as Partial<Action>)}
          options={sortCategory(
            categories.map((c): FieldComboboxOption => ({ value: String(c.id), label: `${c.group} — ${c.name}` })),
            (c) => Number(c.value),
            (a, z) => (a.label ?? "").localeCompare(z.label ?? ""),
          )}
          placeholder="Select category"
          searchPlaceholder="Search categories…"
          emptyMessage="No matches"
          className="flex-1"
        />
      )}
      {action.kind === "set_tags" && (
        <Field
          value={action.tags}
          onChange={(e) => onChange({ tags: e.target.value } as Partial<Action>)}
          placeholder="tag1, tag2"
          className="flex-1"
        />
      )}
      {action.kind === "rename_payee" && (
        <Field
          value={action.to}
          onChange={(e) => onChange({ to: e.target.value } as Partial<Action>)}
          placeholder="Clean payee"
          className="flex-1"
        />
      )}
      {action.kind === "set_account" && (
        <Field
          control="combobox"
          value={String(action.accountId)}
          onValueChange={(v) => onChange({ accountId: parseInt(v ?? "0") } as Partial<Action>)}
          options={accounts.map((a): FieldComboboxOption => ({ value: String(a.id), label: a.name }))}
          placeholder="Select account"
          searchPlaceholder="Search accounts…"
          emptyMessage="No matches"
          className="flex-1"
        />
      )}
      {action.kind === "set_entered_currency" && (
        <Field
          value={action.currency}
          onChange={(e) => onChange({ currency: e.target.value.toUpperCase() } as Partial<Action>)}
          placeholder="USD"
          className="w-24"
        />
      )}
      {action.kind === "set_portfolio_holding" && (
        <Field
          control="combobox"
          value={String(action.holdingId)}
          onValueChange={(v) => onChange({ holdingId: parseInt(v ?? "0") } as Partial<Action>)}
          options={holdings.map((h): FieldComboboxOption => ({ value: String(h.id), label: h.name }))}
          placeholder="Select holding"
          searchPlaceholder="Search holdings…"
          emptyMessage="No matches"
          className="flex-1"
        />
      )}
      {action.kind === "create_transfer" && (
        <Field
          control="combobox"
          value={String(action.destAccountId)}
          onValueChange={(v) => onChange({ destAccountId: parseInt(v ?? "0") } as Partial<Action>)}
          options={accounts.map((a): FieldComboboxOption => ({ value: String(a.id), label: a.name }))}
          placeholder="Select destination account"
          searchPlaceholder="Search accounts…"
          emptyMessage="No matches"
          className="flex-1"
        />
      )}

      <div className="flex">
        {onMoveUp && (
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onMoveUp} aria-label="Move up">
            <ChevronUp className="h-3 w-3" />
          </Button>
        )}
        {onMoveDown && (
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onMoveDown} aria-label="Move down">
            <ChevronDown className="h-3 w-3" />
          </Button>
        )}
      </div>
      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={onRemove} aria-label="Remove action">
        <Trash2 className="h-3 w-3" />
      </Button>
      </div>

      {isInvestmentOp && (
        <InvestmentOpFields
          action={action}
          accounts={accounts}
          holdings={holdings}
          categories={categories}
          onChange={onChange}
        />
      )}
    </div>
  );
}

/**
 * Config block for the `record_investment_op` action (FINLYNQ-208). Lets the
 * user pick the op type, the investment account, the position (resolved from the
 * row's captured ticker OR an explicit holding), the deposit/withdrawal
 * counterparty, and bind qty/total/price to row variables or fixed values. Lot
 * allocation is always automatic FIFO — never selectable here.
 */
function InvestmentOpFields({
  action,
  accounts,
  holdings,
  categories,
  onChange,
}: {
  action: Extract<Action, { kind: "record_investment_op" }>;
  accounts: Account[];
  holdings: Holding[];
  categories: Category[];
  onChange: (patch: Partial<Action>) => void;
}) {
  const op = action.op;
  const isTrade = op === "buy" || op === "sell";
  const isCashOnAccount = op === "deposit" || op === "withdrawal";
  // Income-as-shares (DRIP) is offered for dividend / interest only.
  const isIncomeOp = op === "dividend" || op === "interest";
  const isShares = isIncomeOp && action.settleAs === "shares";
  const usesPosition = isTrade || op === "dividend" || op === "interest" || op === "fee";
  // dividend / interest / fee record a categorized income/expense row — let the
  // user pick ANY category, defaulting to the canonical one for the op kind.
  const usesCategory = op === "dividend" || op === "interest" || op === "fee";
  const autoCategoryName =
    op === "dividend" ? "Dividends" : op === "interest" ? "Interest" : "Investment Fees";
  // Shares-settled income needs qty + value bindings, exactly like a trade.
  const usesTradeBindings = isTrade || isShares;

  const acctItems = accounts.map((a): FieldComboboxOption => ({ value: String(a.id), label: a.name }));

  return (
    <div className="ml-2 grid gap-2 rounded-md border bg-muted/20 p-2 text-sm">
      <Field
        label="Transaction"
        control="select"
        value={op}
        onValueChange={(v) =>
          // Switching op resets op-specific fields so a hidden picker's stale
          // value can't leak into the payload: settle mode (shares only
          // applies to dividend/interest), the deposit/withdrawal counterparty,
          // and the income category all clear here. The user re-fills whatever
          // the new op surfaces below.
          onChange({
            op: (v ?? "buy"),
            settleAs: undefined,
            counterpartyAccountId: undefined,
            categoryId: undefined,
          } as Partial<Action>)
        }
        options={INVESTMENT_OPS.map((o) => ({ value: o.value, label: o.label }))}
        className="w-56"
      />

      {isIncomeOp && (
        <Field
          label="Settle as"
          control="select"
          value={action.settleAs ?? "cash"}
          onValueChange={(v) =>
            onChange(
              (v === "shares"
                ? {
                    settleAs: "shares",
                    // Shares need qty + value; seed row bindings if blank.
                    qty: action.qty ?? { from: "row_quantity" },
                    total: action.total ?? { from: "row_amount" },
                  }
                : { settleAs: "cash" }) as Partial<Action>,
            )
          }
          options={[
            { value: "cash", label: "Cash sleeve" },
            { value: "shares", label: "Shares (reinvested / DRIP)" },
          ]}
          className="w-56"
        />
      )}

      <Field
        label="Investment account"
        control="combobox"
        value={String(action.investmentAccountId || "")}
        onValueChange={(v) => onChange({ investmentAccountId: parseInt(v ?? "0") } as Partial<Action>)}
        options={acctItems}
        placeholder="Select investment account"
        searchPlaceholder="Search accounts…"
        emptyMessage="No matches"
        className="flex-1 min-w-48"
      />

      {isCashOnAccount && (
        <Field
          label="Bank account"
          control="combobox"
          value={String(action.counterpartyAccountId ?? "")}
          onValueChange={(v) => onChange({ counterpartyAccountId: parseInt(v ?? "0") } as Partial<Action>)}
          options={acctItems}
          placeholder="Select bank (non-investment) account"
          searchPlaceholder="Search accounts…"
          emptyMessage="No matches"
          className="flex-1 min-w-48"
        />
      )}

      {usesPosition && (
        <div className="flex flex-wrap items-center gap-2">
          <Label className="w-28 text-xs text-muted-foreground">Holding</Label>
          <label className="flex items-center gap-2 text-xs">
            <Field
              control="switch"
              checked={action.useRowTicker ?? false}
              onCheckedChange={(v) =>
                onChange({
                  useRowTicker: v,
                  ...(v ? { holdingId: undefined } : {}),
                } as Partial<Action>)
              }
            />
            Resolve from row ticker
          </label>
          {!action.useRowTicker && (
            <Field
              control="combobox"
              value={String(action.holdingId ?? "")}
              onValueChange={(v) => onChange({ holdingId: parseInt(v ?? "0") } as Partial<Action>)}
              options={holdings.map((h): FieldComboboxOption => ({ value: String(h.id), label: h.name }))}
              placeholder="Select holding"
              searchPlaceholder="Search holdings…"
              emptyMessage="No matches"
              className="flex-1 min-w-48"
            />
          )}
          {!isTrade && !isShares && action.useRowTicker && (
            <span className="text-xs text-muted-foreground italic">
              optional
            </span>
          )}
          {isShares && (
            <span className="text-xs text-muted-foreground italic">
              required
            </span>
          )}
        </div>
      )}

      {usesTradeBindings ? (
        <>
          <VarBindingRow label="Quantity" value={action.qty} onChange={(qty) => onChange({ qty } as Partial<Action>)} />
          <VarBindingRow label={isShares ? "Dollar value" : "Total amount"} value={action.total} onChange={(total) => onChange({ total } as Partial<Action>)} />
          <VarBindingRow label="Price/unit" value={action.price} onChange={(price) => onChange({ price } as Partial<Action>)} optional />
          <InfoTip
            label="About bindings"
            text={isShares
              ? "Bind any two of quantity, value and price; the third is computed. Recorded as shares; no cash sleeve is touched."
              : "Bind any two of quantity, total and price; the third is computed. Lots match FIFO."}
          />
        </>
      ) : (
        <VarBindingRow label="Amount" value={action.total} onChange={(total) => onChange({ total } as Partial<Action>)} />
      )}

      {usesCategory && (
        <Field
          label="Category"
          control="combobox"
          value={String(action.categoryId ?? 0)}
          onValueChange={(v) => {
            const n = parseInt(v ?? "0");
            onChange({ categoryId: n > 0 ? n : undefined } as Partial<Action>);
          }}
          options={[
            { value: "0", label: `Auto — ${autoCategoryName}` },
            ...categories
              .map((c): FieldComboboxOption => ({
                value: String(c.id),
                label: `${c.group} — ${c.name}`,
              }))
              .sort((a, z) => (a.label ?? "").localeCompare(z.label ?? "")),
          ]}
          placeholder="Select category"
          searchPlaceholder="Search categories…"
          emptyMessage="No matches"
          className="flex-1 min-w-48"
        />
      )}
    </div>
  );
}

/** A single qty/total/price binding: source selector + a fixed-value input when
 *  the source is "fixed". `undefined` value renders an empty (unset) binding. */
function VarBindingRow({
  label,
  value,
  onChange,
  optional,
}: {
  label: string;
  value: { from: string; value?: number } | undefined;
  onChange: (v: { from: string; value?: number } | undefined) => void;
  optional?: boolean;
}) {
  const from = value?.from ?? "";
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Field
        label={<>{label}{optional ? " (optional)" : ""}</>}
        control="select"
        value={from || "__unset"}
        onValueChange={(v) => {
          const next = v ?? "__unset";
          if (next === "__unset") return onChange(undefined);
          if (next === "fixed") return onChange({ from: "fixed", value: value?.value ?? 0 });
          return onChange({ from: next });
        }}
        className="w-40"
        options={[
          ...(optional ? [{ value: "__unset", label: "— none —" }] : []),
          ...VAR_SOURCES.map((s) => ({ value: s.value, label: s.label })),
        ]}
      />
      {from === "fixed" && (
        <Field
          control="amount"
          value={value?.value ?? 0}
          onValueChange={(nv) => onChange({ from: "fixed", value: parseFloat(nv) || 0 })}
          placeholder="value"
          className="w-28"
        />
      )}
    </div>
  );
}
