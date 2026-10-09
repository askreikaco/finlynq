import { describe, it, expect } from "vitest";
import {
  isCleanTransferPair,
  portfolioEditHref,
  siblingToTransaction,
  transactionEditHref,
  transferEditHref,
  transactionSplitHref,
} from "@/lib/transactions/edit-flow";
import { opHref } from "@/components/portfolio/forms/op-catalog";

const PORTFOLIO_KINDS = [
  "buy", "sell", "buy_cash_leg", "sell_cash_leg", "in_kind_transfer_in", "in_kind_transfer_out",
  "fx_from", "fx_to", "fx_fee", "portfolio_income", "portfolio_expense",
  "brokerage_deposit_in", "brokerage_deposit_out", "brokerage_withdrawal_in", "brokerage_withdrawal_out",
];

describe("portfolioEditHref", () => {
  it("maps every portfolio kind to its op page with editId", () => {
    for (const k of PORTFOLIO_KINDS) {
      const href = portfolioEditHref(k, 42);
      expect(href, k).toMatch(/^\/portfolio\/new\/[a-z-]+\?editId=42$/);
    }
  });
  it("returns null for ordinary rows and missing kinds", () => {
    expect(portfolioEditHref(null, 1)).toBeNull();
    expect(portfolioEditHref(undefined, 1)).toBeNull();
    expect(portfolioEditHref("", 1)).toBeNull();
    expect(portfolioEditHref("expense", 1)).toBeNull();
  });
  it("buy and buy_cash_leg both open the buy op", () => {
    expect(portfolioEditHref("buy", 5)).toBe(opHref("buy", "?editId=5"));
    expect(portfolioEditHref("buy_cash_leg", 5)).toBe(opHref("buy", "?editId=5"));
  });
});

describe("edit route builders", () => {
  it("transactionEditHref keeps returnTo encoded and optional", () => {
    expect(transactionEditHref(7)).toBe("/transactions/7/edit");
    expect(transactionEditHref(7, "/transactions?page=2&q=a b")).toBe(
      "/transactions/7/edit?returnTo=%2Ftransactions%3Fpage%3D2%26q%3Da%20b",
    );
  });
  it("transferEditHref encodes the link id", () => {
    expect(transferEditHref("a/b")).toBe("/transactions/transfer/a%2Fb/edit");
    expect(transferEditHref("L", "/transactions")).toBe("/transactions/transfer/L/edit?returnTo=%2Ftransactions");
  });
  it("transactionSplitHref", () => {
    expect(transactionSplitHref(3)).toBe("/transactions/3/split");
  });
});

describe("isCleanTransferPair (four-check rule)", () => {
  const sib = (accountId: number | null) => ({ id: 2, accountId } as never);
  it("true for one sibling on a different account", () => {
    expect(isCleanTransferPair({ accountId: 1, linkId: "L" }, [sib(2)])).toBe(true);
  });
  it("false without a link id", () => {
    expect(isCleanTransferPair({ accountId: 1, linkId: null }, [sib(2)])).toBe(false);
  });
  it("false for N>2 legs", () => {
    expect(isCleanTransferPair({ accountId: 1, linkId: "L" }, [sib(2), sib(3)])).toBe(false);
  });
  it("false for no sibling", () => {
    expect(isCleanTransferPair({ accountId: 1, linkId: "L" }, [])).toBe(false);
  });
  it("false for a same-account sibling (conversion)", () => {
    expect(isCleanTransferPair({ accountId: 1, linkId: "L" }, [sib(1)])).toBe(false);
  });
  it("false when the sibling account is unknown", () => {
    expect(isCleanTransferPair({ accountId: 1, linkId: "L" }, [sib(null)])).toBe(false);
  });
});

describe("siblingToTransaction", () => {
  it("maps a linked sibling to the form row shape with safe defaults", () => {
    const row = siblingToTransaction({
      id: 9, date: "2026-03-01", accountId: null, accountName: null, accountCurrency: null,
      categoryId: null, categoryName: null, categoryType: null, amount: -4, currency: "USD",
      enteredAmount: null, enteredCurrency: null, enteredFxRate: null, quantity: null,
      portfolioHolding: null, payee: null, note: null, tags: null,
    });
    expect(row).toMatchObject({ id: 9, accountId: 0, categoryId: 0, amount: -4, note: "", payee: "", tags: "", isBusiness: null, linkId: null });
  });
});
