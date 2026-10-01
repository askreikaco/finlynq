import { formatDateNames, formatNumericDate, getDisplayLocale } from "@/lib/locale";

/**
 * Custom symbols for the "dollar family" so CAD renders as `C$` and USD as the
 * bare `$`. `Intl.NumberFormat` can only produce `$` / `CA$` / `CAD` for CAD —
 * never `C$` — so the dollar currencies are formatted as plain decimals with a
 * hand-picked symbol prefix. Every other currency keeps its native Intl symbol
 * (EUR → €, GBP → £, JPY → ¥, …).
 */
const DOLLAR_SYMBOLS: Record<string, string> = {
  USD: "$",
  CAD: "C$",
  AUD: "A$",
  NZD: "NZ$",
  HKD: "HK$",
  SGD: "S$",
  MXN: "MX$",
};

/**
 * ISO 4217 minor-unit count for a currency (VND/JPY/KRW → 0, USD/EUR → 2),
 * read from Intl so zero-decimal currencies don't render a meaningless ".00".
 * Custom / non-ISO codes that Intl rejects fall back to 2.
 */
export function currencyDecimals(currency: string): number {
  try {
    return new Intl.NumberFormat(getDisplayLocale(), { style: "currency", currency })
      .resolvedOptions().maximumFractionDigits ?? 2;
  } catch {
    return 2;
  }
}

export function formatCurrency(
  amount: number,
  currency: string = "USD",
  opts?: { decimals?: number }
): string {
  const decimals = opts?.decimals ?? currencyDecimals(currency);
  const symbol = DOLLAR_SYMBOLS[currency];
  if (symbol) {
    const num = new Intl.NumberFormat(getDisplayLocale(), {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(Math.abs(amount));
    return `${amount < 0 ? "-" : ""}${symbol}${num}`;
  }
  try {
    return new Intl.NumberFormat(getDisplayLocale(), {
      style: "currency",
      currency,
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(amount);
  } catch {
    // Custom / non-ISO-4217 currency code. Users can add arbitrary 3-4 letter
    // codes via Settings → "Currencies you use" (+ a custom FX rate), and
    // `Intl.NumberFormat({ style: "currency", currency })` throws
    // `RangeError: Invalid currency code` for codes that aren't well-formed
    // ISO 4217 (e.g. a 4-letter "TEST"). Fall back to a plain decimal with the
    // code as a prefix so a custom-currency row never crashes the page.
    const num = new Intl.NumberFormat(getDisplayLocale(), {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(Math.abs(amount));
    const code = (currency || "").trim().toUpperCase();
    return `${amount < 0 ? "-" : ""}${code ? `${code} ` : ""}${num}`;
  }
}

/**
 * Returns the appropriate number of decimal places for a magnitude-adaptive
 * display of a numeric value (currency amount or quantity):
 *   |value| > 10        → 0 decimals  (large amounts — no fractional noise)
 *   0.1 ≤ |value| ≤ 10 → 2 decimals  (mid-range — standard precision)
 *   |value| < 0.1       → 3 decimals  (small values — need extra precision)
 *
 * Used by `formatCurrencyAdaptive` and the quantity formatter in the
 * All Holdings table (FINLYNQ-244). CSV exports stay at full precision.
 */
export function magnitudeDecimals(value: number): 0 | 2 | 3 {
  const abs = Math.abs(value);
  if (abs > 10) return 0;
  if (abs >= 0.1) return 2;
  return 3;
}

/**
 * Format a currency amount with magnitude-adaptive decimal places.
 * Wraps `formatCurrency` — chooses decimals via `magnitudeDecimals(value)`.
 * Keep CSV exports and other precision-sensitive surfaces on `formatCurrency`
 * directly (do NOT route those through this helper).
 */
export function formatCurrencyAdaptive(value: number, currency: string): string {
  return formatCurrency(value, currency, { decimals: magnitudeDecimals(value) });
}

export function formatNumber(amount: number): string {
  return new Intl.NumberFormat(getDisplayLocale(), {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatDate(date: string): string {
  const match = date.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    const [, year, month, day] = match;
    return formatNumericDate(year, month, day);
  }
  return formatDateNames(new Date(date + "T00:00:00"), {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/**
 * Format an ISO timestamp as a local date (DD/MM/YYYY).
 * Converts UTC timestamp to local date using the browser's timezone (Vietnam for VN users).
 * Returns "" for invalid input.
 */
export function formatDateTimeLocal(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const localDateStr = `${year}-${month}-${day}`;
    return formatDate(localDateStr);
  } catch {
    return "";
  }
}

/**
 * Format transfer FX preview text: converted amount with currency-appropriate decimal places.
 */
export function fxPreviewText(converted: number, currency: string): string {
  return converted.toFixed(currencyDecimals(currency));
}

export function getCurrentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export function getMonthLabel(month: string): string {
  const [year, m] = month.split("-");
  const date = new Date(parseInt(year), parseInt(m) - 1);
  return formatDateNames(date, { year: "numeric", month: "short" });
}
