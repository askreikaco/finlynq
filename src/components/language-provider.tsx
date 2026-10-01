"use client";

/**
 * LanguageProvider — per-user language preference (auto | en | vi),
 * (auto resolves from the base/display currency, browser as fallback), fetched from `/api/settings/language`. Sets the module-level active
 * locale used by every formatter (`@/lib/locale`) and remounts its
 * subtree (key = locale) so non-hook formatter callers re-render on change.
 */

import {
  createContext,
  Fragment,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { useDisplayCurrency } from "@/components/currency-provider";
import {
  DEFAULT_LANGUAGE_PREF,
  detectBrowserLanguage,
  isLanguagePref,
  resolveDisplayLocale,
  setActiveDisplayLocale,
  type LanguagePref,
  type DisplayLocale,
} from "@/lib/locale";

type Ctx = {
  pref: LanguagePref;
  locale: DisplayLocale;
  setPref: (p: LanguagePref) => Promise<boolean>;
};

const LanguageContext = createContext<Ctx | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [pref, setPrefState] = useState<LanguagePref>(DEFAULT_LANGUAGE_PREF);
  const [browserLang, setBrowserLang] = useState<string | null>(null);
  const { displayCurrency, isLoading } = useDisplayCurrency();
  const locale = resolveDisplayLocale(pref, isLoading ? null : displayCurrency, browserLang);

  // Keep module state in sync during render so children formatted in this
  // pass see the new locale.
  setActiveDisplayLocale(locale);

  useEffect(() => {
    setBrowserLang(detectBrowserLanguage());
    let cancelled = false;
    fetch("/api/settings/language")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled && d && isLanguagePref(d.pref)) setPrefState(d.pref);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const setPref = useCallback(async (p: LanguagePref) => {
    const prev = pref;
    setPrefState(p);
    try {
      const res = await fetch("/api/settings/language", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pref: p }),
      });
      if (!res.ok) throw new Error("save failed");
      return true;
    } catch {
      setPrefState(prev);
      return false;
    }
  }, [pref]);

  const value = useMemo(() => ({ pref, locale, setPref }), [pref, locale, setPref]);

  return (
    <LanguageContext.Provider value={value}>
      <Fragment key={locale}>{children}</Fragment>
    </LanguageContext.Provider>
  );
}

export function useLanguage(): Ctx {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    return { pref: DEFAULT_LANGUAGE_PREF, locale: "en-CA" as DisplayLocale, setPref: async () => false };
  }
  return ctx;
}
