// @vitest-environment node
import { describe, it, expect, vi, afterEach } from "vitest";
import { evaluateAmountExpression } from "@/lib/transactions/amount-expression";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("evaluateAmountExpression", () => {
  it("adds and subtracts", () => {
    expect(evaluateAmountExpression("100+50")).toBe("150");
    expect(evaluateAmountExpression("100-30")).toBe("70");
  });

  it("multiplies and divides with precedence", () => {
    expect(evaluateAmountExpression("1.5*2")).toBe("3");
    expect(evaluateAmountExpression("2+3*4")).toBe("14");
    expect(evaluateAmountExpression("10/4")).toBe("2.5");
    expect(evaluateAmountExpression("2*3/6")).toBe("1");
  });

  it("returns null for division by zero", () => {
    expect(evaluateAmountExpression("7/0")).toBeNull();
    expect(evaluateAmountExpression("7/0.00")).toBeNull();
  });

  it("drops a trailing operator", () => {
    expect(evaluateAmountExpression("100+")).toBe("100");
    expect(evaluateAmountExpression("5-")).toBe("5");
  });

  it("handles unary minus", () => {
    expect(evaluateAmountExpression("-5+2")).toBe("-3");
    expect(evaluateAmountExpression("2--3")).toBe("5");
    expect(evaluateAmountExpression("2*-3")).toBe("-6");
    expect(evaluateAmountExpression("-5")).toBe("-5");
  });

  it("ignores whitespace", () => {
    expect(evaluateAmountExpression("  100 + 50 ")).toBe("150");
    expect(evaluateAmountExpression("1 .5 * 2")).toBe("3");
  });

  it("rounds to 2 decimals and drops trailing zeros", () => {
    expect(evaluateAmountExpression("0.1+0.2")).toBe("0.3");
    expect(evaluateAmountExpression("10/3")).toBe("3.33");
    expect(evaluateAmountExpression("1.005*1")).toBe("1.01");
    expect(evaluateAmountExpression("3.50+0")).toBe("3.5");
    expect(evaluateAmountExpression("-0.001")).toBe("0");
  });

  it("accepts decimals with or without digits on one side", () => {
    expect(evaluateAmountExpression("5.")).toBe("5");
    expect(evaluateAmountExpression(".5+.5")).toBe("1");
  });

  it("returns null for malformed input", () => {
    expect(evaluateAmountExpression("1+*2")).toBeNull();
    expect(evaluateAmountExpression("1..2")).toBeNull();
    expect(evaluateAmountExpression("(1+2)")).toBeNull();
    expect(evaluateAmountExpression("1+a")).toBeNull();
    expect(evaluateAmountExpression("")).toBeNull();
    expect(evaluateAmountExpression("   ")).toBeNull();
    expect(evaluateAmountExpression("-")).toBeNull();
    expect(evaluateAmountExpression(".")).toBeNull();
    expect(evaluateAmountExpression("*5")).toBeNull();
    expect(evaluateAmountExpression("1e3")).toBeNull();
    expect(evaluateAmountExpression("1+2)")).toBeNull();
  });

  it("returns null for huge input without hanging", () => {
    expect(evaluateAmountExpression("1".repeat(10000))).toBeNull();
    expect(evaluateAmountExpression("1+".repeat(40) + "1")).toBeNull();
    expect(evaluateAmountExpression("9".repeat(20))).toBeNull(); // above the 1e15 result cap
  });

  it("never calls Function (spy)", () => {
    const spy = vi.spyOn(globalThis, "Function");
    evaluateAmountExpression("100+50");
    evaluateAmountExpression("7/0");
    evaluateAmountExpression("1+*2");
    expect(spy).not.toHaveBeenCalled();
  });

  it("works when Function and eval throw (production CSP without 'unsafe-eval')", () => {
    const blocked = () => {
      throw new EvalError("Refused to evaluate a string as JavaScript");
    };
    vi.stubGlobal("Function", blocked);
    vi.stubGlobal("eval", blocked);
    expect(evaluateAmountExpression("100+50")).toBe("150");
    expect(evaluateAmountExpression("1.5*2")).toBe("3");
    expect(evaluateAmountExpression("-5+2")).toBe("-3");
    expect(evaluateAmountExpression("7/0")).toBeNull();
    expect(evaluateAmountExpression("1+*2")).toBeNull();
  });
});
