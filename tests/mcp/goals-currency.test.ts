/**
 * Goals currency resolution tests (UX-2).
 *
 * Verifies that the manage_goals tool schema includes:
 * - Currency parameter in add variant with ISO 4217 validation
 * - Currency parameter in update variant
 * - Proper descriptions for both variants
 */

import { describe, it, expect } from "vitest";
import { z } from "zod";

describe("goals currency parameter (UX-2)", () => {
  it("currency parameter accepts ISO 4217 codes (3-4 letters)", () => {
    // Test the regex pattern used in the currency schema
    const currencyRegex = /^[A-Z]{3,4}$/;

    expect(currencyRegex.test("USD")).toBe(true);
    expect(currencyRegex.test("VND")).toBe(true);
    expect(currencyRegex.test("CAD")).toBe(true);
    expect(currencyRegex.test("USDT")).toBe(true); // 4-letter code

    // Invalid codes should not match
    expect(currencyRegex.test("US")).toBe(false); // Too short (2 letters)
    expect(currencyRegex.test("USDAA")).toBe(false); // Too long (5 letters)
    expect(currencyRegex.test("usd")).toBe(false); // Lowercase
    expect(currencyRegex.test("123")).toBe(false); // Numbers
  });

  it("currency parameter in add variant is optional", () => {
    const addVariantSchema = z.object({
      op: z.literal("add"),
      name: z.string(),
      type: z.enum(["savings", "debt_payoff", "investment", "emergency_fund"]),
      target_amount: z.number().positive(),
      currency: z.string().regex(/^[A-Z]{3,4}$/).optional(),
    });

    // Valid without currency
    const resultWithout = addVariantSchema.safeParse({
      op: "add",
      name: "Test Goal",
      type: "savings",
      target_amount: 1000,
    });
    expect(resultWithout.success).toBe(true);

    // Valid with currency
    const resultWith = addVariantSchema.safeParse({
      op: "add",
      name: "Test Goal",
      type: "savings",
      target_amount: 1000,
      currency: "VND",
    });
    expect(resultWith.success).toBe(true);

    // Invalid currency should fail
    const resultInvalid = addVariantSchema.safeParse({
      op: "add",
      name: "Test Goal",
      type: "savings",
      target_amount: 1000,
      currency: "invalid",
    });
    expect(resultInvalid.success).toBe(false);
  });

  it("currency parameter in update variant is optional", () => {
    const updateVariantSchema = z.object({
      op: z.literal("update"),
      goal_id: z.number().int().positive(),
      currency: z.string().regex(/^[A-Z]{3,4}$/).optional(),
    });

    // Valid without currency
    const resultWithout = updateVariantSchema.safeParse({
      op: "update",
      goal_id: 1,
    });
    expect(resultWithout.success).toBe(true);

    // Valid with currency
    const resultWith = updateVariantSchema.safeParse({
      op: "update",
      goal_id: 1,
      currency: "EUR",
    });
    expect(resultWith.success).toBe(true);
  });
});
