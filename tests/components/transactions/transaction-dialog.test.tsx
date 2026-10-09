/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import * as React from "react";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
vi.mock("next/link", () => ({ default: ({ children, href }: any) => React.createElement("a", { href }, children) }));
vi.mock("@/components/currency-provider", () => ({ useDisplayCurrency: () => ({ displayCurrency: "USD" }) }));
vi.mock("@/components/dropdown-order-provider", () => ({ useDropdownOrder: () => <T,>(items: T[]) => items }));
vi.mock("@/lib/hooks/useActiveCurrencies", () => ({ useActiveCurrencies: () => ["USD"] }));
import { TransactionDialog } from "@/components/transactions/transaction-dialog";
afterEach(cleanup);
beforeEach(() => { vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ data: [] }) }))); 
  (globalThis as any).ResizeObserver ??= class { observe(){} unobserve(){} disconnect(){} };
  (Element.prototype as any).scrollIntoView ??= () => {}; (Element.prototype as any).hasPointerCapture ??= () => false; });
const tx: any = { id: 7, date: "2026-01-01", accountId: 1, accountName: "A", categoryId: 1, categoryName: "C", categoryType: "E", currency: "USD", amount: -5, enteredAmount: -5, enteredCurrency: "USD", quantity: null, portfolioHolding: null, note: "n", payee: "p", tags: "", isBusiness: 0, linkId: null };
const accounts: any = [{ id: 1, name: "A", currency: "USD", type: "A", group: "g", archived: false }];
const cats: any = [{ id: 1, name: "C", type: "E", group: "g" }];
function mount(extra: any, init: any) {
  const onOpenChange = vi.fn();
  render(<TransactionDialog open onOpenChange={onOpenChange} accounts={accounts} categories={cats} holdings={[]} initialState={init} onSaved={vi.fn()} {...extra} />);
  return onOpenChange;
}
describe("dialog (create callers only; edit lives on /transactions/[id]/edit)", () => {
  it("edit-kind state renders the shared fields but offers no Duplicate or Delete (the page owns them)", () => {
    mount({}, { kind: "transaction-edit", tx, linkedSiblings: [] });
    expect(screen.queryByRole("button", { name: "Duplicate transaction" })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Delete/ })).toBeNull();
  });
  it("create mode: submit button only, no Duplicate", () => {
    mount({}, null);
    expect(screen.queryByRole("button", { name: "Duplicate transaction" })).toBeNull();
    expect(screen.getByRole("button", { name: "Create Transaction" })).toBeTruthy();
  });
  it("transfer-leg edit state: no Duplicate", () => {
    mount({}, { kind: "transaction-edit", tx: { ...tx, linkId: "L" }, linkedSiblings: [] });
    expect(screen.queryByRole("button", { name: "Duplicate transaction" })).toBeNull();
  });
});
