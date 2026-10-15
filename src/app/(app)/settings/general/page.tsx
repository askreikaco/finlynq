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
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Overlay } from "@/components/ui/overlay";
import { Loader2, Monitor, Moon, Palette, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useDisplayCurrency } from "@/components/currency-provider";
import { useFont, FONT_OPTIONS, type FontKey } from "@/components/font-provider";
import { useDisplayCurrencyOptions } from "@/lib/hooks/useDisplayCurrencyOptions";
import { FxOverridesSection } from "@/components/fx-overrides-section";
import { LanguageCard } from "@/components/settings/language-card";
import { ActiveCurrenciesSection } from "@/components/active-currencies-section";
import { DisplaySection } from "@/components/settings/sections/display-section";
import { SectionPage } from "@/components/templates";
import { Field } from "@/components/ui/field";
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
    <SectionPage
      id="settings-general"
      title="General"
      padBottom="none"
      minW0={false}
      suspense={false}
      grid
    >

      {/* Display Preferences */}
      <Card
        title="Display"
        icon={Palette}
        tone="violet"
        info="Customize how data is displayed."
        infoLabel="About display"
        className="space-y-3"
      >
        {/* Shared `useDisplayCurrencyOptions` rather than the bare built-in
            list: it also offers any currency the user has a custom rate
            for. Without that, the PUT route's own rejection message ("Add a
            custom rate via Settings → Custom exchange rates first") was a
            dead end — after adding the rate, no picker listed the currency. */}
        <Field
          label="Currency"
          labelPlacement="inline"
          control="combobox"
          info="Totals are converted to this currency. Row amounts keep their own currency."
          controlWidth="w-44 regular:w-56"
          value={displayCurrency}
          onValueChange={handleCurrencySelect}
          options={currencyOptions}
          placeholder="Select currency"
          searchPlaceholder="Search currencies…"
          emptyMessage="No matching currency"
        />

        <Field
          label="Font"
          labelPlacement="inline"
          control="select"
          info="This browser only."
          controlWidth="w-44 regular:w-48"
          value={font}
          onValueChange={(v) => setFont(v as FontKey)}
          options={FONT_OPTIONS.map((o) => ({ value: o.key, label: o.label }))}
        />

        <Field
          label="Theme"
          labelPlacement="inline"
          control="segmented"
          value={theme ?? "system"}
          onValueChange={(v) => setTheme(v)}
          options={[
            { value: "system", label: "System", icon: Monitor },
            { value: "light", label: "Light", icon: Sun },
            { value: "dark", label: "Dark", icon: Moon },
          ]}
        />

        <Field
          label="Animations"
          labelPlacement="inline"
          control="switch"
          info="Smooth number and chart transitions. Off is faster."
          id="animation-toggle"
          checked={animationsEnabled}
          onCheckedChange={setAnimationsEnabled}
        />

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
      </Card>

      {/* Confirm currency switch — re-derives every stored reporting amount. */}
      <Overlay
        variant="confirm"
        destructive={false}
        open={pendingCurrency != null}
        onClose={() => setPendingCurrency(null)}
        title={`Switch display currency to ${pendingCurrency}?`}
        message={`Recalculates all reports, gains and tax figures into ${pendingCurrency} at historical rates. Runs in the background.`}
        confirmLabel={`Switch to ${pendingCurrency}`}
        onConfirm={confirmCurrencyChange}
      />

      <LanguageCard />

      <ActiveCurrenciesSection />

      <div className="col-span-full">
        <FxOverridesSection />
      </div>

      <DisplaySection />
    </SectionPage>
  );
}
