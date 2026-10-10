import { describe, it, expect } from "vitest";
import { installmentSuffix, stripInstallmentSuffix, withInstallmentSuffix } from "@/lib/transactions/installment-edit";

describe("installment note suffix helpers", () => {
  it("reads the trailing n/N", () => {
    expect(installmentSuffix("MacBook 2/6")).toBe("2/6");
    expect(installmentSuffix("2/6")).toBe("2/6");
    expect(installmentSuffix("MacBook 2/6  ")).toBe("2/6");
    expect(installmentSuffix("paid 1/2 of it")).toBeNull();
    expect(installmentSuffix("A2/6")).toBeNull();
    expect(installmentSuffix(null)).toBeNull();
  });
  it("strips only the trailing suffix", () => {
    expect(stripInstallmentSuffix("MacBook 2/6")).toBe("MacBook");
    expect(stripInstallmentSuffix("2/6")).toBe("");
    expect(stripInstallmentSuffix("split 1/2 then 2/6")).toBe("split 1/2 then");
    expect(stripInstallmentSuffix("no suffix")).toBe("no suffix");
  });
  it("re-appends a row's own suffix", () => {
    expect(withInstallmentSuffix("MacBook", "3/6")).toBe("MacBook 3/6");
    expect(withInstallmentSuffix("", "3/6")).toBe("3/6");
    expect(withInstallmentSuffix("MacBook", null)).toBe("MacBook");
  });
});
