/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom";

let cur = { displayCurrency: "USD", isLoading: false, setDisplayCurrency: vi.fn() };
vi.mock("@/components/currency-provider", () => ({ useDisplayCurrency: () => cur }));

import { Amount } from "@/components/mobile/amount";

afterEach(() => {
  cleanup();
  cur = { displayCurrency: "USD", isLoading: false, setDisplayCurrency: vi.fn() };
});

describe("Amount component", () => {
  it("renders with explicit currency prop", () => {
    render(<Amount value={100} currency="CAD" />);
    const span = screen.getByTestId("amount");
    expect(span.textContent).toContain("C$");
  });

  it("uses displayCurrency when currency prop is not provided", () => {
    cur = { displayCurrency: "CAD", isLoading: false, setDisplayCurrency: vi.fn() };
    render(<Amount value={100} />);
    const span = screen.getByTestId("amount");
    expect(span.textContent).toContain("C$");
  });

  it("uses displayCurrency (VND) when currency prop is not provided", () => {
    cur = { displayCurrency: "VND", isLoading: false, setDisplayCurrency: vi.fn() };
    render(<Amount value={1000000} />);
    const span = screen.getByTestId("amount");
    expect(span.textContent).toContain("₫");
  });

  it("defaults to USD during first paint (isLoading true)", () => {
    cur = { displayCurrency: "CAD", isLoading: true, setDisplayCurrency: vi.fn() };
    render(<Amount value={100} />);
    const span = screen.getByTestId("amount");
    // Should show USD ($) not CAD (C$) during loading
    expect(span.textContent).toContain("$");
    expect(span.textContent).not.toContain("C$");
  });

  it("explicit currency prop overrides displayCurrency", () => {
    cur = { displayCurrency: "CAD", isLoading: false, setDisplayCurrency: vi.fn() };
    render(<Amount value={100} currency="USD" />);
    const span = screen.getByTestId("amount");
    expect(span.textContent).not.toContain("C$");
  });

  it("shows formatted amount with correct size classes", () => {
    render(<Amount value={1234.56} currency="USD" size="lg" />);
    const span = screen.getByTestId("amount");
    expect(span.className).toContain("text-xl");
    expect(span.className).toContain("font-bold");
  });

  it("applies tone color class", () => {
    render(<Amount value={100} currency="USD" tone="pos" />);
    const span = screen.getByTestId("amount");
    expect(span.className).toContain("text-pos");
  });

  it("shows sign with positive value when showSign is true", () => {
    render(<Amount value={100} currency="USD" showSign={true} />);
    const span = screen.getByTestId("amount");
    expect(span.textContent).toBe("+$100.00");
  });
});
