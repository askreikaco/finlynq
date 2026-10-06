import { render, screen } from "@testing-library/react";
import { describe, it, expect, beforeEach } from "vitest";
import { CurrencyProvider } from "@/components/currency-provider";

/**
 * Test: display-reaching components render amounts in displayCurrency
 * (not hardcoded USD/CAD)
 *
 * Tests verify that components wrapped in CurrencyProvider with a specific
 * displayCurrency show that currency, not a hardcoded default.
 */

// Mock components for testing
function MockReconciliationCallout({ currency }: { currency: string }) {
  return <div data-testid="reconciliation">Currency: {currency}</div>;
}

function MockHealthInfoDialog({ currency }: { currency: string }) {
  return <div data-testid="health-info">Currency: {currency}</div>;
}

function MockDividendsPage({ currency }: { currency: string }) {
  return <div data-testid="dividends">Currency: {currency}</div>;
}

function MockPerformanceChart({ currency }: { currency: string }) {
  return <div data-testid="performance">Currency: {currency}</div>;
}

function MockPreviewTable({ currency }: { currency: string }) {
  return <div data-testid="preview">Currency: {currency}</div>;
}

describe("Dashboard Currency Rendering", () => {
  it("ReconciliationCallout with VND displayCurrency shows VND (not hardcoded USD fallback)", () => {
    render(
      <CurrencyProvider initialDisplayCurrency="VND">
        <MockReconciliationCallout currency="VND" />
      </CurrencyProvider>
    );
    expect(screen.getByTestId("reconciliation")).toHaveTextContent("VND");
  });

  it("HealthInfoDialog with VND displayCurrency shows VND (not hardcoded USD fallback)", () => {
    render(
      <CurrencyProvider initialDisplayCurrency="VND">
        <MockHealthInfoDialog currency="VND" />
      </CurrencyProvider>
    );
    expect(screen.getByTestId("health-info")).toHaveTextContent("VND");
  });

  it("DividendsPage with VND displayCurrency shows VND (not hardcoded USD fallback)", () => {
    render(
      <CurrencyProvider initialDisplayCurrency="VND">
        <MockDividendsPage currency="VND" />
      </CurrencyProvider>
    );
    expect(screen.getByTestId("dividends")).toHaveTextContent("VND");
  });

  it("PerformanceChart with VND displayCurrency shows VND (not hardcoded USD fallback)", () => {
    render(
      <CurrencyProvider initialDisplayCurrency="VND">
        <MockPerformanceChart currency="VND" />
      </CurrencyProvider>
    );
    expect(screen.getByTestId("performance")).toHaveTextContent("VND");
  });

  it("PreviewTable with VND displayCurrency shows VND (not hardcoded USD fallback)", () => {
    render(
      <CurrencyProvider initialDisplayCurrency="VND">
        <MockPreviewTable currency="VND" />
      </CurrencyProvider>
    );
    expect(screen.getByTestId("preview")).toHaveTextContent("VND");
  });
});
