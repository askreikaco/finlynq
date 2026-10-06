import { describe, it, expect } from "vitest";
import { buildPrefill, canDuplicate } from "@/lib/transactions/prefill";
const base: any = { id: 5, date: "2026-01-01", accountId: 3, categoryId: 4, currency: "VND", amount: -150000, enteredAmount: -150000, enteredCurrency: "VND", quantity: null, linkId: null, tradeLinkId: null, kind: null, payee: "P", note: "N", tags: "a,b", isBusiness: 1, createdAt: "x", source: "mcp", importHash: "h" };
describe("rv lib", () => {
  it("VND expense", () => { const p: any = buildPrefill(base); expect(p).toMatchObject({ amount: "150000", txType: "Expense", accountId: "3", categoryId: "4", isBusiness: true, tags: "a,b" }); expect(Object.keys(p).sort()).toEqual(["accountId","amount","categoryId","isBusiness","note","payee","tags","ts","txType","v"]); });
  it("VND income, entered null", () => { const p = buildPrefill({ ...base, amount: 2500000, enteredAmount: null }); expect(p).toMatchObject({ amount: "2500000", txType: "Income" }); });
  it("decimal", () => { expect(buildPrefill({ ...base, amount: -12.34, enteredAmount: -12.34 }).amount).toBe("12.34"); });
  it("zero amount", () => { expect(buildPrefill({ ...base, amount: 0, enteredAmount: 0 }).txType).toBe("Income"); });
  it("null isBusiness", () => { expect(buildPrefill({ ...base, isBusiness: null }).isBusiness).toBe(false); });
  it("canDuplicate plain", () => expect(canDuplicate(base, "VND")).toBe(true));
  it("transfer", () => expect(canDuplicate({ ...base, linkId: "u" }, "VND")).toBe(false));
  it("tradeLink", () => expect(canDuplicate({ ...base, tradeLinkId: "u" }, "VND")).toBe(false));
  it("kind", () => expect(canDuplicate({ ...base, kind: "buy" }, "VND")).toBe(false));
  it("qty", () => expect(canDuplicate({ ...base, quantity: 3 }, "VND")).toBe(false));
  it("qty0", () => expect(canDuplicate({ ...base, quantity: 0 }, "VND")).toBe(true));
  it("fx mismatch", () => expect(canDuplicate({ ...base, enteredCurrency: "USD" }, "VND")).toBe(false));
  it("entered null ok", () => expect(canDuplicate({ ...base, enteredCurrency: null }, "VND")).toBe(true));
});
