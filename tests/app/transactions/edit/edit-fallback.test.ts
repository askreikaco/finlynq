import { describe, it, expect } from "vitest";
import { canEditInEntryScreen, entryEditFallbackReason, type EntryEditContext } from "@/lib/transactions/edit-flow";

const tx: any = {
  id: 7, date: "2026-01-01", accountId: 1, categoryId: 1, currency: "USD", amount: -5, enteredAmount: -5,
  enteredCurrency: "USD", quantity: null, portfolioHolding: null, note: "", payee: "", tags: "", isBusiness: 0, linkId: null,
};
const accounts: any[] = [
  { id: 1, name: "Checking", currency: "USD", archived: false },
  { id: 2, name: "Savings", currency: "USD", archived: false },
  { id: 3, name: "Broker", currency: "USD", archived: false, isInvestment: true },
  { id: 4, name: "Old", currency: "USD", archived: true },
];
const categories: any[] = [
  { id: 1, name: "Food", type: "E", group: "g" },
  { id: 2, name: "Salary", type: "I", group: "g" },
  { id: 3, name: "Transfers", type: "R", group: "g" },
];
const ctx: EntryEditContext = { accounts, categories, splits: [] };
const edit = (over: Record<string, unknown> = {}, siblings?: any[]) => ({
  kind: "transaction-edit" as const, tx: { ...tx, ...over }, linkedSiblings: siblings ?? [],
});
const leg = (over: Record<string, unknown> = {}) => ({ ...tx, accountId: 1, amount: -100, enteredAmount: -100, linkId: "L-1", categoryId: 3, ...over });
const transfer = (debit: Record<string, unknown> = {}, credit: Record<string, unknown> = {}) => ({
  kind: "transfer-edit" as const, linkId: "L-1",
  debit: leg(debit), credit: leg({ accountId: 2, amount: 100, enteredAmount: 100, ...credit }),
});

describe("canEditInEntryScreen: plain transactions", () => {
  it("an ordinary expense and an ordinary income open in the entry screen", () => {
    expect(entryEditFallbackReason(edit(), ctx)).toBeNull();
    expect(canEditInEntryScreen(edit(), ctx)).toBe(true);
    expect(entryEditFallbackReason(edit({ categoryId: 2, amount: 9, enteredAmount: 9 }), ctx)).toBeNull();
  });
  it("a multi-currency row (entered currency differs from the account) still opens in the entry screen", () => {
    expect(canEditInEntryScreen(edit({ enteredCurrency: "EUR", enteredAmount: -4 }), ctx)).toBe(true);
  });

  it.each<[string, any, any, string]>([
    ["not an edit state", { kind: "transaction-prefill", values: {} }, ctx, "not-an-edit"],
    ["accounts did not load", edit(), { categories, splits: [] }, "lookups-missing"],
    ["categories did not load", edit(), { accounts, splits: [] }, "lookups-missing"],
    ["no lookups at all", edit(), undefined, "lookups-missing"],
    ["row has a link_id (non-clean group / orphan leg)", edit({ linkId: "L-9" }), ctx, "linked-rows"],
    ["linked siblings listed", edit({}, [{ id: 8, accountId: 1 }]), ctx, "linked-rows"],
    ["quantity set", edit({ quantity: 3 }), ctx, "holdings-fields"],
    ["quantity 0 still counts as set", edit({ quantity: 0 }), ctx, "holdings-fields"],
    ["portfolio holding set", edit({ portfolioHolding: "VFV" }), ctx, "holdings-fields"],
    ["investment account", edit({ accountId: 3 }), ctx, "investment-account"],
    ["archived account", edit({ accountId: 4 }), ctx, "archived-account"],
    ["account missing from the lookups", edit({ accountId: 99 }), ctx, "archived-account"],
    ["zero amount", edit({ amount: 0, enteredAmount: 0 }), ctx, "zero-amount"],
    ["no category", edit({ categoryId: 0 }), ctx, "uncategorized"],
    ["category no longer exists", edit({ categoryId: 77 }), ctx, "uncategorized"],
    ["refund: positive amount on an expense category", edit({ amount: 5, enteredAmount: 5 }), ctx, "category-sign-mismatch"],
    ["negative amount on an income category", edit({ categoryId: 2 }), ctx, "category-sign-mismatch"],
    ["transfer-type category on a plain row", edit({ categoryId: 3 }), ctx, "category-sign-mismatch"],
    ["splits could not be loaded (null)", edit(), { accounts, categories, splits: null }, "splits-unavailable"],
    ["splits not supplied", edit(), { accounts, categories }, "splits-unavailable"],
  ])("falls back: %s", (_n, state, c, reason) => {
    expect(entryEditFallbackReason(state, c)).toBe(reason);
    expect(canEditInEntryScreen(state, c)).toBe(false);
  });
});

describe("canEditInEntryScreen: splits", () => {
  const two = [{ categoryId: 1, amount: -2, note: "a" }, { categoryId: 1, amount: -3, note: null }];
  it("balanced splits that all carry the parent category open in the entry screen", () => {
    expect(entryEditFallbackReason(edit(), { accounts, categories, splits: two })).toBeNull();
  });
  it.each<[string, any[], Record<string, unknown>, string]>([
    ["a single split row", [{ categoryId: 1, amount: -5, note: null }], {}, "split-single-row"],
    ["more than 20 rows", Array.from({ length: 21 }, () => ({ categoryId: 1, amount: -1, note: null })), { amount: -21, enteredAmount: -21 }, "split-too-many"],
    ["entered currency differs from the account", two, { enteredCurrency: "EUR" }, "split-currency-differs"],
    ["a split with another category", [two[0], { categoryId: 2, amount: -3, note: null }], {}, "split-category-differs"],
    ["a split with no category", [two[0], { categoryId: null, amount: -3, note: null }], {}, "split-category-differs"],
    ["amounts do not add up", [two[0], { categoryId: 1, amount: -2, note: null }], {}, "split-unbalanced"],
    ["a zero split", [{ categoryId: 1, amount: 0, note: null }, { categoryId: 1, amount: -5, note: null }], {}, "split-unbalanced"],
  ])("falls back: %s", (_n, splits, over, reason) => {
    expect(entryEditFallbackReason(edit(over), { accounts, categories, splits })).toBe(reason);
  });
});

describe("canEditInEntryScreen: transfers", () => {
  it("a clean cash transfer pair opens in the entry screen (same and cross currency)", () => {
    expect(canEditInEntryScreen(transfer(), ctx)).toBe(true);
    expect(canEditInEntryScreen(transfer({}, { currency: "CAD", amount: 135 }), ctx)).toBe(true);
  });
  it.each<[string, any, string]>([
    ["in-kind quantity on the debit leg", transfer({ quantity: 2 }), "holdings-fields"],
    ["portfolio holding on the credit leg", transfer({}, { portfolioHolding: "VFV" }), "holdings-fields"],
    ["investment account as destination", transfer({}, { accountId: 3 }), "investment-account"],
    ["investment account as source", transfer({ accountId: 3 }), "investment-account"],
    ["archived destination", transfer({}, { accountId: 4 }), "archived-account"],
    ["zero amount", transfer({ amount: 0, enteredAmount: 0 }), "zero-amount"],
    ["debit leg entered in another currency than its account", transfer({ enteredCurrency: "EUR" }), "entered-currency-differs"],
  ])("falls back: %s", (_n, state, reason) => {
    expect(entryEditFallbackReason(state, ctx)).toBe(reason);
    expect(canEditInEntryScreen(state, ctx)).toBe(false);
  });
  it("lookups missing falls back", () => {
    expect(canEditInEntryScreen(transfer(), {})).toBe(false);
  });
});
