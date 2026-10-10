"use client";

/**
 * Manage-prices panel for a manually-priced security (price_source='manual').
 *
 * Full page at /settings/investments/securities/[id]/prices (was a dialog —
 * the file keeps its name because tests/w6/w6-26 pins it). Lists the security's
 * `custom_security_prices` marks (one per date, newest first) with delete, plus
 * an add form (date + price). The "effective price at date D" the valuation
 * paths read is the latest mark on-or-before D (forward-fill); before the first
 * mark the holding values at 0. Wired to /api/securities/prices (DEK-free).
 * → custom-prices.ts. Delete stays a confirm dialog.
 */

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { DatePicker } from "@/components/date-picker";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { parseSaveError } from "@/lib/save-error";
import { formatCurrency } from "@/lib/currency";
import { todayISO } from "@/lib/utils/date";
import { Loader2, Trash2 } from "lucide-react";
import { AmountInput } from "@/components/amount-input";

type Mark = { id: number; date: string; price: number; currency: string };

export function ManagePricesPanel({
  securityId,
  currency,
  onDone,
}: {
  securityId: number;
  currency: string;
  /** Back / Done. */
  onDone: () => void;
}) {
  const [marks, setMarks] = useState<Mark[]>([]);
  const [loading, setLoading] = useState(false);
  const [date, setDate] = useState(todayISO());
  const [price, setPrice] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/securities/prices?securityId=${securityId}`);
      if (res.ok) {
        const json = await res.json();
        setMarks((json.data ?? []) as Mark[]);
      }
    } finally {
      setLoading(false);
    }
  }, [securityId]);

  useEffect(() => {
    load();
  }, [load]);

  async function submit() {
    const value = Number(price);
    if (!price.trim() || !Number.isFinite(value) || value < 0) {
      setError("Enter a price (0 or more)");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/securities/prices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ securityId, date, price: value }),
      });
      if (!res.ok) {
        setError(await parseSaveError(res, "Failed to save price"));
        return;
      }
      setPrice("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save price");
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (deleteId == null) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/securities/prices?id=${deleteId}`, { method: "DELETE" });
      if (res.ok) {
        setDeleteId(null);
        await load();
      }
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Enter what this holding is worth, with an effective date. The most recent price on or
        before any date is used to value it; before your first price it counts as 0. Amounts are
        in {currency}.
      </p>

      {/* Existing marks */}
      <div className="max-h-[50vh] divide-y overflow-y-auto rounded-xl border bg-card">
        {loading ? (
          <div className="flex items-center gap-2 px-4 py-4 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : marks.length === 0 ? (
          <div className="px-4 py-4 text-sm text-muted-foreground">No prices yet — add one below.</div>
        ) : (
          marks.map((m) => (
            <div key={m.id} className="flex min-h-11 items-center justify-between gap-3 px-4 py-2 text-sm">
              <span className="font-mono tabular-nums text-muted-foreground">{m.date}</span>
              <span className="ml-auto font-medium tabular-nums">{formatCurrency(m.price, m.currency)}</span>
              <Button
                aria-label="Delete this price"
                variant="ghost"
                size="sm"
                className="h-11 w-11 px-0"
                onClick={() => setDeleteId(m.id)}
                title="Delete this price"
              >
                <Trash2 className="h-3.5 w-3.5 text-destructive" />
              </Button>
            </div>
          ))
        )}
      </div>

      {/* Add a mark */}
      <div className="grid grid-cols-1 items-end gap-3 regular:grid-cols-2">
        <DatePicker value={date} onChange={setDate} max={todayISO()} label="Effective date" />
        <div className="space-y-1">
          <Label>Price ({currency})</Label>
          <AmountInput
            inputMode="decimal"
            step="any"
            min="0"
            value={price}
            onValueChange={(nv) => setPrice(nv)}
            placeholder="0.00"
          />
        </div>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}

      <div className="flex items-center justify-end gap-2 pb-[calc(var(--sab,0px)+1.5rem)]">
        <Button variant="outline" onClick={onDone} disabled={saving}>
          Done
        </Button>
        <Button onClick={submit} disabled={saving}>
          {saving ? "Saving…" : "Add price"}
        </Button>
      </div>

      <ConfirmDialog
        open={deleteId != null}
        onOpenChange={(o) => {
          if (!o) setDeleteId(null);
        }}
        title="Delete price"
        description="Remove this price mark? The holding will fall back to the next most recent price (or 0)."
        confirmLabel="Delete"
        busyLabel="Deleting…"
        busy={deleting}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
