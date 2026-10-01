"use client";

/**
 * LanguageProvider — per-user language preference (auto | LanguageCode;
 * auto resolves from the display currency, browser as fallback), fetched from
 * `/api/settings/language`. Sets the module-level active locale used by every
 * formatter (`@/lib/locale`) and remounts its subtree (key = locale) so
 * non-hook formatter callers re-render on a real change.
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

const CACHE_KEY = "pf-language-cache";
type Cache = { pref: LanguagePref; cur: string | null };

function readCache(): Cache | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const c = JSON.parse(raw);
    if (!isLanguagePref(c?.pref)) return null;
    return { pref: c.pref, cur: typeof c.cur === "string" ? c.cur : null };
  } catch {
    return null;
  }
}

function writeCache(c: Cache) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(c));
  } catch {
    // storage blocked — first paint just waits for the fetches.
  }
}

/**
 * First-load path (no remount): children are NOT rendered until the locale is
 * settled — either from the last-known {pref, currency} cached in
 * localStorage (instant), or from the live pref + session fetches. After that,
 * `key=locale` only changes if the user (or another device) really changed
 * the language / display currency, never on a normal page load.
 */
export function LanguageProvider({ children }: { children: ReactNode }) {
  const [pref, setPrefState] = useState<LanguagePref>(DEFAULT_LANGUAGE_PREF);
  const [prefLoaded, setPrefLoaded] = useState(false);
  const [cache, setCache] = useState<Cache | null>(null);
  const [cacheChecked, setCacheChecked] = useState(false);
  const [browserLang, setBrowserLang] = useState<string | null>(null);
  const { displayCurrency, isLoading } = useDisplayCurrency();

  const livePrefReady = prefLoaded;
  const liveCurReady = !isLoading;
  const effPref = livePrefReady ? pref : cache?.pref ?? DEFAULT_LANGUAGE_PREF;
  const effCur = liveCurReady ? displayCurrency : cache?.cur ?? null;
  const ready = cacheChecked && ((livePrefReady && liveCurReady) || cache !== null);
  const locale = resolveDisplayLocale(effPref, effCur, browserLang);

  // Keep module state in sync during render so children formatted in this
  // pass see the new locale.
  setActiveDisplayLocale(locale);

  useEffect(() => {
    setBrowserLang(detectBrowserLanguage());
    setCache(readCache());
    setCacheChecked(true);
    let cancelled = false;
    fetch("/api/settings/language")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled && d && isLanguagePref(d.pref)) setPrefState(d.pref);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setPrefLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (livePrefReady && liveCurReady) writeCache({ pref, cur: displayCurrency });
  }, [livePrefReady, liveCurReady, pref, displayCurrency]);

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
      {ready ? <Fragment key={locale}>{children}</Fragment> : null}
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
