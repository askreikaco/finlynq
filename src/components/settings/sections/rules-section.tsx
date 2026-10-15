"use client";

/**
 * Rules section — Transaction Rules manager (FINLYNQ-84). Accordion section on
 * /settings/reconciliation (old /settings/rules renders it open). Lifted
 * verbatim from the old /settings/rules page; multi-condition + multi-action
 * editor, live preview, active toggle / edit / delete.
 */

import { useEffect, useMemo, useState } from "react";
import { SyncMarkBadge } from "@/components/offline/sync-mark-badge";
import { isNetworkFailure } from "@/lib/transactions/entry-mode";
import { overlayRows, usePendingEntity, isLocalWriteQueueActive, queueOfflineEntityDelete, queueOfflineEntityEdit } from "@/lib/data/local-write-queue";
import { ruleChangedFields } from "@/lib/rules/offline-fields";

/** Queued rule edits over the server row (scalar fields; conditions and actions come back as canonical JSON text). */
function rulePatch(f: Record<string, string | number | null>): Partial<RuleRow> {
  const p: Record<string, unknown> = {};
  if (f.name !== undefined && f.name !== null) p.name = String(f.name);
  if (f.priority !== undefined && f.priority !== null) p.priority = Number(f.priority);
  if (f.isActive !== undefined && f.isActive !== null) p.isActive = f.isActive === "true";
  return p as Partial<RuleRow>;
}
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InfoTip } from "@/components/ui/info-tip";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Field } from "@/components/ui/field";
import { AlertTriangle, ListChecks, Plus, Trash2, Zap } from "lucide-react";
import type { Condition, Action } from "@/lib/rules/schema";

/** Where the rule create/edit pages send the user back to (this section's page). */
const RULES_RETURN_TO = "/settings/rules";

type RuleRow = {
  id: number;
  name: string;
  conditions: { all: Condition[] };
  actions: Action[];
  isActive: boolean;
  priority: number;
  createdAt: string;
  updatedAt: string | null;
  actionFKNames?: {
    categories: Record<string, string | null>;
    accounts: Record<string, string | null>;
    holdings: Record<string, string | null>;
  };
};

function summarizeConditions(group: { all: Condition[] }, fkNames?: RuleRow["actionFKNames"]): string {
  if (group.all.length === 0) return "(no conditions)";
  return group.all.map((c) => describeCondition(c, fkNames)).join(" AND ");
}

function describeCondition(c: Condition, fkNames?: RuleRow["actionFKNames"]): string {
  switch (c.field) {
    case "payee":
    case "note":
    case "tags":
      return `${c.field} ${c.op} "${c.value}"`;
    case "amount":
      if (c.op === "between") return `amount between ${c.min}-${c.max}`;
      return `amount ${c.op} ${c.value}`;
    case "account": {
      const name = fkNames?.accounts?.[String(c.accountId)] ?? `#${c.accountId}`;
      return `account ${c.op} ${name}`;
    }
    case "currency":
      return `currency ${c.op} ${c.value}`;
    case "date":
      if (c.op === "weekday") return `date weekday=${c.weekday}`;
      if (c.op === "day_of_month") return `date day=${c.day}`;
      return `date in ${c.from}…${c.to}`;
    case "ticker":
      return `ticker ${c.op} "${c.value}"`;
    case "security_name":
      return `security name ${c.op} "${c.value}"`;
    case "quantity":
      if (c.op === "between") return `quantity between ${c.min}-${c.max}`;
      return `quantity ${c.op} ${c.value}`;
  }
}

function summarizeActions(actions: Action[], fkNames?: RuleRow["actionFKNames"]): string {
  if (actions.length === 0) return "(no actions)";
  return actions.map((a) => describeAction(a, fkNames)).join(", ");
}

function describeAction(a: Action, fkNames?: RuleRow["actionFKNames"]): string {
  switch (a.kind) {
    case "set_category": {
      const name = fkNames?.categories?.[String(a.categoryId)] ?? `#${a.categoryId}`;
      return `set category → ${name}`;
    }
    case "set_tags":
      return `set tags → "${a.tags}"`;
    case "rename_payee":
      return `rename payee → "${a.to}"`;
    case "set_account": {
      const name = fkNames?.accounts?.[String(a.accountId)] ?? `#${a.accountId}`;
      return `set account → ${name}`;
    }
    case "set_entered_currency":
      return `set entered currency → ${a.currency}`;
    case "set_portfolio_holding": {
      const name = fkNames?.holdings?.[String(a.holdingId)] ?? `#${a.holdingId}`;
      return `set holding → ${name}`;
    }
    case "create_transfer": {
      const name = fkNames?.accounts?.[String(a.destAccountId)] ?? `#${a.destAccountId}`;
      return `create transfer → ${name}`;
    }
    case "record_investment_op": {
      const acct = fkNames?.accounts?.[String(a.investmentAccountId)] ?? `#${a.investmentAccountId}`;
      const target = a.useRowTicker
        ? "row ticker"
        : a.holdingId != null
          ? (fkNames?.holdings?.[String(a.holdingId)] ?? `#${a.holdingId}`)
          : "—";
      if (a.op === "deposit" || a.op === "withdrawal") {
        const other = a.counterpartyAccountId != null
          ? (fkNames?.accounts?.[String(a.counterpartyAccountId)] ?? `#${a.counterpartyAccountId}`)
          : "—";
        return `${a.op} (${acct} ↔ ${other})`;
      }
      return `record ${a.op} → ${target} in ${acct}`;
    }
  }
}

export function RulesSection() {
  const [rules, setRules] = useState<RuleRow[]>([]);
  const [error, setError] = useState("");

  async function load() {
    try {
      const rulesRes = await fetch("/api/rules");
      if (rulesRes.ok) setRules(await rulesRes.json());
    } catch (e) {
      setError(String(e));
    }
  }

  useEffect(() => { load(); }, []);

  // Offline queue (local-first L3): queued rule changes over the server rows. Flag off = the rows as they are.
  const pending = usePendingEntity("rule", load);
  const shownRules = useMemo(() => overlayRows(rules, pending, { patchOf: rulePatch }), [rules, pending]);

  async function handleToggle(rule: RuleRow) {
    try {
      const res = await fetch("/api/rules", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: rule.id, isActive: !rule.isActive }),
      });
      if (!res.ok) {
        const d = await res.json();
        setError(d.error ?? "Failed to toggle");
        return;
      }
      load();
    } catch (e) {
      // Offline (local-first L3): the toggle is kept on this device. Flag off / online errors keep the old path.
      if (isLocalWriteQueueActive() && isNetworkFailure(e)) {
        const { patch, current } = ruleChangedFields({ isActive: !rule.isActive }, { isActive: rule.isActive });
        if (await queueOfflineEntityEdit("rule", rule.id, patch, current)) return;
      }
      setError(String(e));
    }
  }

  async function handleDelete(rule: RuleRow) {
    if (!confirm(`Delete rule "${rule.name}"?`)) return;
    try {
      await fetch(`/api/rules?id=${rule.id}`, { method: "DELETE" });
      load();
    } catch (e) {
      if (isLocalWriteQueueActive() && isNetworkFailure(e)) {
        const r = rule as unknown as Record<string, unknown>;
        if (await queueOfflineEntityDelete("rule", rule.id, { name: rule.name, priority: rule.priority, isActive: rule.isActive ? "true" : "false", updatedAt: (r.updatedAt as string | undefined) ?? null })) return;
      }
      setError(String(e));
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-warning/10 text-warning">
                <Zap className="h-5 w-5" />
              </div>
              <div>
                <CardTitle icon={ListChecks} tone="indigo">
                  Rules
                  <InfoTip label="About rules" text={<>Auto-categorize and transform transactions. Highest priority first; first match wins. <a href="/docs/transaction-rules-v2" className="underline">Docs</a></>} />
                </CardTitle>
              </div>
            </div>
            <Button href={`/settings/rules/new?returnTo=${encodeURIComponent(RULES_RETURN_TO)}`} variant="outline" size="sm" leading={Plus}>
              Add
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {error && (
            <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-lg">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {error}
              <button className="ml-auto text-xs underline" onClick={() => setError("")}>dismiss</button>
            </div>
          )}

          {rules.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-6" data-keep="empty">No rules.</p>
          )}

          {shownRules.map((rule) => (
            <div
              key={rule.id}
              className={`rounded-lg border p-3 space-y-1 ${!rule.isActive ? "opacity-60" : ""}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm truncate">{rule.name}</span>
                    {rule.pendingSync && <SyncMarkBadge mark={rule.pendingSync} />}
                    {rule.priority > 0 && <Badge variant="secondary" className="text-xs">P{rule.priority}</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5" data-keep="data">
                    <strong>When:</strong> {summarizeConditions(rule.conditions ?? { all: [] }, rule.actionFKNames)}
                  </p>
                  <p className="text-xs text-muted-foreground" data-keep="data">
                    <strong>Then:</strong> {summarizeActions(rule.actions ?? [], rule.actionFKNames)}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <span className="flex h-8 items-center px-1">
                    <Field
                      control="switch"
                      checked={!!rule.isActive}
                      onCheckedChange={() => handleToggle(rule)}
                      aria-label={`${rule.isActive ? "Disable" : "Enable"} rule ${rule.name}`}
                    />
                  </span>
                  <Button href={`/settings/rules/${rule.id}/edit?returnTo=${encodeURIComponent(RULES_RETURN_TO)}`} variant="ghost" size="sm">
                    Edit
                  </Button>
                  <Button aria-label="Delete rule" variant="ghost" iconOnly className="h-8 w-8 text-destructive" onClick={() => handleDelete(rule)}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
