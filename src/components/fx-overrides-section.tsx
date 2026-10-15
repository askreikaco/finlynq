"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InfoTip } from "@/components/ui/info-tip";
import { Button } from "@/components/ui/button";
import { useDropdownOrder } from "@/components/dropdown-order-provider";
import { ArrowLeftRight, Plus, RefreshCw, Trash2 } from "lucide-react";
import {
  currencyLabel,
  isSupportedCurrency,
} from "@/lib/fx/supported-currencies";
import { useActiveCurrencies } from "@/lib/hooks/useActiveCurrencies";
import { Field, type FieldComboboxOption } from "@/components/ui/field";
import { todayISO } from "@/lib/utils/date";
type Override = {
  id: number;
  currency: string;
  dateFrom: string;
  dateTo: string | null;
  rateToUsd: number;
  note: string;
  createdAt: string;
};

export function FxOverridesSection() {
  const [overrides, setOverrides] = useState<Override[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const sortCurrency = useDropdownOrder("currency");
  // Built-in fiat UNION the user's active currencies (#291) — so a custom code
  // the user already added (e.g. TEST) is selectable here directly instead of
  // showing "No matches" and forcing the "+ Custom currency code…" path.
  const activeCurrencies = useActiveCurrencies();

  // Add form
  const [adding, setAdding] = useState(false);
  const [customCode, setCustomCode] = useState(false);
  const [form, setForm] = useState({
    currency: "EUR",
    rateInput: "",
    rateMode: "to-usd" as "to-usd" | "from-usd",
    dateFrom: todayISO(),
    dateTo: "",
    note: "",
  });

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/fx/overrides");
      if (res.ok) setOverrides(await res.json());
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleAdd() {
    setError("");
    const code = form.currency.trim().toUpperCase();
    if (!/^[A-Z]{3,4}$/.test(code)) {
      setError("Currency code must be 3-4 letters");
      return;
    }
    if (code === "USD") {
      setError("USD is the anchor currency — it can't be overridden");
      return;
    }
    const rate = parseFloat(form.rateInput);
    if (!rate || rate <= 0) {
      setError("Rate must be a positive number");
      return;
    }
    const rateToUsd = form.rateMode === "to-usd" ? rate : 1 / rate;
    try {
      const res = await fetch("/api/fx/overrides", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currency: code,
          rateToUsd,
          dateFrom: form.dateFrom,
          dateTo: form.dateTo || null,
          note: form.note,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? `HTTP ${res.status}`);
      }
      // Auto-add to active currencies if it's not already there. If the
      // user is bringing in a fresh code (XAU, FJD, etc.) the override is
      // useless until the dropdowns can pick it.
      if (!isSupportedCurrency(code)) {
        await fetch("/api/settings/active-currencies").then((r) => r.ok ? r.json() : null).then((data) => {
          if (!data?.active) return;
          if (data.active.includes(code)) return;
          return fetch("/api/settings/active-currencies", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ active: [...data.active, code].sort() }),
          });
        }).catch(() => {});
      }
      setForm({ ...form, rateInput: "", note: "" });
      setCustomCode(false);
      setAdding(false);
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to add override");
    }
  }

  async function handleDelete(id: number) {
    setError("");
    try {
      const res = await fetch(`/api/fx/overrides?id=${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to delete");
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-chart-5/10 text-chart-5">
            <RefreshCw className="h-5 w-5" />
          </div>
          <div>
            <CardTitle icon={ArrowLeftRight} tone="cyan">
              Custom rates
              <InfoTip label="About custom rates" text="Pin your own FX rate when the market rate differs from your bank's, or for currencies we don't fetch. Stored as 1 USD = N currency." />
            </CardTitle>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        {loading ? (
          <p className="text-xs text-muted-foreground" data-keep="status">Loading…</p>
        ) : overrides.length === 0 ? (
          <p className="text-xs text-muted-foreground" data-keep="status">No custom rates.</p>
        ) : (
          <div className="space-y-1.5">
            {overrides.map((o) => (
              <div key={o.id} className="flex items-center justify-between gap-3 rounded-md border border-border/50 px-3 py-2 text-sm">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="font-mono text-xs font-semibold w-12">{o.currency}</span>
                  <span className="font-mono text-xs">
                    1 {o.currency} = {o.rateToUsd.toFixed(6)} USD
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {o.dateFrom}{o.dateTo ? ` → ${o.dateTo}` : " (open-ended)"}
                  </span>
                  {o.note ? <span className="text-xs text-muted-foreground italic truncate">{o.note}</span> : null}
                </div>
                <Button aria-label="Delete override" size="sm" variant="ghost" onClick={() => handleDelete(o.id)} className="h-7 w-7 p-0">
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}

        {adding ? (
          <div className="rounded-md border border-border/50 p-3 space-y-3">
            <div className="grid grid-cols-1 regular:grid-cols-2 gap-3">
              <div>
                <span className="text-xs font-medium">Currency</span>
                {customCode ? (
                  <div className="flex items-center gap-1">
                    <Field
                      placeholder="3-4 letter code"
                      value={form.currency}
                      onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })}
                      maxLength={4}
                      compact
                      controlClassName="font-mono"
                    />
                    <Button size="sm" variant="ghost" className="h-9 px-2 text-xs" onClick={() => { setCustomCode(false); setForm({ ...form, currency: "EUR" }); }}>
                      Pick from list
                    </Button>
                  </div>
                ) : (
                  <Field
                    control="combobox"
                    value={form.currency}
                    onValueChange={(v) => {
                      if (v === "__custom__") { setCustomCode(true); setForm({ ...form, currency: "" }); return; }
                      setForm({ ...form, currency: v || "EUR" });
                    }}
                    options={[
                      ...sortCurrency(
                        activeCurrencies
                          .filter((c) => c !== "USD")
                          .map((c): FieldComboboxOption => ({ value: c, label: `${c} — ${currencyLabel(c)}` })),
                        (c) => c.value,
                        (a, z) => (a.label ?? "").localeCompare(z.label ?? ""),
                      ),
                      { value: "__custom__", label: "+ Custom currency code…" } satisfies FieldComboboxOption,
                    ]}
                    placeholder="EUR"
                    searchPlaceholder="Search currencies…"
                    emptyMessage="No matches"
                    compact
                  />
                )}
                {customCode ? (
                  <p className="mt-1 text-xs text-muted-foreground" data-keep="status">
                    Added to your currencies automatically.
                  </p>
                ) : null}
              </div>
              <div>
                <span className="text-xs font-medium">Rate</span>
                <div className="flex items-center gap-1">
                  <span className="text-xs text-muted-foreground">1</span>
                  <Field
                    control="select"
                    value={form.rateMode === "to-usd" ? form.currency : "USD"}
                    onValueChange={(v) => setForm({ ...form, rateMode: v === "USD" ? "from-usd" : "to-usd" })}
                    compact
                    className="w-20"
                    options={[{ value: form.currency, label: form.currency }, { value: "USD", label: "USD" }]}
                  />
                  <span className="text-xs text-muted-foreground">=</span>
                  <Field
                    control="amount"
                    step="0.000001"
                    value={form.rateInput}
                    onValueChange={(nv) => setForm({ ...form, rateInput: nv })}
                    compact
                  />
                  <span className="text-xs text-muted-foreground font-mono w-8">{form.rateMode === "to-usd" ? "USD" : form.currency}</span>
                </div>
              </div>
              <Field
                label="From date"
                control="date"
                value={form.dateFrom}
                onChange={(e) => setForm({ ...form, dateFrom: e.target.value })}
                compact
              />
              <Field
                label="To date"
                optional
                control="date"
                value={form.dateTo}
                onChange={(e) => setForm({ ...form, dateTo: e.target.value })}
                placeholder="Leave blank for open-ended"
                compact
              />
            </div>
            <Field
              label="Note"
              optional
              value={form.note}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
              placeholder="e.g. Wise actual rate on 2026-04-15"
              compact
            />
            <div className="flex items-center gap-2 pt-1">
              <Button size="sm" onClick={handleAdd}>Save override</Button>
              <Button size="sm" variant="outline" onClick={() => setAdding(false)}>Cancel</Button>
            </div>
          </div>
        ) : (
          <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            Add custom rate
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
