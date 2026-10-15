"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type { ColumnMapping, DateFormatOverride } from "@/lib/import-templates";
import { autoDetectColumnMapping } from "@/lib/import-templates";
import { SUPPORTED_CURRENCIES } from "@/lib/fx/supported-currencies";
import { DialogHeading } from "@/components/ui/dialog-heading";
import { Field } from "@/components/ui/field";
import { InfoTip } from "@/components/ui/info-tip";

type DateFormatUi = "auto" | DateFormatOverride;

interface SaveTemplateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  csvHeaders: string[];
  accounts: string[];
  onSaved: (template: { id: number; name: string }) => void;
}

// flipSign is a boolean knob (rendered as a checkbox below), not a column
// dropdown, so it's excluded from the field→header label map. The FINLYNQ-195
// investment columns (ticker / portfolioHolding / quantity) are also excluded —
// they ride through this template's JSON blob untouched but aren't surfaced in
// this cash-oriented editor in v1.
type MappingColumnField = Exclude<
  keyof ColumnMapping,
  "flipSign" | "ticker" | "portfolioHolding" | "quantity"
>;

const FIELD_LABELS: Record<MappingColumnField, string> = {
  date: "Date *",
  amount: "Amount *",
  account: "Account",
  payee: "Payee / Description",
  category: "Category",
  currency: "Currency",
  note: "Note",
  tags: "Tags",
  balance: "Balance (running)",
};

const MAPPING_FIELDS = Object.keys(FIELD_LABELS) as MappingColumnField[];

export function SaveTemplateDialog({
  open,
  onOpenChange,
  csvHeaders,
  accounts,
  onSaved,
}: SaveTemplateDialogProps) {
  const [name, setName] = useState("");
  const [defaultAccount, setDefaultAccount] = useState("");
  const [mapping, setMapping] = useState<ColumnMapping>(() => {
    return autoDetectColumnMapping(csvHeaders) ?? { date: "", amount: "" };
  });
  const [skipHeaderRows, setSkipHeaderRows] = useState("0");
  const [skipFooterRows, setSkipFooterRows] = useState("0");
  const [dateFormatOverride, setDateFormatOverride] = useState<DateFormatUi>("auto");
  const [defaultCurrency, setDefaultCurrency] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Reset state when dialog opens
  const handleOpenChange = (val: boolean) => {
    if (val) {
      setName("");
      setDefaultAccount("");
      setMapping(autoDetectColumnMapping(csvHeaders) ?? { date: "", amount: "" });
      setSkipHeaderRows("0");
      setSkipFooterRows("0");
      setDateFormatOverride("auto");
      setDefaultCurrency("");
      setError("");
    }
    onOpenChange(val);
  };

  const handleSave = async () => {
    if (!name.trim()) {
      setError("Template name is required");
      return;
    }
    if (!mapping.date) {
      setError("Date column is required");
      return;
    }
    if (!mapping.amount) {
      setError("Amount column is required");
      return;
    }

    setSaving(true);
    setError("");

    const skipH = Number.parseInt(skipHeaderRows, 10);
    const skipF = Number.parseInt(skipFooterRows, 10);

    try {
      const res = await fetch("/api/import/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          fileHeaders: csvHeaders,
          columnMapping: mapping,
          defaultAccount: defaultAccount || undefined,
          skipHeaderRows: Number.isFinite(skipH) ? Math.max(0, Math.min(100, skipH)) : 0,
          skipFooterRows: Number.isFinite(skipF) ? Math.max(0, Math.min(100, skipF)) : 0,
          dateFormatOverride: dateFormatOverride === "auto" ? null : dateFormatOverride,
          defaultCurrency: defaultCurrency || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      onSaved({ id: data.id, name: data.name });
      onOpenChange(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save template");
    } finally {
      setSaving(false);
    }
  };

  const setMappingField = (field: MappingColumnField, value: string) => {
    setMapping((prev) => ({ ...prev, [field]: value || undefined }));
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="regular:max-w-2xl max-h-[90dvh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogHeading help={<>Save this column mapping so future uploads from the same source are auto-matched.</>}>Save as Template</DialogHeading>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto space-y-4 pr-1">
          <div className="grid gap-3 regular:grid-cols-2">
            <Field
              label="Template Name"
              id="tpl-name"
              placeholder="e.g. TD Chequing"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />

            <Field
              label="Default Account"
              control="select"
              value={defaultAccount}
              onValueChange={(v) => setDefaultAccount(v ?? "")}
              placeholder="Per row"
              options={accounts.map((a) => ({ value: a, label: a }))}
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-0.5">
              <Label className="text-sm font-medium">Column Mapping</Label>
              <InfoTip label="About column mapping" text="Map CSV columns to transaction fields." />
            </div>
            <div className="grid gap-2 regular:grid-cols-2 rounded-lg border p-2">
              {MAPPING_FIELDS.map((field) => (
                <div key={field} className="flex items-center gap-2 px-2 py-1.5">
                  <span className="w-row-label text-xs text-muted-foreground shrink-0">
                    {FIELD_LABELS[field]}
                  </span>
                  <Field
                    control="select"
                    value={mapping[field] ?? "__none__"}
                    onValueChange={(v) => setMappingField(field, (!v || v === "__none__") ? "" : v)}
                    placeholder="—"
                    compact
                    className="flex-1"
                    options={[
                      { value: "__none__", label: "— not mapped —" },
                      ...csvHeaders.map((h) => ({ value: h, label: h })),
                    ]}
                  />
                </div>
              ))}
            </div>
          </div>

          <details className="rounded-lg border bg-muted/30 p-3">
            <summary className="cursor-pointer text-sm font-medium">
              Import options
              <InfoTip
                label="About import options"
                text="Skip header / footer rows, date format, default currency. Applied whenever this template is used. Leave at defaults for canonical exports."
              />
            </summary>
            <div className="mt-3 space-y-3">
              <div className="grid gap-3 regular:grid-cols-2">
                <Field
                  label="Skip N header rows"
                  control="number"
                  id="save-tpl-skip-h"
                  min={0}
                  max={100}
                  value={skipHeaderRows}
                  onChange={(e) => setSkipHeaderRows(e.target.value)}
                />
                <Field
                  label="Skip N footer rows"
                  control="number"
                  id="save-tpl-skip-f"
                  min={0}
                  max={100}
                  value={skipFooterRows}
                  onChange={(e) => setSkipFooterRows(e.target.value)}
                />
                <div className="space-y-1">
                  <Label className="text-xs">Date format</Label>
                  <Field
                    control="select"
                    value={dateFormatOverride}
                    onValueChange={(v) => setDateFormatOverride(v as DateFormatUi)}
                    compact
                    className="w-full"
                    options={[
                      { value: "auto", label: "Auto-detect" },
                      { value: "DD/MM/YYYY", label: "DD/MM/YYYY" },
                      { value: "MM/DD/YYYY", label: "MM/DD/YYYY" },
                      { value: "YYYY-MM-DD", label: "YYYY-MM-DD" },
                    ]}
                  />
                </div>
                <Field
                  label="Default currency (rows missing one)"
                  control="select"
                  value={defaultCurrency || "__none__"}
                  onValueChange={(v) =>
                    setDefaultCurrency(!v || v === "__none__" ? "" : v)
                  }
                  placeholder="— None —"
                  options={[
                    { value: "__none__", label: "— None —" },
                    ...SUPPORTED_CURRENCIES.map((c) => ({ value: c, label: c })),
                  ]}
                />
              </div>
              <label className="flex items-center justify-between gap-3 min-h-row rounded-lg border bg-background px-3 py-2.5 cursor-pointer">
                <span className="flex-1">
                  <span className="block text-sm font-medium">Flip sign of amounts</span>
                  <span className="block text-xs text-muted-foreground">
                    Multiply every amount by -1 on import. Use when this source
                    exports expenses as positive (or income as negative).
                  </span>
                </span>
                <Field
                  control="switch"
                  checked={mapping.flipSign === true}
                  onCheckedChange={(v) => setMapping((prev) => ({ ...prev, flipSign: v }))}
                  className="shrink-0"
                />
              </label>
            </div>
          </details>

          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save Template"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
