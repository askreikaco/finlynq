import { describe, it, expect, vi, afterEach } from "vitest";
import { buildOfflineCreateFields, buildOfflineEditPatch, isNetworkFailure, isOfflineQueueEligible, type EntryMode } from "@/lib/transactions/entry-mode";

const tx: any = { id: 7, date: "2026-01-01", accountId: 1, categoryId: 1, currency: "USD", amount: -5, enteredAmount: -5, enteredCurrency: "USD", quantity: null, portfolioHolding: null, note: "", payee: "p", tags: "", isBusiness: 0, linkId: null };
const base = { txType: "Expense" as const, splitActive: false, hasSeries: false, isPostTarget: false, isBusiness: false };
const edit = (over: object = {}): EntryMode => ({ kind: "edit", tx: { ...tx, ...over }, splits: [], returnTo: "/transactions" });

afterEach(() => vi.unstubAllGlobals());

describe("offline eligibility", () => {
  it("plain create and plain edit qualify", () => {
    expect(isOfflineQueueEligible({ ...base, mode: { kind: "create" } })).toBe(true);
    expect(isOfflineQueueEligible({ ...base, mode: edit() })).toBe(true);
  });
  it.each([
    ["transfer", { txType: "Transfer" as const }],
    ["splits", { splitActive: true }],
    ["series", { hasSeries: true }],
    ["post target", { isPostTarget: true }],
    ["business flag", { isBusiness: true }],
  ])("%s stays online-only", (_n, over) => {
    expect(isOfflineQueueEligible({ ...base, ...over, mode: { kind: "create" } })).toBe(false);
  });
  it.each([
    ["linked", { linkId: "L" }], ["installment", { installmentGroupId: "g" }], ["repeat", { subscriptionId: 3 }],
    ["portfolio", { portfolioHolding: "AAPL" }], ["quantity", { quantity: 2 }], ["business row", { isBusiness: 1 }],
  ])("edit of a %s row stays online-only", (_n, over) => {
    expect(isOfflineQueueEligible({ ...base, mode: edit(over) })).toBe(false);
  });
  it("transfer edit stays online-only", () => {
    expect(isOfflineQueueEligible({ ...base, mode: { kind: "edit-transfer", linkId: "x", debit: tx, credit: tx, returnTo: "/" } })).toBe(false);
  });
});

describe("offline payloads", () => {
  it("create fields: only allowlisted names, empty text omitted", () => {
    expect(buildOfflineCreateFields({ date: "2026-10-01", accountId: 1, categoryId: 2, enteredCurrency: "CAD", enteredAmount: -3, payee: " Cafe ", note: " ", tags: "" })).toEqual({
      date: "2026-10-01", accountId: 1, categoryId: 2, enteredCurrency: "CAD", enteredAmount: -3, payee: "Cafe",
    });
  });
  it("edit patch carries only changed fields; baseline reports empty text as null", () => {
    const { patch, current } = buildOfflineEditPatch(tx, { date: "2026-01-01", accountId: 1, categoryId: 1, enteredCurrency: "USD", enteredAmount: -9, payee: "p", note: "hi", tags: "" });
    expect(patch).toEqual({ enteredAmount: -9, note: "hi" });
    expect(current.note).toBeNull();
    expect(current.payee).toBe("p");
    expect(current.enteredAmount).toBe(-5);
  });
});

describe("network failure detection", () => {
  it("fetch TypeError counts; an ordinary Error does not (online)", () => {
    vi.stubGlobal("navigator", { onLine: true });
    expect(isNetworkFailure(new TypeError("Failed to fetch"))).toBe(true);
    expect(isNetworkFailure(new Error("Please select a category"))).toBe(false);
  });
  it("any error while the browser reports offline counts", () => {
    vi.stubGlobal("navigator", { onLine: false });
    expect(isNetworkFailure(new Error("x"))).toBe(true);
  });
});
