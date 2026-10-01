import { describe, it, expect, afterEach } from "vitest";
import baseline from "./fixtures/currency-en-baseline.json";
import {
  formatCurrency, formatCurrencyAdaptive, formatNumber, formatDate, getMonthLabel,
} from "@/lib/currency";
import { formatCompactNumber } from "@/lib/utils/number";
import {
  setActiveDisplayLocale, resolveDisplayLocale, formatPercent, weekdayShortNames,
  formatDateNames, getSeparators, LANGUAGES, isLanguagePref,
} from "@/lib/locale";
import { parseAmountInput } from "@/lib/parse-amount";

afterEach(() => setActiveDisplayLocale("en-CA"));
const nb = (s: string) => s.replace(/[  ]/g, " ");

describe("en output is byte-identical to pre-language baseline", () => {
  it("formatCurrency / adaptive / number / dates", () => {
    const b = baseline as Record<string, string>;
    for (const c of ["VND", "USD", "CAD", "EUR", "JPY", "GBP", "XYZW"])
      for (const a of [1234567.891, -1234.5, 0, 0.05, 99.995, 1e9])
        expect(formatCurrency(a, c), `${c}|${a}`).toBe(b[`${c}|${a}`]);
    for (const a of [1234567.891, -1234.5, 0, 0.05, 99.995, 1e9]) {
      expect(formatCurrencyAdaptive(a, "USD")).toBe(b[`adaptive|${a}`]);
      expect(formatNumber(a)).toBe(b[`num|${a}`]);
    }
    expect(formatDate("2026-10-01")).toBe(b.date);
    expect(formatDate("Oct 1 2026")).toBe(b.date2);
    expect(getMonthLabel("2026-10")).toBe(b.month);
  });
  it("compact + percent", () => {
    expect(formatCompactNumber(1234567)).toBe("1.2M");
    expect(formatCompactNumber(-2500000000)).toBe("-2.5B");
    expect(formatCompactNumber(1500)).toBe("1.5K");
    expect(formatCompactNumber(572345)).toBe("572K");
    expect(formatCompactNumber(850)).toBe("850");
    expect(formatPercent(12.5, 1)).toBe("12.5%");
  });
});

describe("vi", () => {
  it("currency", () => {
    setActiveDisplayLocale("vi-VN");
    expect(nb(formatCurrency(1234567, "VND"))).toBe("1.234.567 ₫");
    expect(formatCurrency(1234567.891, "USD")).toBe("$1.234.567,89");
    expect(formatCurrency(-1234.5, "CAD")).toBe("-C$1.234,50");
    expect(formatCurrency(1234567.5, "XYZW")).toBe("XYZW 1.234.568,00".replace("568,00", "567,50"));
    expect(formatNumber(1234.5)).toBe("1.234,50");
    expect(nb(formatCurrency(1234.5, "EUR"))).toBe("1.234,50 €");
  });
  it("compact, percent, dates", () => {
    setActiveDisplayLocale("vi-VN");
    expect(formatCompactNumber(1234567)).toBe("1,2M");
    expect(formatCompactNumber(-1500)).toBe("-1,5K");
    expect(formatCompactNumber(850)).toBe("850");
    expect(formatPercent(12.5, 1)).toBe("12,5%");
    expect(formatPercent(-3, 2)).toBe("-3,00%");
    expect(formatDate("2026-10-01")).toBe("01/10/2026");
    expect(formatDateNames(new Date(2026, 9, 1), { year: "numeric", month: "short" }))
      .toBe(new Date(2026, 9, 1).toLocaleDateString("vi-VN", { year: "numeric", month: "short" }));
    expect(getMonthLabel("2026-10")).toMatch(/2026/);
    expect(getMonthLabel("2026-10")).not.toMatch(/Oct/);
    expect(weekdayShortNames()).toHaveLength(7);
    expect(weekdayShortNames()[1]).not.toBe("Mon");
  });
});

describe("ja", () => {
  it("numbers, compact, dates", () => {
    setActiveDisplayLocale("ja-JP");
    expect(formatCurrency(1234567, "JPY")).toMatch(/^[¥￥]1,234,567$/);
    expect(nb(formatCurrency(1234567, "VND"))).toBe("₫1,234,567");
    expect(formatCurrency(1234.5, "USD")).toBe("$1,234.50");
    expect(formatCompactNumber(1234567)).toBe("1.2M");
    expect(formatPercent(12.5, 1)).toBe("12.5%");
    expect(formatDate("2026-10-01")).toBe("2026/10/01");
    expect(getSeparators("ja-JP")).toEqual({ decimal: ".", group: "," });
  });
});

describe("auto resolution", () => {
  it("base currency drives auto", () => {
    expect(resolveDisplayLocale("auto", "VND", "en-US")).toBe("vi-VN");
    expect(resolveDisplayLocale("auto", "vnd", null)).toBe("vi-VN");
    expect(resolveDisplayLocale("auto", "CAD", "vi-VN")).toBe("en-CA");
    expect(resolveDisplayLocale("auto", "USD", "ja")).toBe("en-CA");
  });
  it("browser fallback only when currency unknown", () => {
    expect(resolveDisplayLocale("auto", null, "vi-VN")).toBe("vi-VN");
    expect(resolveDisplayLocale("auto", undefined, "vi")).toBe("vi-VN");
    expect(resolveDisplayLocale("auto", "", "ja-JP")).toBe("ja-JP");
    expect(resolveDisplayLocale("auto", null, "fr-FR")).toBe("en-CA");
    expect(resolveDisplayLocale("auto", null, null)).toBe("en-CA");
  });
  it("explicit choice overrides auto, even with VND base", () => {
    expect(resolveDisplayLocale("en", "VND", "vi-VN")).toBe("en-CA");
    expect(resolveDisplayLocale("ja", "VND")).toBe("ja-JP");
    expect(resolveDisplayLocale("vi", "CAD")).toBe("vi-VN");
    setActiveDisplayLocale(resolveDisplayLocale("en", "VND"));
    expect(formatCurrency(1234567, "VND")).toBe("₫1,234,567");
  });
  it("table is data-driven", () => {
    expect(LANGUAGES.map((l) => l.code)).toEqual(["en", "vi", "ja"]);
    expect(isLanguagePref("auto") && isLanguagePref("ja") && !isLanguagePref("fr")).toBe(true);
  });
});

describe("parseAmountInput", () => {
  it("vi", () => {
    expect(parseAmountInput("1.234.567", "vi-VN")).toBe(1234567);
    expect(parseAmountInput("1,5", "vi-VN")).toBe(1.5);
    expect(parseAmountInput("1.234", "vi-VN")).toBe(1234);
    expect(parseAmountInput("-1.234,56", "vi-VN")).toBe(-1234.56);
    expect(parseAmountInput("1.234.567 ₫", "vi-VN")).toBe(1234567);
    expect(parseAmountInput("1,2,3", "vi-VN")).toBeNaN();
    expect(parseAmountInput("abc", "vi-VN")).toBeNaN();
    expect(parseAmountInput("", "vi-VN")).toBeNaN();
  });
  it("en and ja unchanged", () => {
    for (const l of ["en-CA", "ja-JP"]) {
      expect(parseAmountInput("1,234,567", l)).toBe(1234567);
      expect(parseAmountInput("1,234.5", l)).toBe(1234.5);
      expect(parseAmountInput("1.234", l)).toBe(1.234);
      expect(parseAmountInput("(50.25)", l)).toBe(-50.25);
      expect(parseAmountInput("-50", l)).toBe(-50);
    }
  });
  it("defaults to active locale", () => {
    setActiveDisplayLocale("vi-VN");
    expect(parseAmountInput("1.234")).toBe(1234);
  });
});
