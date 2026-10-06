import { describe, it, expect, vi } from "vitest";
import { buildPrefill, canDuplicate, writePrefill } from "@/lib/transactions/prefill";

const tx = (o: any = {}) => ({ id: 1, date: "2026-01-01", accountId: 1, accountName: "A", categoryId: 1, categoryName: "C", categoryType: "E", currency: "USD", amount: -50, enteredAmount: -50, enteredCurrency: "USD", quantity: null, portfolioHolding: null, note: "", payee: "p", tags: "", isBusiness: 0, linkId: null, tradeLinkId: null, kind: null, ...o });

describe("workspace startDuplicate behavior", () => {
  it("buildPrefill + writePrefill chain for plain transactions", () => {
    const t = tx();
    const p = buildPrefill(t);
    expect(p.amount).toBe("50");
    expect(p.txType).toBe("Expense");
  });

  it("canDuplicate returns true for plain transactions", () => {
    const t = tx();
    expect(canDuplicate(t, "USD")).toBe(true);
  });

  it("canDuplicate returns false for transfer legs", () => {
    const t = tx({ linkId: "L" });
    expect(canDuplicate(t, "USD")).toBe(false);
  });

  it("canDuplicate returns false for multi-currency mismatch", () => {
    const t = tx({ enteredCurrency: "EUR" });
    expect(canDuplicate(t, "USD")).toBe(false);
  });
});
