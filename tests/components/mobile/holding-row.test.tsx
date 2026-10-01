/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HoldingRow } from "@/components/mobile/holding-row";

afterEach(cleanup);

describe("HoldingRow", () => {
  const mockOnClick = vi.fn();

  beforeEach(() => {
    mockOnClick.mockClear();
  });

  it("renders holding name and market value", () => {
    render(
      <HoldingRow
        id="1"
        name="Apple Inc"
        ticker="AAPL"
        marketValue={50000000}
        unrealizedPct={5.5}
        currency="VND"
        onClick={mockOnClick}
      />
    );

    // getByText will throw if not found, so no need for explicit assertion
    screen.getByText("Apple Inc");
    screen.getByText(/50,000,000/);
  });

  it("shows ticker as subtitle", () => {
    render(
      <HoldingRow
        id="1"
        name="Apple Inc"
        ticker="AAPL"
        marketValue={50000000}
        unrealizedPct={5.5}
        currency="VND"
        onClick={mockOnClick}
      />
    );

    screen.getByText("AAPL");
  });

  it("displays unrealized percentage with correct sign", () => {
    const { rerender } = render(
      <HoldingRow
        id="1"
        name="Apple Inc"
        ticker="AAPL"
        marketValue={50000000}
        unrealizedPct={5.5}
        currency="VND"
        onClick={mockOnClick}
      />
    );

    screen.getByText("+5.50%");

    rerender(
      <HoldingRow
        id="2"
        name="Microsoft"
        ticker="MSFT"
        marketValue={45000000}
        unrealizedPct={-2.3}
        currency="VND"
        onClick={mockOnClick}
      />
    );

    screen.getByText("-2.30%");
  });

  it("calls onClick when clicked", async () => {
    const user = userEvent.setup();
    render(
      <HoldingRow
        id="1"
        name="Apple Inc"
        ticker="AAPL"
        marketValue={50000000}
        unrealizedPct={5.5}
        currency="VND"
        onClick={mockOnClick}
      />
    );

    const button = screen.getByRole("button");
    await user.click(button);

    expect(mockOnClick).toHaveBeenCalledOnce();
  });

  it("applies correct color class for positive unrealized", () => {
    const { container } = render(
      <HoldingRow
        id="1"
        name="Apple Inc"
        ticker="AAPL"
        marketValue={50000000}
        unrealizedPct={5.5}
        currency="VND"
        onClick={mockOnClick}
      />
    );

    const percentElement = container.querySelector(".text-pos");
    expect(percentElement).toBeTruthy();
  });

  it("applies correct color class for negative unrealized", () => {
    const { container } = render(
      <HoldingRow
        id="1"
        name="Apple Inc"
        ticker="AAPL"
        marketValue={50000000}
        unrealizedPct={-5.5}
        currency="VND"
        onClick={mockOnClick}
      />
    );

    const percentElement = container.querySelector(".text-neg");
    expect(percentElement).toBeTruthy();
  });
});
