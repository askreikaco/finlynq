/**
 * @vitest-environment jsdom
 * Test Amount component with real CurrencyProvider (displayCurrency fallback).
 * Tests that empty/missing currency falls back to user's displayCurrency setting,
 * not a hardcoded USD/CAD default.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

// Mock only fetch; use real CurrencyProvider
vi.stubGlobal("fetch", vi.fn());

import { CurrencyProvider } from "@/components/currency-provider";
import { Amount } from "@/components/mobile/amount";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// Wrapper that provides real CurrencyProvider with mocked fetch
function renderWithCurrency(
  element: React.ReactElement,
  sessionData?: { displayCurrency: string }
) {
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);

  // Mock /api/auth/session to return the provided currency
  fetchMock.mockImplementation((url: string) => {
    if (url === "/api/auth/session") {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ displayCurrency: sessionData?.displayCurrency || "USD" })
      });
    }
    return Promise.reject(new Error(`Unexpected fetch: ${url}`));
  });

  return render(
    <CurrencyProvider>
      {element}
    </CurrencyProvider>
  );
}

describe("Amount component with real CurrencyProvider", () => {
  it("uses displayCurrency when currency prop is undefined", async () => {
    // Session returns VND as displayCurrency
    renderWithCurrency(<Amount value={1000000} />, { displayCurrency: "VND" });

    // Wait for provider to fetch and update
    const span = await screen.findByTestId("amount");
    expect(span.textContent).toContain("₫");
  });

  it("uses displayCurrency (CAD) when currency prop is undefined", async () => {
    renderWithCurrency(<Amount value={100} />, { displayCurrency: "CAD" });

    const span = await screen.findByTestId("amount");
    expect(span.textContent).toContain("C$");
  });

  it("treats empty string currency as missing and uses displayCurrency", async () => {
    // Empty string should be treated as missing
    renderWithCurrency(<Amount value={100} currency="" />, { displayCurrency: "CAD" });

    const span = await screen.findByTestId("amount");
    expect(span.textContent).toContain("C$");
  });

  it("treats whitespace-only currency as missing and uses displayCurrency", async () => {
    // Whitespace should be treated as missing - trim() protects against this
    renderWithCurrency(<Amount value={100} currency="   " />, { displayCurrency: "VND" });

    const span = await screen.findByTestId("amount");
    expect(span.textContent).toContain("₫");
  });

  it("respects explicit currency prop even when displayCurrency differs", async () => {
    // Even though displayCurrency is VND, explicit USD should be used
    renderWithCurrency(<Amount value={100} currency="USD" />, { displayCurrency: "VND" });

    const span = screen.getByTestId("amount");
    expect(span.textContent).toContain("$100");
    expect(span.textContent).not.toContain("₫");
  });

  it("uses USD during loading (before session fetch completes)", () => {
    // Create a fetch that never resolves
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));

    render(
      <CurrencyProvider>
        <Amount value={100} />
      </CurrencyProvider>
    );

    // Before fetch completes, should use USD default (first paint)
    const span = screen.getByTestId("amount");
    expect(span.textContent).toContain("$100");
  });

  it("shows VND with correct amount formatting (no decimals)", async () => {
    renderWithCurrency(<Amount value={1234567} />, { displayCurrency: "VND" });

    const span = await screen.findByTestId("amount");
    // VND should not have decimals
    expect(span.textContent).toBe("₫1,234,567");
  });
});
