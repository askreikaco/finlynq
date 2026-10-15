"use client";

import React, { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Overlay } from "@/components/ui/overlay";

export interface MappingDialogState {
  accountAutoCreateByDefault: boolean;
  categoryAutoCreateByDefault: boolean;
  /** externalAccountId → Finlynq accounts.id. Absent = fall back to default (auto-create if enabled). */
  accountOverrides: Record<string, number>;
  /** externalCategoryId → Finlynq categories.id | null. null = uncategorized. */
  categoryOverrides: Record<string, number | null>;
  transferCategoryId: number | null;
  transferAutoCreateName: string;
  openingBalanceCategoryId: number | null;
  openingBalanceAutoCreateName: string;
  /** ISO YYYY-MM-DD or empty string. */
  startDate: string;
}

interface ProbeSummary {
  external: {
    accounts: Array<{ id: string; name: string; type: string; currency: string; groupName?: string }>;
    categories: Array<{ id: string; name: string; type: string; groupName?: string }>;
  };
  finlynq: {
    accounts: Array<{ id: number; name: string; type: string; currency: string; group: string }>;
    categories: Array<{ id: number; name: string; type: string; group: string }>;
  };
}

interface ConnectorMappingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  probe: ProbeSummary;
  state: MappingDialogState;
  onConfirm: (state: MappingDialogState) => void;
}

export function ConnectorMappingDialog({ open, onOpenChange, probe, state, onConfirm }: ConnectorMappingDialogProps) {
  const [s, setS] = useState<MappingDialogState>(state);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const finlynqAccountOptions = useMemo(
    () => probe.finlynq.accounts.map((a) => ({ id: a.id, label: `${a.name} (${a.currency})` })),
    [probe.finlynq.accounts],
  );
  const finlynqCategoryOptions = useMemo(
    () => probe.finlynq.categories.map((c) => ({ id: c.id, label: `${c.name} (${c.type})` })),
    [probe.finlynq.categories],
  );

  return (
    <Overlay
      open={open}
      onClose={() => onOpenChange(false)}
      size="2xl"
      title="Map WealthPosition to Finlynq"
      info={<>Every WealthPosition account and category needs a Finlynq counterpart. By default,
            missing ones will be auto-created for you — you can override any mapping below.</>}
      actions={[
        { label: "Cancel", onClick: () => onOpenChange(false) },
        { label: "Preview sync", kind: "primary", onClick: () => onConfirm(s) },
      ]}
    >
        <div className="space-y-4 overflow-y-auto flex-1 pr-1">
          {/* Defaults */}
          <div className="space-y-3 rounded-md border p-3 bg-muted/30">
            <Field
              label={<>Auto-create missing accounts ({probe.external.accounts.length} total)</>}
              control="switch"
              id="accts-auto"
              checked={s.accountAutoCreateByDefault}
              onCheckedChange={(v) => setS({ ...s, accountAutoCreateByDefault: v })}
            />
            <Field
              label={<>Auto-create missing categories ({probe.external.categories.length} total)</>}
              control="switch"
              id="cats-auto"
              checked={s.categoryAutoCreateByDefault}
              onCheckedChange={(v) => setS({ ...s, categoryAutoCreateByDefault: v })}
            />
          </div>

          {/* System categories */}
          <div className="grid grid-cols-1 regular:grid-cols-2 gap-3">
            <Field
              label="Transfer category"
              info="Used for 2-account transfers."
              control="select"
              value={s.transferCategoryId === null ? "__auto" : String(s.transferCategoryId)}
              onValueChange={(v) => {
                if (!v || v === "__auto") setS({ ...s, transferCategoryId: null });
                else setS({ ...s, transferCategoryId: Number(v) });
              }}
              options={[
                { value: "__auto", label: "Auto-create \u201cTransfers\u201d" },
                ...finlynqCategoryOptions.map((c) => ({ value: String(c.id), label: c.label })),
              ]}
            />
            <Field
              label="Opening-balance category"
              info="Used for reconciliation adjustments."
              control="select"
              value={s.openingBalanceCategoryId === null ? "__auto" : String(s.openingBalanceCategoryId)}
              onValueChange={(v) => {
                if (!v || v === "__auto") setS({ ...s, openingBalanceCategoryId: null });
                else setS({ ...s, openingBalanceCategoryId: Number(v) });
              }}
              options={[
                { value: "__auto", label: "Auto-create \u201cOpening Balance\u201d" },
                ...finlynqCategoryOptions.map((c) => ({ value: String(c.id), label: c.label })),
              ]}
            />
          </div>

          <Field
            label="Start date (optional — leave blank to pull everything)"
            control="date"
            value={s.startDate}
            onChange={(e) => setS({ ...s, startDate: e.target.value })}
            compact
          />

          {/* Advanced per-row mapping */}
          <div>
            <button
              type="button"
              className="text-xs text-muted-foreground underline"
              onClick={() => setShowAdvanced((v) => !v)}
            >
              {showAdvanced ? "Hide" : "Show"} per-entity mapping overrides
            </button>
          </div>

          {showAdvanced && (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-medium mb-2">Accounts</h3>
                <div className="space-y-1 max-h-64 overflow-y-auto rounded-md border p-2">
                  {probe.external.accounts.map((a) => (
                    <div key={a.id} className="flex items-center gap-2 text-xs">
                      <div className="w-1/2 truncate" title={a.name}>
                        {a.name}{" "}
                        <span className="text-muted-foreground">
                          ({a.type}/{a.currency})
                        </span>
                      </div>
                      <Field
                        control="select"
                        compact
                        aria-label={`Account mapping for ${a.name}`}
                        className="flex-1"
                        value={
                          s.accountOverrides[a.id] !== undefined
                            ? String(s.accountOverrides[a.id])
                            : s.accountAutoCreateByDefault
                              ? "__auto"
                              : "__skip"
                        }
                        onValueChange={(v) => {
                          const overrides = { ...s.accountOverrides };
                          if (!v || v === "__auto" || v === "__skip") {
                            delete overrides[a.id];
                          } else {
                            overrides[a.id] = Number(v);
                          }
                          setS({ ...s, accountOverrides: overrides });
                        }}
                        options={[
                          { value: "__auto", label: "Auto-create" },
                          { value: "__skip", label: "Skip", disabled: true },
                          ...finlynqAccountOptions.map((o) => ({ value: String(o.id), label: o.label })),
                        ]}
                      />
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <h3 className="text-sm font-medium mb-2">Categories</h3>
                <div className="space-y-1 max-h-64 overflow-y-auto rounded-md border p-2">
                  {probe.external.categories.map((c) => (
                    <div key={c.id} className="flex items-center gap-2 text-xs">
                      <div className="w-1/2 truncate" title={c.name}>
                        {c.name}{" "}
                        <span className="text-muted-foreground">({c.type})</span>
                      </div>
                      <Field
                        control="select"
                        compact
                        aria-label={`Category mapping for ${c.name}`}
                        className="flex-1"
                        value={
                          s.categoryOverrides[c.id] === null
                            ? "__none"
                            : s.categoryOverrides[c.id] !== undefined
                              ? String(s.categoryOverrides[c.id])
                              : s.categoryAutoCreateByDefault
                                ? "__auto"
                                : "__none"
                        }
                        onValueChange={(v) => {
                          const overrides = { ...s.categoryOverrides };
                          if (!v || v === "__auto") delete overrides[c.id];
                          else if (v === "__none") overrides[c.id] = null;
                          else overrides[c.id] = Number(v);
                          setS({ ...s, categoryOverrides: overrides });
                        }}
                        options={[
                          { value: "__auto", label: "Auto-create" },
                          { value: "__none", label: "Leave uncategorized" },
                          ...finlynqCategoryOptions.map((o) => ({ value: String(o.id), label: o.label })),
                        ]}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
    </Overlay>
  );
}
