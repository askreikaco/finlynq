/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import React from "react";
import { render, cleanup, fireEvent, renderHook, act } from "@testing-library/react";
import { SPLIT_VIEW_STORAGE_KEY, readSplitView, useSplitView } from "@/lib/transactions/split-view";
import { TransactionDetailPane } from "@/app/(app)/transactions/_components/transaction-detail-pane";

vi.mock("@/components/mobile/amount", () => ({ Amount: ({ value }: { value: number }) => <span data-testid="amount">{value}</span> }));

const tx = {
  id: 7, date: "2026-10-11", accountId: 1, accountName: "Cash", categoryId: 2, categoryName: "Food", categoryType: "E",
  currency: "VND", amount: -50000, quantity: null, portfolioHolding: null, note: "lunch", payee: "Pho 24", tags: "", isBusiness: null, linkId: null,
} as any;

describe("split view preference", () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(cleanup);

  it("defaults off and persists the choice", () => {
    expect(readSplitView()).toBe(false);
    const { result } = renderHook(() => useSplitView());
    expect(result.current[0]).toBe(false);
    act(() => result.current[1](true));
    expect(result.current[0]).toBe(true);
    expect(window.localStorage.getItem(SPLIT_VIEW_STORAGE_KEY)).toBe("1");
    expect(readSplitView()).toBe(true);
  });

  it("falls back to off when storage throws", () => {
    const spy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    expect(readSplitView()).toBe(false);
    spy.mockRestore();
  });
});

describe("TransactionDetailPane", () => {
  afterEach(cleanup);

  it("shows an empty prompt with no selection", () => {
    const { getByText } = render(<TransactionDetailPane transaction={null} onEdit={() => {}} onClose={() => {}} />);
    expect(getByText(/Select a transaction/)).toBeTruthy();
  });

  it("shows the row's fields and wires Edit and Close", () => {
    const onEdit = vi.fn();
    const onClose = vi.fn();
    const { getByText, getByLabelText } = render(<TransactionDetailPane transaction={tx} onEdit={onEdit} onClose={onClose} />);
    expect(getByText("Pho 24")).toBeTruthy();
    expect(getByText("Food")).toBeTruthy();
    expect(getByText("lunch")).toBeTruthy();
    fireEvent.click(getByText("Edit"));
    expect(onEdit).toHaveBeenCalledWith(tx);
    fireEvent.click(getByLabelText("Close details"));
    expect(onClose).toHaveBeenCalled();
  });
});
