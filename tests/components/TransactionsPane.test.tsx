/**
 * @vitest-environment jsdom
 * Test TransactionsPane component with real CurrencyProvider (displayCurrency fallback).
 * Tests that empty/missing currency falls back to user's displayCurrency setting,
 * not a hardcoded CAD default.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

// Mock only fetch; use real CurrencyProvider
vi.stubGlobal("fetch", vi.fn());

import { CurrencyProvider } from "@/components/currency-provider";
import { TransactionsPane, type TxRow } from "@/components/reconcile/transactions-pane";

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

function createRow(currency: string): TxRow {
  return {
    id: 1,
    date: "2026-01-01",
    amount: 1000,
    currency,
    payee: "Test Payee",
    category: "Test Category",
    status: "tx_only",
    linkedBankTransactionId: null,
    suggestion: null,
  };
}

describe("TransactionsPane with real CurrencyProvider", () => {
  it("uses explicit currency when provided", () => {
    const row = createRow("EUR");
    renderWithCurrency(
      <TransactionsPane
        rows={[row]}
        loading={false}
        onAccept={() => {}}
        onReject={() => {}}
        busySuggestionKey={null}
      />,
      { displayCurrency: "VND" }
    );

    // Should show EUR symbol, not VND
    // Note: explicit currency should be used immediately, no async needed
    const container = screen.getByRole("table");
    expect(container.textContent).toContain("€");
    expect(container.textContent).not.toContain("₫");
  });

  it("uses displayCurrency when currency is empty string", async () => {
    const row = createRow("");
    renderWithCurrency(
      <TransactionsPane
        rows={[row]}
        loading={false}
        onAccept={() => {}}
        onReject={() => {}}
        busySuggestionKey={null}
      />,
      { displayCurrency: "VND" }
    );

    // Wait for provider to fetch and update displayCurrency
    // Then check that empty currency falls back to displayCurrency (VND)
    await expect.poll(
      () => screen.getByRole("table").textContent?.includes("₫"),
      { timeout: 2000 }
    ).toBeTruthy();

    const container = screen.getByRole("table");
    expect(container.textContent).toContain("₫");
  });

  it("uses displayCurrency when currency is whitespace", async () => {
    const row = createRow("   ");
    renderWithCurrency(
      <TransactionsPane
        rows={[row]}
        loading={false}
        onAccept={() => {}}
        onReject={() => {}}
        busySuggestionKey={null}
      />,
      { displayCurrency: "VND" }
    );

    // Wait for provider to fetch and update
    await expect.poll(
      () => screen.getByRole("table").textContent?.includes("₫"),
      { timeout: 2000 }
    ).toBeTruthy();

    const container = screen.getByRole("table");
    expect(container.textContent).toContain("₫");
  });

  it("never uses hardcoded CAD fallback", () => {
    const row = createRow("");
    renderWithCurrency(
      <TransactionsPane
        rows={[row]}
        loading={false}
        onAccept={() => {}}
        onReject={() => {}}
        busySuggestionKey={null}
      />,
      { displayCurrency: "USD" }
    );

    // Should never show C$ (hardcoded CAD) - only USD from displayCurrency
    const container = screen.getByRole("table");
    expect(container.textContent).not.toContain("C$");
  });

  it("respects displayCurrency (CAD) for empty currency", async () => {
    const row = createRow("");
    renderWithCurrency(
      <TransactionsPane
        rows={[row]}
        loading={false}
        onAccept={() => {}}
        onReject={() => {}}
        busySuggestionKey={null}
      />,
      { displayCurrency: "CAD" }
    );

    // Wait for provider to fetch and update
    await expect.poll(
      () => screen.getByRole("table").textContent?.includes("C$"),
      { timeout: 2000 }
    ).toBeTruthy();

    const container = screen.getByRole("table");
    expect(container.textContent).toContain("C$");
  });
});
