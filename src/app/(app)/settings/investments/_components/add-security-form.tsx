"use client";

/**
 * Add-security form (bare catalog entry — no account). Full page at
 * /settings/investments/securities/new (was the "Add security" dialog).
 * Logic moved verbatim from the list page: ticker lookup auto-fills name +
 * currency + crypto flag, POST /api/securities/define creates the entry.
 */

import { useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Loader2 } from "lucide-react";
import { parseSaveError } from "@/lib/save-error";
import { cn } from "@/lib/utils";
import { FormCard, FormFooter, FormRow, SegmentedToggle } from "./form-rows";

type PriceSource = "auto" | "manual";

export function AddSecurityForm({
  onCancel,
  onSaved,
}: {
  onCancel: () => void;
  /** Called with the notice code after a successful define. */
  onSaved: (notice: string) => void;
}) {
  const [symbol, setSymbol] = useState("");
  const [name, setName] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [isCrypto, setIsCrypto] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [lookupLoading, setLookupLoading] = useState(false);
  // Manual / custom pricing. `priceSource` defaults from the ticker lookup
  // (found a live price → 'auto', else 'manual') unless the user toggles it.
  // `lookupFound` drives the status line (null = not looked up yet).
  const [priceSource, setPriceSource] = useState<PriceSource>("auto");
  const [lookupFound, setLookupFound] = useState<boolean | null>(null);
  const priceSourceTouchedRef = useRef(false);
  // Auto-fill bookkeeping (refs avoid stale-closure reads inside the async
  // lookup): which fields the user edited by hand + a sequence guard so a slow
  // lookup for a previous ticker can't clobber a newer one.
  const nameTouchedRef = useRef(false);
  const currencyTouchedRef = useRef(false);
  const cryptoTouchedRef = useRef(false);
  const lookupSeqRef = useRef(0);

  // Resolve name/currency (+ crypto detection) for a ticker. Refreshes the
  // auto-managed fields to match THIS ticker — clearing a stale auto-name when
  // the new ticker is unknown — but never overwrites a field the user edited.
  async function lookupTicker(rawSymbol: string, crypto: boolean) {
    const sym = rawSymbol.trim();
    const seq = ++lookupSeqRef.current;
    if (!sym) {
      if (!nameTouchedRef.current) setName("");
      setLookupFound(null);
      return;
    }
    setLookupLoading(true);
    try {
      // Only FORCE the crypto path when the user MANUALLY ticked the box — an
      // auto-detected crypto flag left over from a previous ticker must not
      // force-classify the next one (else BTC→AAPL stays "crypto" + no name).
      const forceCrypto = cryptoTouchedRef.current && crypto;
      const res = await fetch(
        `/api/securities/lookup?symbol=${encodeURIComponent(sym)}${forceCrypto ? "&crypto=1" : ""}`,
      );
      let found = false;
      let nextName: string | null = null;
      let nextCurrency: string | null = null;
      let nextIsCrypto: boolean | undefined;
      if (res.ok) {
        const json = await res.json();
        const d = (json.data ?? json) as {
          found?: boolean;
          name?: string | null;
          currency?: string | null;
          isCrypto?: boolean;
        };
        nextName = d?.name ?? null;
        nextCurrency = d?.currency ?? null;
        nextIsCrypto = d?.isCrypto;
        found = d?.found === true;
      }
      if (seq !== lookupSeqRef.current) return; // superseded by a newer lookup
      if (!nameTouchedRef.current) setName(nextName ?? "");
      if (!currencyTouchedRef.current && nextCurrency) setCurrency(nextCurrency);
      if (!cryptoTouchedRef.current && typeof nextIsCrypto === "boolean") setIsCrypto(nextIsCrypto);
      // A live price was found ⇒ auto-fetch; nothing found ⇒ this is a custom
      // holding the user must price manually. The user can still override.
      setLookupFound(found);
      if (!priceSourceTouchedRef.current) setPriceSource(found ? "auto" : "manual");
    } catch {
      /* best-effort — manual entry */
    } finally {
      if (seq === lookupSeqRef.current) setLookupLoading(false);
    }
  }

  async function submit() {
    const sym = symbol.trim();
    const cur = currency.trim().toUpperCase();
    const errs: Record<string, string> = {};
    if (!sym) errs.symbol = "Ticker is required";
    if (!/^[A-Z]{3,4}$/.test(cur)) errs.currency = "Enter a 3-4 letter currency code";
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    setSaving(true);
    try {
      const res = await fetch("/api/securities/define", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol: sym,
          name: name.trim() || undefined,
          currency: cur,
          isCrypto,
          priceSource,
        }),
      });
      if (!res.ok) {
        const msg = await parseSaveError(res, "Failed to add security");
        setErrors({ symbol: msg });
        return;
      }
      onSaved(priceSource === "manual" ? "security-added-manual" : "security-added");
    } catch (e) {
      setErrors({ symbol: e instanceof Error ? e.message : "Failed" });
    } finally {
      setSaving(false);
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
      <FormCard>
        <FormRow
          label="Ticker"
          htmlFor="sec-symbol"
          error={errors.symbol}
          hint="We’ll try to fill the name + currency from the ticker; edit them if needed."
        >
          <div className="relative">
            <Input
              id="sec-symbol"
              value={symbol}
              onChange={(e) => {
                setSymbol(e.target.value);
                if (!nameTouchedRef.current) setName(""); // drop stale auto-name
              }}
              onBlur={() => lookupTicker(symbol, isCrypto)}
              placeholder="e.g. AAPL, VTI, BTC"
              autoFocus
            />
            {lookupLoading && (
              <Loader2 className="absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
            )}
          </div>
        </FormRow>
        <FormRow label="Name" htmlFor="sec-name" hint="auto-filled from the ticker, or type it">
          <Input
            id="sec-name"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              nameTouchedRef.current = true;
            }}
          />
        </FormRow>
        <FormRow label="Currency" htmlFor="sec-currency" error={errors.currency}>
          <Input
            id="sec-currency"
            value={currency}
            onChange={(e) => {
              setCurrency(e.target.value.toUpperCase());
              currencyTouchedRef.current = true;
            }}
            placeholder="USD"
            maxLength={4}
          />
        </FormRow>
        <FormRow label="Crypto">
          <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3 text-sm">
            <span>Crypto asset</span>
            <Switch
              checked={isCrypto}
              onCheckedChange={(v) => {
                setIsCrypto(v);
                cryptoTouchedRef.current = true;
                lookupTicker(symbol, v);
              }}
            />
          </label>
        </FormRow>
        <FormRow
          label="Pricing"
          hint={
            <span className={cn(priceSource === "manual" && "text-warning")}>
              {priceSource === "manual"
                ? "Custom holding — prices aren’t fetched. Add them under “Prices” after creating it."
                : lookupFound === true
                  ? "✓ A live price was found — it’ll update automatically."
                  : lookupFound === false
                    ? "No live price was found for this ticker — switch to Manual if it can’t be priced."
                    : "Prices are fetched automatically from the market."}
            </span>
          }
        >
          <SegmentedToggle<PriceSource>
            options={["auto", "manual"]}
            value={priceSource}
            onChange={(mode) => {
              setPriceSource(mode);
              priceSourceTouchedRef.current = true;
            }}
            labels={{ auto: "Auto-fetch", manual: "Manual" }}
          />
        </FormRow>
      </FormCard>
      <FormFooter>
        <Button type="button" variant="outline" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button type="submit" disabled={saving}>
          {saving ? "Adding…" : "Add security"}
        </Button>
      </FormFooter>
    </form>
  );
}
