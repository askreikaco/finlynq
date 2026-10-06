/**
 * @vitest-environment jsdom
 */
import "@testing-library/jest-dom";
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { QuickActionsRow } from "@/components/quick-actions-row";

afterEach(cleanup);

describe("QuickActionsRow", () => {
  it("should render all action buttons", () => {
    render(<QuickActionsRow />);

    expect(screen.getByRole("link", { name: /expense/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /income/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /transfer/i })).toBeInTheDocument();
  });

  it("should have correct hrefs for expense action", () => {
    render(<QuickActionsRow />);
    const expenseButton = screen.getByRole("link", { name: /expense/i });
    expect(expenseButton).toHaveAttribute("href", "/transactions/new?type=Expense");
  });

  it("should have correct hrefs for income action", () => {
    render(<QuickActionsRow />);
    const incomeButton = screen.getByRole("link", { name: /income/i });
    expect(incomeButton).toHaveAttribute("href", "/transactions/new?type=Income");
  });

  it("should have correct hrefs for transfer action", () => {
    render(<QuickActionsRow />);
    const transferButton = screen.getByRole("link", { name: /transfer/i });
    expect(transferButton).toHaveAttribute("href", "/transactions/new?type=Transfer");
  });

  it("should render with proper container styling", () => {
    const { container } = render(<QuickActionsRow />);
    const div = container.querySelector("div");
    expect(div).toHaveClass("flex", "gap-2", "flex-wrap");
  });
});
