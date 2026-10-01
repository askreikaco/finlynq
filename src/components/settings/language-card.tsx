"use client";

/**
 * Settings > General: Language card (formats only, no UI text translation).
 * Pref stored via LanguageProvider -> /api/settings/language.
 */

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Languages } from "lucide-react";
import { useDisplayCurrency } from "@/components/currency-provider";
import { detectBrowserLanguage } from "@/lib/locale";
import { useLanguage } from "@/components/language-provider";
import {
  LANGUAGES,
  LANGUAGE_EXAMPLE_NUMBER,
  formatNumericDate,
  isLanguagePref,
  resolveDisplayLocale,
  type LanguagePref,
} from "@/lib/locale";

const OPTIONS: { value: LanguagePref; label: string }[] = [
  { value: "auto", label: "Auto (from display currency)" },
  ...LANGUAGES.map((l) => ({ value: l.code as LanguagePref, label: l.label })),
];

const EXAMPLE_DATE = new Date(2026, 9, 1);

/** Live example for a pref, independent of the active locale. Exported for tests. */
export function languageExample(
  pref: LanguagePref,
  baseCurrency: string | null,
  browserLang: string | null,
) {
  const locale = resolveDisplayLocale(pref, baseCurrency, browserLang);
  const number = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(LANGUAGE_EXAMPLE_NUMBER);
  const dd = String(EXAMPLE_DATE.getDate()).padStart(2, "0");
  const mm = String(EXAMPLE_DATE.getMonth() + 1).padStart(2, "0");
  const numeric = formatNumericDate(String(EXAMPLE_DATE.getFullYear()), mm, dd, locale);
  const named = EXAMPLE_DATE.toLocaleDateString(locale, { year: "numeric", month: "short" });
  return { number, date: `${numeric} · ${named}` };
}

export function LanguageCard() {
  const { pref, setPref } = useLanguage();
  const { displayCurrency, isLoading } = useDisplayCurrency();
  const [error, setError] = useState<string | null>(null);
  const example = languageExample(pref, isLoading ? null : displayCurrency, detectBrowserLanguage());

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-100 text-sky-600">
            <Languages className="h-5 w-5" />
          </div>
          <div>
            <CardTitle className="text-base">Language</CardTitle>
            <CardDescription>Number, date, month and weekday formats (labels are not translated)</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <Select
          value={pref}
          onValueChange={async (v) => {
            if (!isLanguagePref(v)) return;
            setError(null);
            if (!(await setPref(v))) setError("Could not save. Try again.");
          }}
        >
          <SelectTrigger className="w-64" aria-label="Language">
            <SelectValue>{OPTIONS.find((o) => o.value === pref)?.label}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-sm text-muted-foreground" data-testid="language-example">
          Example: <span className="font-mono text-foreground">{example.number}</span>
          {" · "}
          <span className="font-mono text-foreground">{example.date}</span>
        </p>
        {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
      </CardContent>
    </Card>
  );
}
