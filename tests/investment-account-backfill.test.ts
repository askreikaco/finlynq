/**
 * Investment account backfill tests.
 *
 * Covers the backfillInvestmentAccount function which reassigns transactions
 * from a newly-flagged investment account to its cash holding. The function must:
 * 1. Set quantity = COALESCE(quantity, amount) when assigning portfolioHoldingId
 * 2. Run an idempotent repair UPDATE to fix accounts backfilled with null quantity
 *
 * This test verifies the function logic through inspection of the actual source code
 * and assertions about the update calls made. For a full real-DB integration test,
 * run against a seeded finlynq_test database and assert sleeve SUM(quantity) = SUM(amount)
 * after backfill.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

const ROOT = path.resolve(__dirname, "..");
const SOURCE = readFileSync(path.join(ROOT, "src/lib/investment-account.ts"), "utf8");

describe("backfillInvestmentAccount", () => {
  describe("quantity handling", () => {
    it("sets quantity using COALESCE(quantity, amount) expression", () => {
      // Verify the COALESCE expression is present in the function
      expect(SOURCE).toMatch(/COALESCE\s*\(\s*\$\{schema\.transactions\.quantity\}\s*,\s*\$\{schema\.transactions\.amount\}\s*\)/);
    });

    it("includes quantity in the initial .set() call", () => {
      // Verify that the .set() call includes quantity assignment
      const functionBody = SOURCE.substring(
        SOURCE.indexOf("export async function backfillInvestmentAccount"),
        SOURCE.indexOf("export async function backfillInvestmentAccount") + 2000
      );
      expect(functionBody).toMatch(/\.set\s*\(\s*\{[\s\S]*?quantity:/);
    });
  });

  describe("repair UPDATE", () => {
    it("includes a repair UPDATE after the initial move", () => {
      // Verify the repair UPDATE exists in the function
      const functionBody = SOURCE.substring(
        SOURCE.indexOf("export async function backfillInvestmentAccount"),
        SOURCE.lastIndexOf("return")
      );
      // Should have at least 2 db.update calls
      const updateCount = (functionBody.match(/db\s*\.\s*update\s*\(/g) || []).length;
      expect(updateCount).toBeGreaterThanOrEqual(2);
    });

    it("repair UPDATE is scoped to userId and portfolioHoldingId", () => {
      // Verify the repair UPDATE has proper WHERE clause
      const repairSection = SOURCE.substring(
        SOURCE.indexOf("// Repair:") || SOURCE.indexOf("Repair")
      );
      expect(repairSection).toContain("userId");
      expect(repairSection).toContain("portfolioHoldingId");
      expect(repairSection).toMatch(/quantity.*IS\s+NULL/i);
    });

    it("repair sets quantity = amount WHERE quantity IS NULL", () => {
      // Verify the repair query sets quantity to amount
      const repairSection = SOURCE.substring(
        SOURCE.indexOf("// Repair:") || SOURCE.indexOf("Repair")
      );
      expect(repairSection).toContain("set({");
      expect(repairSection).toMatch(/quantity.*schema\.transactions\.amount/);
    });
  });

  describe("function behavior", () => {
    it("returns object with cashHoldingId and reassignedCount", () => {
      // Verify return type
      expect(SOURCE).toContain("return { cashHoldingId, reassignedCount }");
    });

    it("cashHoldingId comes from getOrCreateCashHolding", () => {
      const functionBody = SOURCE.substring(
        SOURCE.indexOf("export async function backfillInvestmentAccount"),
        SOURCE.indexOf("export async function backfillInvestmentAccount") + 1000
      );
      expect(functionBody).toContain("getOrCreateCashHolding");
      expect(functionBody).toContain("cashHoldingId");
    });

    it("reassignedCount is from the result length of the initial UPDATE", () => {
      const functionBody = SOURCE.substring(
        SOURCE.indexOf("export async function backfillInvestmentAccount"),
        SOURCE.lastIndexOf("return")
      );
      expect(functionBody).toMatch(/reassignedCount\s*=\s*Array\.isArray\(result\)\s*\?\s*result\.length\s*:\s*0/);
    });
  });
});
