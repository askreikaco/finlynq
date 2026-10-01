"use client";

/**
 * AmountInput — amount field that follows the Language preference.
 * Locales whose decimal separator is "." (en, ja): unchanged native `type="number"` input.
 * Others (vi): text input accepting "1.234.567" / "1,5" (parse-amount.ts:parseAmountInput);
 * the parent state always holds the canonical dot-decimal string ("1234567",
 * "1.5") so existing parseFloat/submit code is unaffected.
 */

import { useEffect, useState, type ComponentProps } from "react";
import { Input } from "@/components/ui/input";
import { useLanguage } from "@/components/language-provider";
import { parseAmountInput } from "@/lib/parse-amount";
import { getSeparators } from "@/lib/locale";

type Props = Omit<ComponentProps<typeof Input>, "value" | "onChange" | "type"> & {
  value: string | number | null | undefined;
  onValueChange: (canonical: string) => void;
  /** Render a bare <input> (for call sites that were raw inputs with their own classes). */
  native?: boolean;
};

export function AmountInput({ value: rawValue, onValueChange, native, ...rest }: Props) {
  const value = rawValue == null ? "" : String(rawValue);
  const Field = (native ? "input" : Input) as typeof Input;
  const { locale } = useLanguage();
  const sep = getSeparators(locale).decimal;
  const vi = sep !== ".";
  const [draft, setDraft] = useState(() => value.replace(".", sep));

  useEffect(() => {
    if (!vi) return;
    const fromDraft = parseAmountInput(draft, locale);
    const fromValue = parseFloat(value);
    const same =
      (Number.isNaN(fromDraft) && Number.isNaN(fromValue)) || fromDraft === fromValue;
    if (!same) setDraft(value.replace(".", sep));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, vi, locale]);

  if (!vi) {
    return (
      <Field {...rest} type="number" value={value} onChange={(e) => onValueChange(e.target.value)} />
    );
  }
  // step/min/max are native-number attributes; drop them for the text input.
  const { step: _s, min: _mi, max: _ma, ...textProps } = rest as Record<string, unknown>;
  return (
    <Field
      {...(textProps as object)}
      type="text"
      inputMode="decimal"
      value={draft}
      onChange={(e) => {
        const raw = e.target.value;
        setDraft(raw);
        const n = parseAmountInput(raw, locale);
        onValueChange(Number.isNaN(n) ? "" : String(n));
      }}
    />
  );
}
