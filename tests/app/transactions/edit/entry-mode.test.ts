import { describe, it, expect } from "vitest";
import {
  buildEntrySeed, buildSplitsBody, buildTransactionPutBody, buildTransferPutBody, toEntryMode,
} from "@/lib/transactions/entry-mode";

const tx: any = {
  id: 7, date: "2026-01-02", accountId: 1, categoryId: 4, currency: "CAD", amount: -6.8, enteredAmount: -5, enteredCurrency: "USD",
  quantity: null, portfolioHolding: null, note: "lunch", payee: "Cafe", tags: "a,b", isBusiness: 1, linkId: null,
};

describe("buildEntrySeed: edit", () => {
  const seed = buildEntrySeed({ kind: "edit", tx, splits: [], returnTo: "/transactions" });
  it("maps every field of the loaded row", () => {
    expect(seed).toMatchObject({
      txType: "Expense", date: "2026-01-02", amount: "5", accountId: "1", toAccountId: "", categoryId: "4",
      payee: "Cafe", note: "lunch", tags: "a,b", isBusiness: true, currencyChoice: "USD",
      receivedAmount: "", splitCount: "", splitRows: [], showMore: true,
    });
  });
  it("positive amount is Income; no entered fields fall back to amount and the account currency", () => {
    const s = buildEntrySeed({ kind: "edit", tx: { ...tx, amount: 12.5, enteredAmount: null, enteredCurrency: null }, splits: [], returnTo: "/" });
    expect(s).toMatchObject({ txType: "Income", amount: "12.5", currencyChoice: "CAD" });
  });
  it("More details stays closed without tags, business or splits", () => {
    expect(buildEntrySeed({ kind: "edit", tx: { ...tx, tags: "", isBusiness: 0 }, splits: [], returnTo: "/" }).showMore).toBe(false);
    expect(buildEntrySeed({ kind: "edit", tx: { ...tx, tags: "", isBusiness: null }, splits: [], returnTo: "/" })).toMatchObject({ showMore: false, isBusiness: false });
  });
  it("splits seed count and rows; the last row (the remainder) carries no amount; rows inherit the category", () => {
    const s = buildEntrySeed({
      kind: "edit", tx: { ...tx, tags: "", isBusiness: 0 }, returnTo: "/",
      splits: [{ categoryId: 4, amount: -2, note: "x" }, { categoryId: 4, amount: -3, note: null }],
    });
    expect(s.splitCount).toBe("2");
    expect(s.splitRows).toEqual([
      { id: "txnew-split-row-0", categoryId: "", amount: "2", note: "x" },
      { id: "txnew-split-row-1", categoryId: "", amount: "", note: "" },
    ]);
    expect(s.showMore).toBe(true);
  });
});

describe("buildEntrySeed: edit-transfer", () => {
  const debit: any = { ...tx, id: 1, accountId: 1, currency: "USD", amount: -100, enteredAmount: -100, enteredCurrency: "USD", note: "", tags: "", linkId: "L" };
  const credit: any = { ...debit, id: 2, accountId: 2, amount: 100, enteredAmount: 100, note: "rent", tags: "t" };
  it("same currency: amount sent, accounts, note and tags from either leg, no received amount", () => {
    expect(buildEntrySeed({ kind: "edit-transfer", linkId: "L", debit, credit, returnTo: "/" })).toMatchObject({
      txType: "Transfer", date: "2026-01-02", amount: "100", accountId: "1", toAccountId: "2",
      note: "rent", tags: "t", currencyChoice: "", receivedAmount: "", showMore: true,
    });
  });
  it("cross currency: the received amount is the destination leg's own amount", () => {
    const s = buildEntrySeed({ kind: "edit-transfer", linkId: "L", debit, credit: { ...credit, currency: "CAD", amount: 135, enteredAmount: 100 }, returnTo: "/" });
    expect(s.receivedAmount).toBe("135");
    expect(s.amount).toBe("100");
  });
});

describe("toEntryMode", () => {
  it("maps both edit states", () => {
    const m = toEntryMode({ kind: "transaction-edit", tx, linkedSiblings: [] }, [], "/x");
    expect(m).toMatchObject({ kind: "edit", returnTo: "/x" });
    const t = toEntryMode({ kind: "transfer-edit", linkId: "L", debit: tx, credit: tx }, [], "/y");
    expect(t).toMatchObject({ kind: "edit-transfer", linkId: "L", returnTo: "/y" });
  });
});

describe("payload builders", () => {
  it("transaction PUT: id, fields as typed (empty strings kept), isBusiness 0/1, confirmReallocation only when set", () => {
    const base = { id: 7, date: "d", accountId: 1, categoryId: 2, enteredCurrency: "USD", enteredAmount: -5, payee: "", note: "", tags: "", isBusiness: false };
    expect(buildTransactionPutBody(base)).toEqual({ id: 7, date: "d", accountId: 1, categoryId: 2, enteredCurrency: "USD", enteredAmount: -5, payee: "", note: "", tags: "", isBusiness: 0 });
    expect(buildTransactionPutBody({ ...base, isBusiness: true, confirmReallocation: true })).toMatchObject({ isBusiness: 1, confirmReallocation: true });
  });
  it("splits body re-signs every row", () => {
    expect(buildSplitsBody({ transactionId: 7, sign: -1, rows: [{ categoryId: 2, amount: 2, note: "n" }, { categoryId: 2, amount: -3, note: "" }] })).toEqual({
      transactionId: 7, splits: [{ categoryId: 2, amount: -2, note: "n" }, { categoryId: 2, amount: -3, note: "" }],
    });
  });
  it("transfer PUT: note/tags/received only when present; in-kind fields cleared", () => {
    const base = { linkId: "L", fromAccountId: 1, toAccountId: 2, enteredAmount: 100, date: "d", note: "", tags: "" };
    expect(buildTransferPutBody(base)).toEqual({ fromAccountId: 1, toAccountId: 2, enteredAmount: 100, date: "d", linkId: "L", holdingName: null, destHoldingName: null, quantity: null, destQuantity: null });
    expect(buildTransferPutBody({ ...base, note: "n", tags: "t", receivedAmount: 135 })).toMatchObject({ note: "n", tags: "t", receivedAmount: 135 });
  });
});
