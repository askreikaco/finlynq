/**
 * @vitest-environment jsdom
 */
// The transactions list has no table: a row tap opens TransactionSheet, which carries the row's actions
// (Edit, Duplicate, Split, Delete) and every field the row leaves out. This replaces the old per-row icon
// buttons of TransactionTable; the Duplicate rule (canDuplicate) and the action wiring are unchanged.
import { describe, it, expect, vi, afterEach } from "vitest";
import * as React from "react";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
vi.mock("next/link", () => ({ default: ({ children, href }: any) => React.createElement("a", { href }, children) }));
vi.mock("@/components/currency-provider", () => ({ useDisplayCurrency: () => ({ displayCurrency: "VND" }) }));
vi.mock("@/components/transactions/pending-sync-badge", () => ({ PendingSyncBadge: () => null }));
vi.mock("@/app/(app)/transactions/_components/split-badge", () => ({ SplitBadge: () => null }));
import { TransactionSheet, transactionDetailItems } from "@/app/(app)/transactions/_components/transaction-sheet";

afterEach(cleanup);

const tx = (o: any) => ({
  id: 1, date: "2026-01-01", accountId: 1, accountName: "A", categoryId: 1, categoryName: "C", categoryType: "E",
  currency: "USD", amount: -5, enteredAmount: -5, enteredCurrency: "USD", quantity: null, portfolioHolding: null,
  note: "", payee: "p", tags: "", isBusiness: 0, linkId: null, tradeLinkId: null, kind: null, ...o,
});

function mount(t: any, h: Partial<Record<"onClose" | "onEdit" | "onDuplicate" | "onSplit" | "onDelete", (...a: any[]) => void>> = {}) {
  const fn = () => vi.fn();
  return render(
    <TransactionSheet
      tx={t}
      peer={null}
      onClose={h.onClose ?? fn()}
      onEdit={(x: any) => h.onEdit?.(x)}
      onDuplicate={(x: any) => h.onDuplicate?.(x)}
      onSplit={(x: any) => h.onSplit?.(x)}
      onDelete={(x: any) => h.onDelete?.(x)}
    />,
  );
}

describe("TransactionSheet actions", () => {
  it("Duplicate shows for a plain row and hides for transfer, trade, kind and FX rows", () => {
    const cases: Array<[any, boolean]> = [
      [tx({ id: 1 }), true],
      [tx({ id: 2, linkId: "L" }), false],
      [tx({ id: 3, kind: "buy" }), false],
      [tx({ id: 4, enteredCurrency: "EUR" }), false],
      [tx({ id: 5, tradeLinkId: "T" }), false],
    ];
    for (const [row, shown] of cases) {
      const { unmount } = mount(row);
      expect(screen.queryByRole("button", { name: "Duplicate" }) !== null).toBe(shown);
      unmount();
    }
  });

  it("Edit, Duplicate, Split and Delete call their handler with the row, and close the sheet first", () => {
    const calls: string[] = [];
    const onClose = vi.fn(() => calls.push("close"));
    const onEdit = vi.fn(() => calls.push("edit"));
    const onDuplicate = vi.fn(() => calls.push("duplicate"));
    const onSplit = vi.fn(() => calls.push("split"));
    const onDelete = vi.fn(() => calls.push("delete"));
    const row = tx({ id: 1 });
    mount(row, { onClose, onEdit, onDuplicate, onSplit, onDelete });

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(onEdit).toHaveBeenLastCalledWith(expect.objectContaining({ id: 1 }));
    fireEvent.click(screen.getByRole("button", { name: "Duplicate" }));
    expect(onDuplicate).toHaveBeenLastCalledWith(expect.objectContaining({ id: 1 }));
    fireEvent.click(screen.getByRole("button", { name: "Split" }));
    expect(onSplit).toHaveBeenLastCalledWith(expect.objectContaining({ id: 1 }));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(onDelete).toHaveBeenLastCalledWith(expect.objectContaining({ id: 1 }));
    // Every action closes the sheet before it runs, so the next dialog is not stacked on it.
    expect(calls).toEqual(["close", "edit", "close", "duplicate", "close", "split", "close", "delete"]);
  });

  it("a queued (pending) row has no Split action", () => {
    mount(tx({ id: -4, pendingSync: { kind: "create", status: "pending", opId: "x", failReason: null } }));
    expect(screen.queryByRole("button", { name: "Split" })).toBeNull();
    expect(screen.getByRole("button", { name: "Edit" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Delete" })).toBeTruthy();
  });

  it("the sheet title is the payee and the sheet has no table", () => {
    const { container } = mount(tx({ id: 1, payee: "Walmart" }));
    expect(screen.getAllByText("Walmart").length).toBeGreaterThan(0);
    expect(container.querySelector("table")).toBeNull();
  });
});

describe("transactionDetailItems", () => {
  const labelsOf = (items: ReturnType<typeof transactionDetailItems>) => items.map((i) => i.label);

  it("a transfer shows From and To in place of Account", () => {
    const labels = labelsOf(transactionDetailItems(tx({ id: 9, linkId: "L" }), { accountId: 2, accountName: "Savings" } as any));
    expect(labels).toContain("From");
    expect(labels).toContain("To");
    expect(labels).not.toContain("Account");
  });

  it("a plain row shows Account, Category, Payee, Note, Tags and Source", () => {
    const labels = labelsOf(transactionDetailItems(tx({ id: 9, tags: "a, b", source: "manual" }), null));
    for (const l of ["Date", "Amount", "Category", "Account", "Payee", "Note", "Tags", "Source"]) expect(labels).toContain(l);
  });

  it("an investment row adds Investment and Quantity; a kind adds Kind", () => {
    const items = transactionDetailItems(tx({ id: 9, portfolioHolding: "VTI", quantity: 3, kind: "buy" }), null);
    const labels = labelsOf(items);
    expect(labels).toContain("Investment");
    expect(labels).toContain("Quantity");
    expect(labels).toContain("Kind");
  });

  it("an entered amount in another currency shows the settlement amount beside it", () => {
    const items = transactionDetailItems(tx({ id: 9, enteredAmount: -10, enteredCurrency: "EUR", amount: -11, currency: "USD" }), null);
    const amount = items.find((i) => i.label === "Amount")!;
    const { container } = render(<>{amount.value}</>);
    expect(within(container).getByText(/→/)).toBeTruthy();
    cleanup();
  });
});
