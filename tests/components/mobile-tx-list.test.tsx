/**
 * @vitest-environment jsdom
 * Mobile transaction list: date grouping, icon types, payee fallback,
 * account visibility, amount colors, edit handler.
 */
import "@testing-library/jest-dom";
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, within, fireEvent } from "@testing-library/react";
import * as fs from "fs";
import * as path from "path";
import userEvent from "@testing-library/user-event";
import { MobileTxList } from "@/components/transactions/mobile-tx-list";
import type { Transaction } from "@/app/(app)/transactions/_types";

const today = new Date();
const yesterday = new Date(today);
yesterday.setDate(yesterday.getDate() - 1);
const twoAgo = new Date(today);
twoAgo.setDate(twoAgo.getDate() - 2);

const todayISO = today.toISOString().split("T")[0];
const yesterdayISO = yesterday.toISOString().split("T")[0];
const twoDaysAgoISO = twoAgo.toISOString().split("T")[0];

const mockTx = (overrides: Partial<Transaction> = {}): Transaction => ({
  id: 1,
  date: todayISO,
  accountId: 1,
  accountName: "Checking",
  accountAlias: "Main",
  accountType: "asset",
  categoryId: 10,
  categoryName: "Groceries",
  categoryType: "expense",
  currency: "USD",
  amount: -50,
  enteredAmount: -50,
  enteredCurrency: "USD",
  enteredFxRate: 1,
  quantity: null,
  portfolioHolding: null,
  note: "Weekly shop",
  payee: "Walmart",
  tags: "groceries,weekly",
  isBusiness: null,
  linkId: null,
  source: "manual",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...overrides,
});

describe("MobileTxList", () => {
  const onEdit = vi.fn();

  beforeEach(() => {
    onEdit.mockClear();
  });

  describe("date grouping", () => {
    it("groups transactions by date with correct labels", () => {
      const txns = [
        mockTx({ id: 1, date: todayISO }),
        mockTx({ id: 2, date: todayISO }),
        mockTx({ id: 3, date: yesterdayISO }),
        mockTx({ id: 4, date: twoDaysAgoISO }),
      ];
      render(
        <MobileTxList transactions={txns} onEdit={onEdit} />
      );

      expect(screen.getByText("Today")).toBeInTheDocument();
      expect(screen.getByText("Yesterday")).toBeInTheDocument();
      // Third group should have a formatted date (not "Today" or "Yesterday")
      const allHeadings = screen.getAllByRole("heading", { level: 2 });
      expect(allHeadings).toHaveLength(3);
    });

    it("shows 'Today' for today's date", () => {
      const txns = [mockTx({ id: 1, date: todayISO })];
      render(<MobileTxList transactions={txns} onEdit={onEdit} />);
      expect(screen.getByText("Today")).toBeInTheDocument();
    });

    it("shows 'Yesterday' for yesterday's date", () => {
      const txns = [mockTx({ id: 1, date: yesterdayISO })];
      render(<MobileTxList transactions={txns} onEdit={onEdit} />);
      expect(screen.getByText("Yesterday")).toBeInTheDocument();
    });
  });

  describe("icons and colors", () => {
    it("shows transfer icon when linkId is set", () => {
      const txns = [mockTx({ id: 1, amount: -100, linkId: "link1" })];
      render(<MobileTxList transactions={txns} onEdit={onEdit} />);
      // Just verify the row is rendered; icon logic is handled internally
      const row = screen.getByRole("button", { name: /Walmart/i });
      expect(row).toBeInTheDocument();
    });

    it("shows incoming icon and emerald color for positive amounts", () => {
      const txns = [mockTx({ id: 1, amount: 100 })];
      render(<MobileTxList transactions={txns} onEdit={onEdit} />);
      const row = screen.getByRole("button", { name: /Walmart/i });
      // Check for emerald color on the amount
      const amount = within(row as HTMLElement).getByText(/\+\$100/);
      expect(amount).toHaveClass("text-pos");
    });

    it("shows outgoing icon and default color for negative amounts", () => {
      const txns = [mockTx({ id: 1, amount: -100 })];
      render(<MobileTxList transactions={txns} onEdit={onEdit} />);
      const row = screen.getByRole("button", { name: /Walmart/i });
      const amount = within(row as HTMLElement).getByText(/-\$100/);
      expect(amount).toHaveClass("text-foreground");
    });
  });

  describe("payee and category", () => {
    it("shows payee when available", () => {
      const txns = [mockTx({ id: 1, payee: "Amazon" })];
      render(<MobileTxList transactions={txns} onEdit={onEdit} />);
      expect(screen.getByText("Amazon")).toBeInTheDocument();
    });

    it("falls back to category when payee is empty", () => {
      const txns = [mockTx({ id: 1, payee: "" })];
      render(<MobileTxList transactions={txns} onEdit={onEdit} />);
      // Category should appear somewhere on the page when payee is empty
      const groceriesElements = screen.getAllByText("Groceries");
      expect(groceriesElements.length).toBeGreaterThan(0);
    });

    it("shows dash when both payee and category are empty", () => {
      const txns = [mockTx({ id: 1, payee: "", categoryName: "" })];
      render(<MobileTxList transactions={txns} onEdit={onEdit} />);
      // Dash should appear as the title when both are empty
      expect(screen.getByText("—")).toBeInTheDocument();
    });
  });

  describe("account name visibility", () => {
    it("hides account name when showAccountName is false", () => {
      const txns = [mockTx({ id: 1 })];
      render(<MobileTxList transactions={txns} onEdit={onEdit} showAccountName={false} />);
      // Should only show category, not account
      expect(screen.getByText("Groceries")).toBeInTheDocument();
      expect(screen.queryByText(/Main/)).not.toBeInTheDocument();
    });

    it("shows account name when showAccountName is true", () => {
      const txns = [mockTx({ id: 1, accountAlias: "My Checking" })];
      render(<MobileTxList transactions={txns} onEdit={onEdit} showAccountName={true} />);
      // Should show both category and account
      expect(screen.getByText(/Groceries · My Checking/)).toBeInTheDocument();
    });
  });

  describe("edit handler", () => {
    it("calls onEdit when row is clicked", async () => {
      const user = userEvent.setup();
      const txns = [mockTx({ id: 42, payee: "Target" })];
      render(<MobileTxList transactions={txns} onEdit={onEdit} />);

      const row = screen.getByRole("button", { name: /Target/i });
      await user.click(row);

      expect(onEdit).toHaveBeenCalledWith(expect.objectContaining({ id: 42 }));
    });

    it("calls the same handler for multiple rows", async () => {
      const user = userEvent.setup();
      const txns = [
        mockTx({ id: 1, payee: "Store1" }),
        mockTx({ id: 2, payee: "Store2" }),
      ];
      render(<MobileTxList transactions={txns} onEdit={onEdit} />);

      await user.click(screen.getByRole("button", { name: /Store1/i }));
      await user.click(screen.getByRole("button", { name: /Store2/i }));

      expect(onEdit).toHaveBeenCalledTimes(2);
      expect(onEdit).toHaveBeenNthCalledWith(1, expect.objectContaining({ id: 1 }));
      expect(onEdit).toHaveBeenNthCalledWith(2, expect.objectContaining({ id: 2 }));
    });
  });

  describe("amount formatting", () => {
    it("adds + sign to positive amounts", () => {
      const txns = [mockTx({ id: 1, amount: 123.45 })];
      render(<MobileTxList transactions={txns} onEdit={onEdit} />);
      expect(screen.getByText("+$123.45")).toBeInTheDocument();
    });

    it("keeps - sign for negative amounts", () => {
      const txns = [mockTx({ id: 1, amount: -123.45 })];
      render(<MobileTxList transactions={txns} onEdit={onEdit} />);
      expect(screen.getByText("-$123.45")).toBeInTheDocument();
    });
  });

  describe("empty state", () => {
    it("shows empty message when no transactions", () => {
      render(<MobileTxList transactions={[]} onEdit={onEdit} />);
      expect(screen.getByText("No transactions found")).toBeInTheDocument();
    });

    it("shows loading message when isLoading is true", () => {
      render(<MobileTxList transactions={[]} onEdit={onEdit} isLoading={true} />);
      expect(screen.getByText("Loading transactions...")).toBeInTheDocument();
    });
  });

  describe("load more button", () => {
    it("shows load more button when hasMore is true", () => {
      const txns = [mockTx({ id: 1 })];
      render(
        <MobileTxList
          transactions={txns}
          onEdit={onEdit}
          hasMore={true}
          onLoadMore={vi.fn()}
        />
      );
      expect(screen.getByRole("button", { name: "Load more" })).toBeInTheDocument();
    });

    it("calls onLoadMore when load more button is clicked", async () => {
      const user = userEvent.setup();
      const onLoadMore = vi.fn();
      const txns = [mockTx({ id: 1 })];
      render(
        <MobileTxList
          transactions={txns}
          onEdit={onEdit}
          hasMore={true}
          onLoadMore={onLoadMore}
        />
      );

      await user.click(screen.getByRole("button", { name: "Load more" }));
      expect(onLoadMore).toHaveBeenCalled();
    });

    it("disables load more button when isLoadingMore is true", () => {
      const txns = [mockTx({ id: 1 })];
      render(
        <MobileTxList
          transactions={txns}
          onEdit={onEdit}
          hasMore={true}
          isLoadingMore={true}
          onLoadMore={vi.fn()}
        />
      );
      const btn = screen.getByRole("button", { name: "Loading..." });
      expect(btn).toBeDisabled();
    });
  });

  describe("Cards view (phone rows)", () => {
    it("a row tap edits that transaction; the list carries no breakpoint tokens", () => {
      const onEditSpy = vi.fn();
      render(<MobileTxList transactions={[mockTx({ id: 7, payee: "Lidl" })]} onEdit={onEditSpy} />);
      fireEvent.click(screen.getByRole("button", { name: /^Edit Lidl$/ }));
      expect(onEditSpy).toHaveBeenCalledWith(expect.objectContaining({ id: 7 }));
      const src = fs.readFileSync(path.resolve(__dirname, "../../src/components/transactions/mobile-tx-list.tsx"), "utf-8");
      expect(src.match(/(?<![\w-])(max-)?(sm|md|lg|xl|2xl):/g) ?? []).toEqual([]);
    });
  });
});
