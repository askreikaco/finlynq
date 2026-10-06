import { describe, it, expect } from "vitest";
import { isLoanCompleted } from "@/lib/loan-status";

describe("isLoanCompleted", () => {
  it("is true once nothing is left to pay", () => {
    expect(isLoanCompleted({ remainingBalance: 0, periodsRemaining: 0 })).toBe(true);
    expect(isLoanCompleted({ remainingBalance: 1.49e-8, periodsRemaining: 0 })).toBe(true);
    expect(isLoanCompleted({ remainingBalance: 0.4, periodsRemaining: 1 })).toBe(true);
  });
  it("is false while a balance or periods remain", () => {
    expect(isLoanCompleted({ remainingBalance: 149_549_995, periodsRemaining: 34 })).toBe(false);
    expect(isLoanCompleted({ remainingBalance: 13_193, periodsRemaining: 1 })).toBe(false);
  });
  it("is false for a loan the server couldn't schedule (null balance/periods)", () => {
    expect(isLoanCompleted({ remainingBalance: null, periodsRemaining: null })).toBe(false);
  });
});
