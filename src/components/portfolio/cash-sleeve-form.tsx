"use client";

/**
 * Add-cash-sleeve form: a per-currency cash position inside an investment
 * account (one sleeve per currency). Shared so the accounts package can reuse
 * it; its page is /settings/investments/cash-sleeves/new?accountId=N.
 * POST /api/portfolio/holdings/cash-sleeve {accountId, currency}.
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { parseSaveError } from "@/lib/save-error";

export function CashSleeveForm({
  accountId,
  onCancel,
  onSaved,
}: {
  accountId: number;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [currency, setCurrency] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    const cur = currency.trim().toUpperCase();
    if (!/^[A-Z]{3,4}$/.test(cur)) {
      setError("Enter a 3-4 letter currency code");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/portfolio/holdings/cash-sleeve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId, currency: cur }),
      });
      if (!res.ok) {
        setError(await parseSaveError(res, "Failed to add cash sleeve"));
        return;
      }
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <div className="rounded-xl border bg-card px-4 py-2">
        <label htmlFor="cash-currency" className="block pb-1 text-sm text-muted-foreground">
          Currency
        </label>
        <Input
          id="cash-currency"
          value={currency}
          onChange={(e) => setCurrency(e.target.value.toUpperCase())}
          placeholder="e.g. USD, EUR, XAU"
          maxLength={4}
          autoFocus
        />
        {error ? (
          <p className="pb-1 pt-1 text-xs text-destructive">{error}</p>
        ) : (
          <p className="pb-1 pt-1 text-xs text-muted-foreground">
            A per-currency cash position in this account (e.g. a USD sleeve in a CAD account).
            One sleeve per currency.
          </p>
        )}
      </div>
      <div className="mt-4 flex items-center justify-end gap-2 pb-[calc(var(--sab,0px)+1.5rem)]">
        <Button type="button" variant="outline" onClick={onCancel} disabled={submitting}>
          Cancel
        </Button>
        <Button type="submit" disabled={submitting}>
          {submitting ? "Adding…" : "Add cash sleeve"}
        </Button>
      </div>
    </form>
  );
}
