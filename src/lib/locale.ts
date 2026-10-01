/**
 * Display-language preference (formats only, no UI text translation).
 * Dependency-free: safe in client, server and MCP bundles.
 *
 * ONE table (LANGUAGES) drives everything; adding a language = one new row.
 * Separators, month/weekday names come from `intl`; numeric date order from
 * `datePattern`. Compact K/M/B is language-independent (decimal sep localized).
 *
 * pref = "auto" | LanguageCode. An explicit code always wins over auto.
 * auto: base (display) currency VND -> vi; other known currency -> en;
 *       unknown/loading -> browser language (navigator.languages[0]) matched
 *       against LANGUAGES, else en.
 *
 * Active locale lives in module state. Only the client LanguageProvider sets
 * it, so server-rendered/API/CSV/MCP/email strings stay at the "en" default.
 */

export type DatePattern = "dmy" | "ymd";

export const LANGUAGES = [
  { code: "en", label: "English", intl: "en-CA", datePattern: "dmy" },
  { code: "vi", label: "Tiếng Việt", intl: "vi-VN", datePattern: "dmy" },
  { code: "ja", label: "日本語", intl: "ja-JP", datePattern: "ymd" },
] as const satisfies ReadonlyArray<{
  code: string;
  label: string;
  intl: string;
  datePattern: DatePattern;
}>;

export type LanguageCode = (typeof LANGUAGES)[number]["code"];
export type LanguagePref = "auto" | LanguageCode;
export type DisplayLocale = (typeof LANGUAGES)[number]["intl"];

export const LANGUAGE_PREFS: readonly LanguagePref[] = ["auto", ...LANGUAGES.map((l) => l.code)];
export const DEFAULT_LANGUAGE_PREF: LanguagePref = "auto";
export const LANGUAGE_SETTING_KEY = "language";
export const LANGUAGE_EXAMPLE_NUMBER = 1234567.89;

const DEFAULT_LANGUAGE = LANGUAGES[0];

export function isLanguagePref(v: unknown): v is LanguagePref {
  return typeof v === "string" && (LANGUAGE_PREFS as readonly string[]).includes(v);
}

export function languageByLocale(locale: string) {
  return LANGUAGES.find((l) => l.intl === locale) ?? DEFAULT_LANGUAGE;
}

/**
 * Resolve a preference to an Intl locale.
 * `baseCurrency`: user's reporting currency; null/undefined while unknown/loading.
 * `browserLang`: navigator.languages[0].
 */
export function resolveDisplayLocale(
  pref: LanguagePref,
  baseCurrency?: string | null,
  browserLang?: string | null,
): DisplayLocale {
  if (pref !== "auto") return LANGUAGES.find((l) => l.code === pref)!.intl;
  const cur = (baseCurrency ?? "").trim().toUpperCase();
  if (cur) return cur === "VND" ? "vi-VN" : DEFAULT_LANGUAGE.intl;
  const b = (browserLang ?? "").toLowerCase();
  return (LANGUAGES.find((l) => b === l.code || b.startsWith(`${l.code}-`)) ?? DEFAULT_LANGUAGE).intl;
}

export function detectBrowserLanguage(): string | null {
  if (typeof navigator === "undefined") return null;
  return navigator.languages?.[0] ?? navigator.language ?? null;
}

let activeLocale: DisplayLocale = DEFAULT_LANGUAGE.intl;

export function setActiveDisplayLocale(locale: DisplayLocale): void {
  activeLocale = locale;
}

/** Intl locale for the active preference ("en-CA" unless the client provider set another). */
export function getDisplayLocale(): DisplayLocale {
  return activeLocale;
}

const partsCache = new Map<string, { decimal: string; group: string }>();

/** Decimal/group separators for a locale, read from Intl.formatToParts. */
export function getSeparators(locale: string = activeLocale): { decimal: string; group: string } {
  let hit = partsCache.get(locale);
  if (!hit) {
    const parts = new Intl.NumberFormat(locale).formatToParts(1234567.5);
    hit = {
      decimal: parts.find((p) => p.type === "decimal")?.value ?? ".",
      group: parts.find((p) => p.type === "group")?.value ?? ",",
    };
    partsCache.set(locale, hit);
  }
  return hit;
}

/** Replace the "." of a fixed-notation string with the locale decimal separator. */
export function localizeDecimal(s: string, locale: string = activeLocale): string {
  const { decimal } = getSeparators(locale);
  return decimal === "." ? s : s.replace(".", decimal);
}

/** `value.toFixed(digits)` in the active locale (no grouping). */
export function formatFixed(value: number, digits: number): string {
  return localizeDecimal(value.toFixed(digits));
}

/** "12.5%" (en) / "12,5%" (vi). Percent value, not a fraction. */
export function formatPercent(value: number, digits = 1): string {
  return `${formatFixed(value, digits)}%`;
}

/** Numeric date string for the active language: dd/mm/yyyy (en, vi) or yyyy/mm/dd (ja). */
export function formatNumericDate(
  year: string,
  month: string,
  day: string,
  locale: string = activeLocale,
): string {
  return languageByLocale(locale).datePattern === "ymd"
    ? `${year}/${month}/${day}`
    : `${day}/${month}/${year}`;
}

/** Month/weekday-name date formatting in the active locale. */
export function formatDateNames(date: Date, opts: Intl.DateTimeFormatOptions): string {
  return date.toLocaleDateString(activeLocale, opts);
}

/** Short weekday names Sunday..Saturday in the active locale. */
export function weekdayShortNames(): string[] {
  return Array.from({ length: 7 }, (_, i) =>
    new Date(2026, 0, 4 + i).toLocaleDateString(activeLocale, { weekday: "short" }),
  );
}
