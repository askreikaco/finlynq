import { describe, it, expect, afterEach, vi } from "vitest";

// Pin the zone for the whole file (runner may be UTC); Node re-reads TZ on assignment.
process.env.TZ = "Asia/Ho_Chi_Minh";
import {
  formatCurrency,
  formatNumber,
  formatDate,
  getCurrentMonth,
  getMonthLabel,
  formatDateTimeLocal,
  fxPreviewText,
} from "@/lib/currency";
import { todayISO } from "@/lib/utils/date";

describe("formatCurrency", () => {
  it("formats positive CAD amount", () => {
    const result = formatCurrency(1234.56, "CAD");
    expect(result).toContain("1,234.56");
  });

  it("formats negative amount", () => {
    const result = formatCurrency(-500.1, "CAD");
    expect(result).toContain("500.10");
  });

  it("defaults to CAD", () => {
    const result = formatCurrency(100);
    expect(result).toContain("100.00");
  });

  it("formats USD", () => {
    const result = formatCurrency(99.9, "USD");
    expect(result).toContain("99.90");
  });

  it("handles zero", () => {
    const result = formatCurrency(0, "CAD");
    expect(result).toContain("0.00");
  });

  it("renders CAD with the C$ symbol", () => {
    expect(formatCurrency(1234.56, "CAD")).toBe("C$1,234.56");
  });

  it("renders USD with the bare $ symbol", () => {
    expect(formatCurrency(99.9, "USD")).toBe("$99.90");
  });

  it("defaults to USD", () => {
    expect(formatCurrency(100)).toBe("$100.00");
  });

  it("renders other dollar-family symbols", () => {
    expect(formatCurrency(50, "AUD")).toBe("A$50.00");
    expect(formatCurrency(50, "NZD")).toBe("NZ$50.00");
    expect(formatCurrency(50, "SGD")).toBe("S$50.00");
  });

  it("places the minus sign before the symbol", () => {
    expect(formatCurrency(-500.1, "CAD")).toBe("-C$500.10");
  });

  it("honors a custom decimals option", () => {
    expect(formatCurrency(1234.56, "USD", { decimals: 0 })).toBe("$1,235");
  });

  it("defaults zero-decimal currencies to no fraction digits", () => {
    expect(formatCurrency(9976241, "VND")).not.toContain(".00");
    expect(formatCurrency(9976241, "VND")).toContain("9,976,241");
    expect(formatCurrency(1500, "JPY")).not.toContain(".");
    expect(formatCurrency(-374344573, "VND")).toContain("374,344,573");
  });

  it("still honors an explicit decimals option for zero-decimal currencies", () => {
    expect(formatCurrency(1234.5, "VND", { decimals: 2 })).toContain("1,234.50");
  });

  it("keeps native Intl symbols for non-dollar currencies", () => {
    expect(formatCurrency(10, "EUR")).toContain("€");
    expect(formatCurrency(10, "GBP")).toContain("£");
  });

  it("does not throw on a custom / non-ISO-4217 currency code (#291)", () => {
    // Users can add arbitrary 3-4 letter codes (e.g. "TEST") in Settings.
    // Intl.NumberFormat({ style: "currency", currency: "TEST" }) throws
    // RangeError — formatCurrency must degrade gracefully, not crash the page.
    expect(() => formatCurrency(1234.56, "TEST")).not.toThrow();
    expect(formatCurrency(1234.56, "TEST")).toBe("TEST 1,234.56");
    expect(formatCurrency(-1234.56, "TEST")).toBe("-TEST 1,234.56");
    expect(formatCurrency(1000, "TEST", { decimals: 0 })).toBe("TEST 1,000");
  });
});

describe("formatNumber", () => {
  it("formats with 2 decimal places", () => {
    expect(formatNumber(1234.5)).toBe("1,234.50");
  });

  it("formats zero", () => {
    expect(formatNumber(0)).toBe("0.00");
  });
});

describe("formatDate", () => {
  it("formats a date string as dd/mm/yyyy", () => {
    const result = formatDate("2024-03-15");
    expect(result).toBe("15/03/2024");
  });

  it("formats date with leading zeros correctly", () => {
    const result = formatDate("2026-01-05");
    expect(result).toBe("05/01/2026");
  });
});

describe("getCurrentMonth", () => {
  it("returns YYYY-MM format", () => {
    const result = getCurrentMonth();
    expect(result).toMatch(/^\d{4}-\d{2}$/);
  });
});

describe("getMonthLabel", () => {
  it("returns human-readable month label", () => {
    const result = getMonthLabel("2024-03");
    expect(result).toContain("2024");
  });
});

describe("todayISO", () => {
  afterEach(() => {
    // Reset timers after each test
    vi.useRealTimers();
  });

  it("returns local date in YYYY-MM-DD format", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-30T18:00:00Z"));
    const result = todayISO();
    expect(result).toBe("2026-10-01");
  });

  it("returns previous day for early UTC hours", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-30T16:59:00Z"));
    const result = todayISO();
    expect(result).toBe("2026-09-30");
  });

  it("has Vietnam timezone offset of -420 minutes (UTC+7)", () => {
    expect(new Date().getTimezoneOffset()).toBe(-420);
  });
});

describe("formatDateTimeLocal", () => {
  it("converts UTC timestamp to local date in dd/mm/yyyy format", () => {
    const result = formatDateTimeLocal("2026-09-30T20:00:00Z");
    expect(result).toBe("01/10/2026");
  });

  it("returns empty string for invalid input", () => {
    const result = formatDateTimeLocal("invalid");
    expect(result).toBe("");
  });

  it("returns empty string for null-like timestamps", () => {
    expect(formatDateTimeLocal("")).toBe("");
  });
});

describe("fxPreviewText", () => {
  it("formats VND with zero decimal places", () => {
    const result = fxPreviewText(1234.56, "VND");
    expect(result).toBe("1235");
  });

  it("formats USD with two decimal places", () => {
    const result = fxPreviewText(1234.56, "USD");
    expect(result).toBe("1234.56");
  });

  it("formats JPY with zero decimal places", () => {
    const result = fxPreviewText(1234.56, "JPY");
    expect(result).toBe("1235");
  });
});
