/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import * as React from "react";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
vi.mock("next/link", () => ({ default: ({ children, href }: any) => React.createElement("a", { href }, children) }));
vi.mock("@/components/currency-provider", () => ({ useDisplayCurrency: () => ({ displayCurrency: "VND" }) }));
import { TransactionTable } from "@/app/(app)/transactions/_components/transaction-table";
import { DEFAULT_COLUMNS } from "@/lib/transactions/columns";
afterEach(cleanup);
const tx = (o: any) => ({ id: 1, date: "2026-01-01", accountId: 1, accountName: "A", categoryId: 1, categoryName: "C", categoryType: "E", currency: "USD", amount: -5, enteredAmount: -5, enteredCurrency: "USD", quantity: null, portfolioHolding: null, note: "", payee: "p", tags: "", isBusiness: 0, linkId: null, tradeLinkId: null, kind: null, ...o });
function mount(txns: any[], h: any = {}) {
  const fn = () => vi.fn();
  return render(<TransactionTable loading={false} txns={txns} columnPrefs={DEFAULT_COLUMNS as any} accounts={[]} categories={[]} selected={new Set()} allSelected={false} draggingCol={null} sortPref={{ columnId: "date", dir: "desc" } as any} filters={{ tag: "" } as any} setFilters={fn()} setPage={fn()} toggleAll={fn()} toggleOne={fn()} cycleSort={fn()} findColFilter={() => undefined} setColFilter={fn()} onColDragStart={() => fn() as any} onColDragOver={() => fn() as any} onColDragEnd={fn()} startEdit={h.startEdit ?? fn()} openSplitDialog={h.openSplitDialog ?? fn()} confirmDelete={h.confirmDelete ?? fn()} startDuplicate={h.startDuplicate ?? fn()} />);
}
describe("table", () => {
  it("shows Duplicate for plain, hides for transfer/trade/kind/fx; Edit/Delete/Split unchanged", () => {
    const startDuplicate = vi.fn(), startEdit = vi.fn(), confirmDelete = vi.fn(), openSplitDialog = vi.fn();
    mount([tx({ id: 1 }), tx({ id: 2, linkId: "L" }), tx({ id: 3, kind: "buy" }), tx({ id: 4, enteredCurrency: "EUR" }), tx({ id: 5, tradeLinkId: "T" })], { startDuplicate, startEdit, confirmDelete, openSplitDialog });
    const dups = screen.getAllByLabelText("Duplicate transaction");
    expect(dups.length).toBe(1);
    fireEvent.click(dups[0]);
    expect(startDuplicate).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }));
    expect(screen.getAllByTitle("Edit").length).toBe(5);
    expect(screen.getAllByTitle("Delete").length).toBe(5);
    expect(screen.getAllByTitle("Split").length).toBe(5);
    fireEvent.click(screen.getAllByTitle("Edit")[1]); expect(startEdit).toHaveBeenCalledWith(expect.objectContaining({ id: 2 }));
    fireEvent.click(screen.getAllByTitle("Delete")[0]); expect(confirmDelete).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }));
    expect(startDuplicate).toHaveBeenCalledTimes(1);
  });
});
