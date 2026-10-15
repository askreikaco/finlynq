"use client";

/**
 * ModePicker — Reconciliation mode picker for the per-account settings panel
 * (Inbox v4 Phase 5, 2026-05-27).
 *
 * Surfaced inside the account detail page (/accounts/[id]). Three radio
 * options — Auto-pilot / Approve-each / Manual review — each carrying the
 * one-line sub-label + a gate-count badge. PATCHes /api/accounts/[id]/mode
 * when the user clicks Save; surfaces a small inline confirmation on
 * success so no full-page reload is needed.
 *
 * The lens-chip dropdown on /inbox links here via the gear icon. The chip
 * is throwaway; this picker is sticky (writes to accounts.mode).
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Check } from "lucide-react";
import { Field } from "@/components/ui/field";
import { MODES, MODE_ORDER, isMode, type Mode } from "./modes";

export function ModePicker({
  accountId,
  initialMode,
  onSaved,
}: {
  accountId: number;
  initialMode: Mode;
  onSaved?: (mode: Mode) => void;
}) {
  const [selected, setSelected] = useState<Mode>(initialMode);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Tracks the last successfully-persisted mode so the Save button + the
  // success badge reset cleanly when the user picks a different option.
  const [savedMode, setSavedMode] = useState<Mode>(initialMode);

  const dirty = selected !== savedMode;

  async function onSave() {
    if (!dirty) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/accounts/${accountId}/mode`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: selected }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || body.success === false) {
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const newMode: Mode = isMode(body.data?.mode) ? body.data.mode : selected;
      setSavedMode(newMode);
      setSelected(newMode);
      onSaved?.(newMode);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      <Field
        label="Reconciliation mode"
        control="segmented"
        fill
        info={MODE_ORDER.map((m) => `${MODES[m].label}: ${MODES[m].subLabel}`).join(" ")}
        hint={dirty ? `Current: ${MODES[savedMode].label}` : undefined}
        value={selected}
        onValueChange={(v) => setSelected(v as Mode)}
        options={MODE_ORDER.map((m) => ({ value: m, label: MODES[m].label, icon: MODES[m].icon }))}
      />

      {error && (
        <p className="text-xs text-destructive">{error}</p>
      )}

      <div className="flex items-center gap-2">
        <Button
          size="sm"
          onClick={() => void onSave()}
          disabled={!dirty || saving}
        >
          {saving ? "Saving…" : "Save mode"}
        </Button>
        {!dirty && savedMode === selected && !saving && (
          <span className="inline-flex items-center gap-1 text-xs text-pos">
            <Check className="h-3.5 w-3.5" />
            Saved
          </span>
        )}
      </div>
    </div>
  );
}
