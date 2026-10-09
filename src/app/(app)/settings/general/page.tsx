"use client";

/**
 * /settings/general — Display Preferences + Active Currencies + FX
 * Overrides + Dropdown ordering (issue #57). About lives on /settings/about.
 *
 * Extracted from the monolith /settings/page.tsx. FX overrides live here
 * because their app-wide impact is essentially a display preference; the
 * legacy /settings deep-link from /transactions also lands here.
 */

import { useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Settings2, Loader2, Sun, Moon, Monitor } from "lucide-react";
import { useTheme } from "next-themes";
import { useDisplayCurrency } from "@/components/currency-provider";
import { useFont, FONT_OPTIONS, type FontKey } from "@/components/font-provider";
import { Combobox } from "@/components/ui/combobox";
import { useDisplayCurrencyOptions } from "@/lib/hooks/useDisplayCurrencyOptions";
import { FxOverridesSection } from "@/components/fx-overrides-section";
import { LanguageCard } from "@/components/settings/language-card";
import { ActiveCurrenciesSection } from "@/components/active-currencies-section";
import { DisplaySection } from "@/components/settings/sections/display-section";
import { PageHeader } from "@/components/mobile";
import { Switch } from "@/components/ui/switch";
import { useAnimationPreference } from "@/hooks/use-animations";

type RecomputeState = { active: boolean; target: string; done: number; total: number; finished: boolean };

export default function GeneralSettingsPage() {
  const { displayCurrency, setDisplayCurrency } = useDisplayCurrency();
  const currencyOptions = useDisplayCurrencyOptions(displayCurrency);
  const { font, setFont } = useFont();
  const { theme, setTheme } = useTheme();
  const { animationsEnabled, setAnimationsEnabled } = useAnimationPreference();
  const [currencyError, setCurrencyError] = useState("");
  // Pending currency awaiting confirmation (Phase 3: switching re-derives every
  // transaction's stored reporting amount at historical rates).
  const [pendingCurrency, setPendingCurrency] = useState<string | null>(null);
  const [recompute, setRecompute] = useState<RecomputeState | null>(null);

  // Poll the recompute status so the toast/banner reflects the background job.
  const pollStatus = useCallback((target: string) => {
    setRecompute({ active: true, target, done: 0, total: 0, finished: false });
    const deadline = Date.now() + 3 * 60 * 1000; // safety cap
    const tick = async () => {
      try {
        const res = await fetch("/api/settings/reporting-currency/status");
        if (res.ok) {
          const s = await res.json();
          const finished = (!!s.finished && !s.inFlight) || Date.now() > deadline;
          setRecompute({ active: true, target, done: s.done ?? 0, total: s.total ?? 0, finished });
          if (finished) {
            setTimeout(() => setRecompute((r) => (r ? { ...r, active: false } : r)), 3500);
            return;
          }
        }
      } catch {
        /* keep polling */
      }
      setTimeout(tick, 1500);
    };
    setTimeout(tick, 800);
  }, []);

  // Step 1: the Select fires this. We don't apply yet — open a confirm dialog.
  function handleCurrencySelect(val: string | null) {
    const v = (val ?? displayCurrency).toUpperCase();
    if (v === displayCurrency.toUpperCase()) return;
    setCurrencyError("");
    setPendingCurrency(v);
  }

  // Step 2: user confirmed — apply + kick the background recompute.
  async function confirmCurrencyChange() {
    const v = pendingCurrency;
    setPendingCurrency(null);
    if (!v) return;
    try {
      await setDisplayCurrency(v);
      try { localStorage.removeItem("pf-currency"); } catch {}
      pollStatus(v);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to save display currency";
      setCurrencyError(msg);
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      {/* Phones: the settings detail back row is the sticky bar; a `lead` node (here a hidden empty span)
          stops PageHeader rendering its 44px left spacer, which made an empty band above the first card. */}
      <PageHeader
          lead={<span aria-hidden className="hidden" />}
          title="General"
          titleClassName="text-2xl font-bold tracking-tight"
          subtitle="Display preferences and currencies"
          subtitleClassName="text-sm text-muted-foreground mt-0.5"
        />

      {/* Display Preferences */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-warning/10 text-warning">
              <Settings2 className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-base">Display Preferences</CardTitle>
              <CardDescription>Customize how data is displayed</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between md:gap-4">
            <div className="min-w-0 md:flex-1">
              <Label>Display Currency</Label>
              <p className="text-xs text-muted-foreground">
                Totals and aggregations across the app are converted to this currency.
                Per-row amounts (transactions, holdings) keep their entered currency.
              </p>
            </div>
            {/* Shared `useDisplayCurrencyOptions` rather than the bare built-in
                list: it also offers any currency the user has a custom rate
                for. Without that, the PUT route's own rejection message ("Add a
                custom rate via Settings → Custom exchange rates first") was a
                dead end — after adding the rate, no picker listed the currency. */}
            <div className="w-full md:w-56 md:shrink-0">
              <Combobox
                value={displayCurrency}
                onValueChange={handleCurrencySelect}
                items={currencyOptions}
                placeholder="Select currency"
                searchPlaceholder="Search currencies…"
                emptyMessage="No matching currency"
              />
            </div>
          </div>

          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <Label>UI Font</Label>
              <p className="text-xs text-muted-foreground">
                Applies to this browser only. Numeric figures use tabular numerals.
              </p>
            </div>
            <Select value={font} onValueChange={(v) => setFont(v as FontKey)}>
              <SelectTrigger className="w-44 shrink-0 md:w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                {FONT_OPTIONS.map((o) => (
                  <SelectItem key={o.key} value={o.key}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between md:gap-3">
            <div className="min-w-0 md:flex-1">
              <Label id="appearance-label">Appearance</Label>
              <p className="text-xs text-muted-foreground">
                System, light, or dark.
              </p>
            </div>
            <div
              role="radiogroup"
              aria-labelledby="appearance-label"
              className="inline-flex max-w-full self-start rounded-lg border p-0.5 md:self-auto"
            >
              {([
                { value: "system", label: "System", icon: Monitor },
                { value: "light", label: "Light", icon: Sun },
                { value: "dark", label: "Dark", icon: Moon },
              ] as const).map(({ value, label, icon: Icon }) => {
                const selected = (theme ?? "system") === value;
                return (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setTheme(value)}
                    className={`inline-flex min-h-11 items-center gap-1.5 rounded-md px-3 text-sm font-medium transition-colors ${
                      selected
                        ? "bg-primary/10 text-primary-text"
                        : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <Label htmlFor="animation-toggle">Enable Chart &amp; Counter Animations</Label>
              <p className="text-xs text-muted-foreground">
                Smooth transitions for numbers and charts. Off by default for faster rendering.
              </p>
            </div>
            <Switch
              id="animation-toggle"
              checked={animationsEnabled}
              onCheckedChange={setAnimationsEnabled}
              aria-label="Enable Chart & Counter Animations"
            />
          </div>

          {currencyError ? (
            <p className="text-sm text-destructive">{currencyError}</p>
          ) : null}
          {recompute?.active ? (
            <div className="flex items-center gap-2 rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
              {recompute.finished ? (
                <span className="text-pos">
                  Reports updated to {recompute.target}.
                </span>
              ) : (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>
                    Recalculating reports in {recompute.target} at historical rates
                    {recompute.total > 0 ? ` (${recompute.done}/${recompute.total})` : "…"}
                  </span>
                </>
              )}
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* Confirm currency switch — re-derives every stored reporting amount. */}
      <Dialog open={pendingCurrency != null} onOpenChange={(o) => { if (!o) setPendingCurrency(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Switch display currency to {pendingCurrency}?</DialogTitle>
            <DialogDescription>
              {/* The explicit {" "} is required: JSX DROPS whitespace that
                  contains a newline when it sits between an expression and the
                  next line's text, so this rendered as "into AEDusing each". */}
              This recalculates all your reports into {pendingCurrency}{" "}
              using each transaction&apos;s historical exchange rate. Your
              realized gains and
              tax figures will also re-base to {pendingCurrency}. It runs in the
              background; your reports stay usable while it finishes.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingCurrency(null)}>
              Cancel
            </Button>
            <Button onClick={confirmCurrencyChange}>Switch to {pendingCurrency}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <LanguageCard />

      <ActiveCurrenciesSection />

      <FxOverridesSection />

      <DisplaySection />
    </div>
  );
}
