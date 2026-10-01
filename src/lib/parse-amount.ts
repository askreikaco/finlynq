/**
 * `parseAmount` — pure, dependency-free amount-string parser.
 *
 * Split out of `csv-parser.ts` (2026-06-04) so client components (e.g. the
 * import column-mapping dialog's live sample preview) can reuse it WITHOUT
 * dragging `csv-parser.ts`'s server-only `@/db` import — and therefore the
 * `pg` Postgres driver (`dns`/`fs`) — into the browser bundle. `csv-parser.ts`
 * re-exports this so existing server-side callers keep importing it from there.
 *
 * This module MUST stay free of any server-only / Node-built-in imports.
 */

import { getDisplayLocale, getSeparators } from "@/lib/locale";

/**
 * Parse a raw amount string, handling:
 * - Currency symbols ($, €, £, ¥)
 * - Thousands separators (commas and spaces)
 * - Parenthesized negatives: (1,234.56) → -1234.56
 * - Unicode minus (−)
 * - European format: 1.234,56 → 1234.56
 */
export function parseAmount(raw: string): number {
  if (!raw || !raw.trim()) return NaN;

  let s = raw.trim();

  // Remove currency symbols
  s = s.replace(/[$€£¥₹]/g, "");

  // Unicode minus → regular minus
  s = s.replace(/−/g, "-");

  // Parenthesized negatives
  if (s.startsWith("(") && s.endsWith(")")) {
    s = "-" + s.slice(1, -1);
  }

  s = s.trim();

  // Detect European format: if there's exactly one comma and it has 2 digits after it
  // AND either no dots or dots used as thousands separators
  const europeanMatch = s.match(/^-?\d{1,3}(\.\d{3})*,\d{1,2}$/);
  if (europeanMatch) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else {
    // Standard format: remove commas and spaces used as thousands separators
    s = s.replace(/[,\s]/g, "");
  }

  const result = parseFloat(s);
  return isNaN(result) ? NaN : result;
}

/**
 * Parse a user-TYPED amount under a display locale (default: active locale).
 * Separators come from Intl (locale.ts:getSeparators), not hardcoded:
 * - en/ja: "," = thousands, "." = decimal ("1,234.5" -> 1234.5)
 * - vi:    "." = thousands, "," = decimal ("1.234.567" -> 1234567, "1,5" -> 1.5,
 *          ambiguous "1.234" -> 1234)
 * Strips currency symbols/spaces, accepts leading "-"/"+" and "(neg)". NaN when invalid.
 */
export function parseAmountInput(raw: string, locale: string = getDisplayLocale()): number {
  if (!raw || !raw.trim()) return NaN;
  let s = raw.trim().replace(/[$€£¥￥₹₫]/g, "").replace(/−/g, "-");
  if (s.startsWith("(") && s.endsWith(")")) s = "-" + s.slice(1, -1);
  s = s.replace(/[\s\u00a0\u202f']/g, "");
  const { decimal, group } = getSeparators(locale);
  if (s.split(decimal).length > 2) return NaN;
  if (group.trim()) s = s.split(group).join("");
  s = s.replace(decimal, ".");
  if (!/^[+-]?(\d+\.?\d*|\.\d+)$/.test(s)) return NaN;
  return parseFloat(s);
}
