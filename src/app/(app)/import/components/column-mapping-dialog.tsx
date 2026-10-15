"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Overlay } from "@/components/ui/overlay";
import { ListRow, SectionCard } from "@/components/mobile";
import { AlertCircle, Loader2, Sparkles } from "lucide-react";
import type { ColumnMapping, DateFormatOverride } from "@/lib/import-templates";
// Pure, dependency-free module — importing parseAmount from "@/lib/csv-parser"
// would drag its server-only `@/db` (pg → dns/fs) import into this client bundle.
import { parseAmount } from "@/lib/parse-amount";
import { SUPPORTED_CURRENCIES } from "@/lib/fx/supported-currencies";
import { Field, FieldGroup } from "@/components/ui/field";
import { InfoTip } from "@/components/ui/info-tip";

type DateFormatUi = "auto" | DateFormatOverride;

/** Fresh column detection for a given skip — returned by the parent's re-parse. */
export interface ReparseResult {
  headers: string[];
  sampleRows: Record<string, string>[];
  suggestedMapping: ColumnMapping | null;
}

interface ColumnMappingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fileName: string;
  headers: string[];
  sampleRows: Record<string, string>[];
  suggestedMapping: ColumnMapping | null;
  accounts: string[];
  /**
   * Re-parse the same file with new skip values and return fresh columns /
   * sample / suggestion. Parent owns the fetch (it holds the File). Called
   * debounced when the user changes "Skip N header/footer rows".
   */
  onReparse: (skipHeaderRows: number, skipFooterRows: number) => Promise<ReparseResult>;
  /** Submits the confirmed mapping. Parent handles the csv-map call + template save. */
  onConfirm: (params: {
    mapping: ColumnMapping;
    defaultAccount: string | null;
    templateName: string;
    skipHeaderRows: number;
    skipFooterRows: number;
    defaultCurrency: string | null;
    /** Date-format override; `null` means auto-detect. */
    dateFormatOverride: DateFormatOverride | null;
    /** The headers the mapping was built against — reflects any re-detect, so
     *  the saved template stores the REAL column names, not the pre-trim junk row. */
    headers: string[];
    /** §B (2026-06-04) — only meaningful in confirm mode: the user ticked
     *  "Don't ask again for this account" → flip the account to 'auto'. */
    dontAskAgain?: boolean;
  }) => Promise<void>;
  submitting: boolean;
  /**
   * §B (2026-06-04) — when true the dialog was opened to CONFIRM a mapping the
   * pipeline auto-detected (the csv-confirm-mapping 422), not because nothing
   * matched. Shows confirm-tailored copy + the "Don't ask again for this
   * account" checkbox. Default false preserves the needs-mapping behavior.
   */
  confirmMode?: boolean;
  /**
   * FINLYNQ-195 — when the import target is an investment account, offer the
   * three investment-specific column mappings (Ticker/Symbol, Security name,
   * Quantity). Default false: a NON-investment account never sees/persists
   * them, so the cash import flow is byte-identical. v1 captures these into
   * staging / bank_transactions only — no lot-aware portfolio materialization.
   */
  isInvestment?: boolean;
}

// flipSign is a boolean knob (rendered as a checkbox below), not a column
// dropdown, so it's excluded from the field→header label map. The FINLYNQ-195
// investment columns (ticker / portfolioHolding / quantity) are also excluded —
// they render in their own investment-only section, not the cash field table.
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
  // 2026-05-24 — per-row "Balance" column. Optional. When mapped, the
  // parser captures one anchor per date (last-in-file-order's value).
  balance: "Balance (running)",
};
const MAPPING_FIELDS = Object.keys(FIELD_LABELS) as MappingColumnField[];
const NONE = "__none__";

// FINLYNQ-195 — investment-account-only column mappings. Rendered as a separate
// section below the cash fields ONLY when `isInvestment` is set. `quantity` is
// numeric; `ticker` / `portfolioHolding` are the security SYMBOL / NAME.
type InvestmentColumnField = "ticker" | "portfolioHolding" | "quantity";
const INVESTMENT_FIELD_LABELS: Record<InvestmentColumnField, string> = {
  ticker: "Ticker / Symbol",
  portfolioHolding: "Security name",
  quantity: "Quantity",
};
const INVESTMENT_FIELDS = Object.keys(
  INVESTMENT_FIELD_LABELS,
) as InvestmentColumnField[];

/** Clamp a string skip input to an integer in [0, 100]. */
function clampSkip(raw: string): number {
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 0;
}

/** Derive a sensible default template name from the file name. */
function defaultTemplateName(fileName: string): string {
  // "download-transactions (6).csv" → "download-transactions"
  const base = fileName.replace(/\.(csv|tsv|txt)$/i, "");
  return base.replace(/\s*\(\d+\)\s*$/, "").trim() || "My CSV Template";
}

export function ColumnMappingDialog({
  open,
  onOpenChange,
  fileName,
  headers,
  sampleRows,
  suggestedMapping,
  accounts,
  onReparse,
  onConfirm,
  submitting,
  confirmMode = false,
  isInvestment = false,
}: ColumnMappingDialogProps) {
  // Displayed columns / sample / suggestion are LOCAL state so debounced
  // re-detection can replace them without the parent re-pushing props (which
  // would clobber the user's in-progress mapping / account / currency).
  const [localHeaders, setLocalHeaders] = useState<string[]>(headers);
  const [localSampleRows, setLocalSampleRows] = useState<Record<string, string>[]>(sampleRows);
  const [localSuggested, setLocalSuggested] = useState<ColumnMapping | null>(suggestedMapping);

  const [mapping, setMapping] = useState<ColumnMapping>(
    () => suggestedMapping ?? { date: "", amount: "" },
  );
  const [defaultAccount, setDefaultAccount] = useState("");
  const [templateName, setTemplateName] = useState(() => defaultTemplateName(fileName));
  const [skipHeaderRows, setSkipHeaderRows] = useState("0");
  const [skipFooterRows, setSkipFooterRows] = useState("0");
  const [defaultCurrency, setDefaultCurrency] = useState("");
  const [dateFormatOverride, setDateFormatOverride] = useState<DateFormatUi>("auto");
  const [redetecting, setRedetecting] = useState(false);
  const [error, setError] = useState("");
  // §B (2026-06-04) — "Don't ask again for this account" (confirm mode only).
  const [dontAskAgain, setDontAskAgain] = useState(false);

  // Monotonic guard: only the latest re-detect's response is applied.
  const reparseSeq = useRef(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Re-seed ALL local state whenever the dialog opens against a new file.
  // Keyed on [open, fileName] only — NOT on the headers/sample/suggestion props,
  // so a re-detect (which changes the suggestion) doesn't trip this reset and
  // wipe the user's defaultAccount / templateName / currency mid-edit.
  useEffect(() => {
    if (!open) return;
    setLocalHeaders(headers);
    setLocalSampleRows(sampleRows);
    setLocalSuggested(suggestedMapping);
    setMapping(suggestedMapping ?? { date: "", amount: "" });
    setDefaultAccount("");
    setTemplateName(defaultTemplateName(fileName));
    setSkipHeaderRows("0");
    setSkipFooterRows("0");
    setDefaultCurrency("");
    setDateFormatOverride("auto");
    setRedetecting(false);
    setError("");
    setDontAskAgain(false);
    // Invalidate any in-flight re-detect from a previous file + clear debounce.
    reparseSeq.current++;
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, fileName]);

  // Clear any pending debounce on unmount.
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const setField = (field: MappingColumnField, value: string) => {
    setMapping((prev) => ({ ...prev, [field]: value || undefined }));
  };

  // FINLYNQ-195 — same shape as setField for the investment column keys.
  const setInvestmentField = (field: InvestmentColumnField, value: string) => {
    setMapping((prev) => ({ ...prev, [field]: value || undefined }));
  };

  // Re-detect columns by re-parsing the file with the new skip values. The
  // old mapping points at pre-trim column names, so re-seed it from the fresh
  // suggestion; defaultAccount / templateName / currency are left untouched.
  const runReparse = async (headerStr: string, footerStr: string) => {
    const seq = ++reparseSeq.current;
    setRedetecting(true);
    try {
      const next = await onReparse(clampSkip(headerStr), clampSkip(footerStr));
      if (seq !== reparseSeq.current) return; // superseded by a newer request
      setLocalHeaders(next.headers);
      setLocalSampleRows(next.sampleRows);
      setLocalSuggested(next.suggestedMapping);
      // Re-seed the column mappings from the fresh suggestion (the old ones
      // point at pre-trim column names) but PRESERVE the flip-sign toggle —
      // it's independent of which columns map where.
      setMapping((prev) => ({
        ...(next.suggestedMapping ?? { date: "", amount: "" }),
        ...(prev.flipSign ? { flipSign: true } : {}),
      }));
      setError("");
    } catch {
      if (seq === reparseSeq.current) {
        setError("Couldn't re-read the file with those skip values. Adjust and try again.");
      }
    } finally {
      if (seq === reparseSeq.current) setRedetecting(false);
    }
  };

  const scheduleReparse = (headerStr: string, footerStr: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void runReparse(headerStr, footerStr);
    }, 400);
  };

  const handleConfirm = async () => {
    setError("");
    if (!mapping.date) { setError("Pick the Date column."); return; }
    if (!mapping.amount) { setError("Pick the Amount column."); return; }
    if (!mapping.account && !defaultAccount) {
      setError("Map an Account column, or pick a Default Account below.");
      return;
    }
    if (!templateName.trim()) { setError("Give the template a name."); return; }

    // FINLYNQ-195 — never persist investment column keys for a cash account
    // (defends against a stale suggestion / re-detect leaking ticker/qty into a
    // cash template). For investment accounts they pass through untouched.
    const outMapping: ColumnMapping = { ...mapping };
    if (!isInvestment) {
      delete outMapping.ticker;
      delete outMapping.portfolioHolding;
      delete outMapping.quantity;
    }

    await onConfirm({
      mapping: outMapping,
      defaultAccount: defaultAccount || null,
      templateName: templateName.trim(),
      skipHeaderRows: clampSkip(skipHeaderRows),
      skipFooterRows: clampSkip(skipFooterRows),
      defaultCurrency: defaultCurrency || null,
      dateFormatOverride: dateFormatOverride === "auto" ? null : dateFormatOverride,
      headers: localHeaders,
      dontAskAgain,
    });
  };

  // Compute a live sample using the current mapping so the user sees what
  // each column resolves to before committing.
  const mappedSample = useMemo(() => {
    // Reflect the flip-sign knob so the previewed Amount matches what lands
    // in staging. Falls back to the raw cell text when it isn't a parseable
    // number (the parser would reject that row anyway).
    const displayAmount = (raw: string): string => {
      if (!mapping.flipSign || !raw) return raw;
      const n = parseAmount(raw);
      if (Number.isNaN(n)) return raw;
      return String(n === 0 ? 0 : -n);
    };
    return localSampleRows.slice(0, 5).map((row) => ({
      date: mapping.date ? row[mapping.date] ?? "" : "",
      amount: displayAmount(mapping.amount ? row[mapping.amount] ?? "" : ""),
      payee: mapping.payee ? row[mapping.payee] ?? "" : "",
      note: mapping.note ? row[mapping.note] ?? "" : "",
      currency: mapping.currency
        ? row[mapping.currency] ?? ""
        : defaultCurrency || "",
      account: mapping.account
        ? row[mapping.account] ?? ""
        : defaultAccount || "(default account)",
      // FINLYNQ-195 — investment columns previewed only when mapped.
      ticker: mapping.ticker ? row[mapping.ticker] ?? "" : "",
      security: mapping.portfolioHolding ? row[mapping.portfolioHolding] ?? "" : "",
      quantity: mapping.quantity ? row[mapping.quantity] ?? "" : "",
    }));
  }, [localSampleRows, mapping, defaultAccount, defaultCurrency]);

  const noColumns = localHeaders.length === 0 && !redetecting;

  return (
    <Overlay
      open={open}
      onClose={() => onOpenChange(false)}
      size="3xl"
      title={confirmMode ? "Confirm Column Mapping" : "Map CSV Columns"}
      info={<>{confirmMode ? (
              <>
                We detected a column mapping for{" "}
                <span className="font-mono text-xs">{fileName}</span>. Review it
                below — adjust any column that looks wrong, then import.
              </>
            ) : (
              <>
                We couldn&apos;t auto-match the columns in{" "}
                <span className="font-mono text-xs">{fileName}</span>.
                Tell us which column is which — we&apos;ll remember the mapping for next time.
              </>
            )}</>}
      actions={[
        { label: "Cancel", onClick: () => onOpenChange(false), disabled: submitting },
        { label: submitting
              ? "Preparing preview..."
              : redetecting
                ? "Re-reading…"
                : confirmMode
                  ? "Import with this mapping"
                  : "Continue", kind: "primary", onClick: handleConfirm, disabled: submitting || redetecting || noColumns },
      ]}
    >
        <div className="overflow-auto flex-1 space-y-4 pr-1">
          {localSuggested && (
            <div className="flex items-start gap-2 rounded-lg border border-info/30 bg-info/10 p-2.5">
              <Sparkles className="h-4 w-4 text-info shrink-0 mt-0.5" />
              <p className="text-xs text-info">
                We&apos;ve pre-filled our best guesses. Double-check Date, Amount, and Account
                before continuing.
              </p>
            </div>
          )}

          {/* Import options — skip junk rows above/below the data + date format
              + default currency. Changing the skip count re-detects the columns
              below; date format / currency apply on Continue. */}
          <details className="rounded-lg border bg-muted/30 p-3" open>
            <summary className="cursor-pointer text-sm font-medium">
              Import options
              <InfoTip
                label="About import options"
                text="Skip header / footer rows, date format, default currency. If the real column names aren't on the first row (a title or summary row sits above them), skip those rows: the columns below refresh automatically."
              />
            </summary>
            <div className="mt-3 space-y-3">
              <div className="grid gap-3 regular:grid-cols-2">
                <Field
                  label="Skip N header rows"
                  control="number"
                  id="map-skip-h"
                  min={0}
                  max={100}
                  value={skipHeaderRows}
                  onChange={(e) => {
                    const v = e.target.value;
                    setSkipHeaderRows(v);
                    scheduleReparse(v, skipFooterRows);
                  }}
                />
                <Field
                  label="Skip N footer rows"
                  control="number"
                  id="map-skip-f"
                  min={0}
                  max={100}
                  value={skipFooterRows}
                  onChange={(e) => {
                    const v = e.target.value;
                    setSkipFooterRows(v);
                    scheduleReparse(skipHeaderRows, v);
                  }}
                />
                <Field
                  label="Date format"
                  control="select"
                  id="map-date-fmt"
                  value={dateFormatOverride}
                  onValueChange={(v) => setDateFormatOverride(v as DateFormatUi)}
                  compact
                  options={[
                    { value: "auto", label: "Auto-detect" },
                    { value: "DD/MM/YYYY", label: "DD/MM/YYYY" },
                    { value: "MM/DD/YYYY", label: "MM/DD/YYYY" },
                    { value: "YYYY-MM-DD", label: "YYYY-MM-DD" },
                  ]}
                />
                <Field
                  label="Default currency (rows missing one)"
                  control="select"
                  value={defaultCurrency || NONE}
                  onValueChange={(v) => setDefaultCurrency(!v || v === NONE ? "" : v)}
                  placeholder="— None —"
                  compact
                  options={[
                    { value: NONE, label: "— None —" },
                    ...SUPPORTED_CURRENCIES.map((c) => ({ value: c, label: c })),
                  ]}
                />
              </div>
              <Field
                label="Flip sign of amounts"
                control="switch"
                info="Multiply every amount by -1 on import, for sources that export expenses as positive (or income as negative). The sample below updates to match."
                checked={mapping.flipSign === true}
                onCheckedChange={(v) => setMapping((prev) => ({ ...prev, flipSign: v }))}
              />
              {redetecting && (
                <p data-keep="status" className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Re-reading file…
                </p>
              )}
            </div>
          </details>

          {noColumns && (
            <div className="flex items-center gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2">
              <AlertCircle className="h-4 w-4 text-warning shrink-0" />
              <p className="text-xs text-warning">
                No columns found — you may have skipped past the end of the file.
                Lower the skip count.
              </p>
            </div>
          )}

          {/* Mapping table */}
          <FieldGroup label="Column mapping">
            {MAPPING_FIELDS.map((field) => (
              <Field
                key={field}
                label={FIELD_LABELS[field]}
                control="select"
                value={mapping[field] ?? NONE}
                onValueChange={(v) => setField(field, (!v || v === NONE) ? "" : v)}
                placeholder="—"
                compact
                options={[
                  { value: NONE, label: "— not mapped —" },
                  ...localHeaders.map((h) => ({ value: h, label: h })),
                ]}
              />
            ))}
          </FieldGroup>

          {/* FINLYNQ-195 — investment-account-only column mappings. Shown ONLY
              when the import target is an investment account; a cash account
              never renders these (and they're stripped at confirm anyway).
              v1 captures ticker/name/qty into staging / bank_transactions —
              it does NOT yet materialize lot-aware portfolio operations. */}
          {isInvestment && (
            <FieldGroup label="Investment columns" info="This is an investment account. Map the security ticker/symbol, name, and quantity from your brokerage export. These are captured with the imported rows for now; they aren't yet turned into buy/sell positions.">
              {INVESTMENT_FIELDS.map((field) => (
                <Field
                  key={field}
                  label={INVESTMENT_FIELD_LABELS[field]}
                  control="select"
                  value={mapping[field] ?? NONE}
                  onValueChange={(v) =>
                    setInvestmentField(field, !v || v === NONE ? "" : v)
                  }
                  placeholder="—"
                  compact
                  options={[
                    { value: NONE, label: "— not mapped —" },
                    ...localHeaders.map((h) => ({ value: h, label: h })),
                  ]}
                />
              ))}
            </FieldGroup>
          )}

          {/* Default account */}
          <Field
            label="Default Account"
            info="Used when the Account column is not mapped, or when a row's account cell is empty."
            control="select"
            value={defaultAccount}
            onValueChange={(v) => setDefaultAccount(v ?? "")}
            placeholder="— none —"
            compact
            options={accounts.map((a) => ({ value: a, label: a }))}
          />

          {/* Live sample — how rows land in staging with the current mapping. */}
          {mappedSample.length > 0 && (
            <div className="space-y-1.5">
              <h3 className="text-sm font-medium">Sample (first {mappedSample.length} rows)</h3>
              <div className="max-h-64 overflow-y-auto">
                <SectionCard list>
                  {mappedSample.map((r, i) => {
                    const invParts = isInvestment ? [r.ticker, r.security, r.quantity ? `qty ${r.quantity}` : null] : [];
                    const subtitle = [r.date || "—", r.account || null, r.note || null, ...invParts].filter(Boolean).join(" · ");
                    return (
                      <ListRow
                        key={i}
                        title={r.payee || r.account || "—"}
                        subtitle={subtitle}
                        value={<span className="font-mono text-sm">{r.amount || "—"}</span>}
                        secondary={r.currency || undefined}
                      />
                    );
                  })}
                </SectionCard>
              </div>
            </div>
          )}

          {/* Template name */}
          <Field
            label="Template name"
            info="Save this mapping as a template. Future uploads with the same columns will use this mapping automatically."
            id="col-map-tpl-name"
            value={templateName}
            onChange={(e) => setTemplateName(e.target.value)}
            placeholder="e.g. CIBC Mastercard"
            compact
          />

          {/* §B — per-account auto-vs-ask choice. Shown in BOTH modes (the
              saved template auto-applies via header-match next time; this
              controls whether that match is confirmed or applied silently). */}
          <Field
            label="On future uploads to this account"
            control="segmented"
            info="Ask me to confirm first: show this mapping for review each time (recommended). Apply automatically: import silently and don't ask again for this account; reset anytime on the account's page, Import preferences."
            value={dontAskAgain ? "auto" : "ask"}
            onValueChange={(v) => setDontAskAgain(v === "auto")}
            fill
            options={[
              { value: "ask", label: "Ask me to confirm first" },
              { value: "auto", label: "Apply this mapping automatically" },
            ]}
          />

          {error && (
            <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2">
              <AlertCircle className="h-4 w-4 text-destructive shrink-0" />
              <p className="text-xs text-destructive">{error}</p>
            </div>
          )}
        </div>
    </Overlay>
  );
}
