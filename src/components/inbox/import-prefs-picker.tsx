"use client";

/**
 * ImportPrefsPicker — per-account import field-mapping preferences for the
 * account detail page (2026-06-04).
 *
 * Two persisted controls, both PATCHing /api/accounts/[id]/import-prefs:
 *   - Field-mapping confirmation: 'confirm' (show the CSV column-mapping /
 *     OFX field-mapping preview before staging) vs 'auto' (apply silently).
 *   - OFX/QFX payee default: which field (Name vs Memo) becomes the payee.
 *
 * This is the canonical home for RESETTING an account that was set to "apply
 * automatically" back to "ask me first" — once 'auto', the upload preview
 * never re-appears, so there'd otherwise be no way back. Saves immediately on
 * change (one click to reset) with a transient "Saved" indicator.
 */

import { useState } from "react";
import { Check } from "lucide-react";
import { Field } from "@/components/ui/field";

export type CsvMappingMode = "confirm" | "auto";
export type OfxPayeeSource = "name" | "memo";

export function ImportPrefsPicker({
  accountId,
  initialCsvMappingMode,
  initialOfxPayeeSource,
  onSaved,
}: {
  accountId: number;
  initialCsvMappingMode: CsvMappingMode;
  initialOfxPayeeSource: OfxPayeeSource;
  onSaved?: (prefs: {
    csvMappingMode: CsvMappingMode;
    ofxPayeeSource: OfxPayeeSource;
  }) => void;
}) {
  const [csvMode, setCsvMode] = useState<CsvMappingMode>(initialCsvMappingMode);
  const [payeeSource, setPayeeSource] =
    useState<OfxPayeeSource>(initialOfxPayeeSource);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function patch(
    prefs: Partial<{ csvMappingMode: CsvMappingMode; ofxPayeeSource: OfxPayeeSource }>,
  ) {
    setSaving(true);
    setError(null);
    setSavedAt(false);
    try {
      const res = await fetch(`/api/accounts/${accountId}/import-prefs`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(prefs),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || body.success === false) {
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      setSavedAt(true);
      onSaved?.({
        csvMappingMode: body.data?.csvMappingMode ?? csvMode,
        ofxPayeeSource: body.data?.ofxPayeeSource ?? payeeSource,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <Field
        label="Confirm before importing"
        control="segmented"
        info="Ask first: show the CSV column mapping / OFX field preview before any rows are staged. Apply automatically: import silently using the detected mapping / saved payee source."
        value={csvMode}
        disabled={saving}
        onValueChange={(v) => {
          setCsvMode(v as CsvMappingMode);
          void patch({ csvMappingMode: v as CsvMappingMode });
        }}
        fill
        options={[
          { value: "confirm", label: "Ask first" },
          { value: "auto", label: "Apply automatically" },
        ]}
      />

      <Field
        label="OFX/QFX payee comes from"
        control="segmented"
        info="Name field (default): the Memo becomes the transaction Note. Memo field: for banks that put the merchant in Memo and a generic label in Name."
        value={payeeSource}
        disabled={saving}
        onValueChange={(v) => {
          setPayeeSource(v as OfxPayeeSource);
          void patch({ ofxPayeeSource: v as OfxPayeeSource });
        }}
        fill
        options={[
          { value: "name", label: "Name field" },
          { value: "memo", label: "Memo field" },
        ]}
      />
      {error && (
        <p className="text-xs text-destructive">{error}</p>
      )}
      {savedAt && !saving && !error && (
        <span className="inline-flex items-center gap-1 text-xs text-pos">
          <Check className="h-3.5 w-3.5" />
          Saved
        </span>
      )}
    </div>
  );
}
