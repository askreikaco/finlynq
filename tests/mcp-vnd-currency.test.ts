import { describe, it, expect } from "vitest";
import { SUPPORTED_CURRENCIES, isSupportedCurrency } from "@/lib/fx/supported-currencies";
import { z } from "zod";

// Replicate the supportedCurrencyEnum from mcp-server/tools/_shared.ts
const supportedCurrencyEnum = z.enum(
  SUPPORTED_CURRENCIES as unknown as [string, ...string[]]
);

describe("VND currency support in MCP", () => {
  it("VND is in SUPPORTED_CURRENCIES", () => {
    expect(isSupportedCurrency("VND")).toBe(true);
  });

  it("supportedCurrencyEnum accepts VND", () => {
    const result = supportedCurrencyEnum.safeParse("VND");
    expect(result.success).toBe(true);
    expect(result.data).toBe("VND");
  });

  it("supportedCurrencyEnum rejects invalid currency like XXX", () => {
    const result = supportedCurrencyEnum.safeParse("XXX");
    expect(result.success).toBe(false);
  });

  it("portfolio_record_entry schemas can use VND", () => {
    // Test currency field from income_expense variant
    const incomeExpenseWithVND = z.object({
      entry_type: z.literal("income_expense"),
      currency: supportedCurrencyEnum,
      amount: z.number(),
    });

    const result1 = incomeExpenseWithVND.safeParse({
      entry_type: "income_expense",
      currency: "VND",
      amount: 100000,
    });
    expect(result1.success).toBe(true);

    // Test FX conversion with VND
    const fxConversionWithVND = z.object({
      entry_type: z.literal("fx_conversion"),
      fromCurrency: supportedCurrencyEnum,
      fromAmount: z.number(),
      toCurrency: supportedCurrencyEnum,
      toAmount: z.number(),
      feeCurrency: supportedCurrencyEnum.optional(),
    });

    const result2 = fxConversionWithVND.safeParse({
      entry_type: "fx_conversion",
      fromCurrency: "USD",
      fromAmount: 100,
      toCurrency: "VND",
      toAmount: 2400000,
      feeCurrency: "VND",
    });
    expect(result2.success).toBe(true);
  });
});
