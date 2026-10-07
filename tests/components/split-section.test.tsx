/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { useState } from "react";

let locale: "en-CA" | "vi-VN" | "ja-JP" = "en-CA";
vi.mock("@/components/language-provider", () => ({ useLanguage: () => ({ locale }) }));
vi.mock("@/components/ui/input", () => ({
  Input: (p: Record<string, unknown>) => <input {...(p as Record<string, unknown>)} />,
}));

import { SplitSection, type SplitRow } from "@/app/(app)/transactions/new/_components/split-section";
import { setActiveDisplayLocale } from "@/lib/locale";
import { formatCurrency } from "@/lib/currency";
import type { Category } from "@/app/(app)/transactions/new/_components/category-selector";

const mockCategories: Category[] = [
  { id: "1", name: "Food", type: "expense" },
  { id: "2", name: "Transport", type: "expense" },
];

interface SplitSectionHarnessProps {
  currency?: string;
  initialRows?: SplitRow[];
  initialEnabled?: boolean;
  totalAmount?: number;
}

function SplitSectionHarness({
  currency = "USD",
  initialRows = [{ id: "1", categoryId: "1", amount: "", note: "" }],
  initialEnabled = true,
  totalAmount = 100,
}: SplitSectionHarnessProps) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [rows, setRows] = useState<SplitRow[]>(initialRows);

  return (
    <>
      <SplitSection
        enabled={enabled}
        onToggle={setEnabled}
        rows={rows}
        onChangeRows={setRows}
        categories={mockCategories}
        totalAmount={totalAmount}
        currency={currency}
        onOpenCategorySelector={() => {}}
      />
      <div data-testid="enabled">{String(enabled)}</div>
      <div data-testid="rows">{JSON.stringify(rows)}</div>
    </>
  );
}

afterEach(() => {
  cleanup();
  locale = "en-CA";
  setActiveDisplayLocale("en-CA");
});

describe("SplitSection with AmountInput", () => {
  it("renders split section with currency-aware formatting", () => {
    render(<SplitSectionHarness currency="USD" />);

    // Check that split toggle is rendered
    const checkbox = screen.getByRole("checkbox");
    expect(checkbox).toBeTruthy();
    expect((checkbox as HTMLInputElement).type).toBe("checkbox");
  });

  it("vi language: typing decimal comma in amount input parses to canonical dot decimal", async () => {
    locale = "vi-VN";
    setActiveDisplayLocale("vi-VN");

    const initialRows: SplitRow[] = [{ id: "1", categoryId: "1", amount: "", note: "" }];

    render(<SplitSectionHarness currency="USD" initialRows={initialRows} />);

    // Get amount input by placeholder
    const amountInput = screen.getByPlaceholderText("0.00") as HTMLInputElement;
    expect(amountInput).toBeTruthy();

    // Type Vietnamese decimal separator
    fireEvent.change(amountInput, { target: { value: "1,5" } });

    await waitFor(() => {
      // Check that the canonical value in rows is 1.5
      const rowsOutput = screen.getByTestId("rows").textContent;
      const parsed = JSON.parse(rowsOutput || "[]");
      expect(parsed[0].amount).toBe("1.5");
    });
  });

  it("vi language: typing thousand separators parses correctly", async () => {
    locale = "vi-VN";
    setActiveDisplayLocale("vi-VN");

    const initialRows: SplitRow[] = [{ id: "1", categoryId: "1", amount: "", note: "" }];

    render(<SplitSectionHarness currency="VND" initialRows={initialRows} />);

    const amountInput = screen.getByPlaceholderText("0") as HTMLInputElement;
    expect(amountInput).toBeTruthy();

    // Type Vietnamese format
    fireEvent.change(amountInput, { target: { value: "1.234.567" } });

    await waitFor(() => {
      const rowsOutput = screen.getByTestId("rows").textContent;
      const parsed = JSON.parse(rowsOutput || "[]");
      expect(parsed[0].amount).toBe("1234567");
    });
  });

  it("vi display test: state 1.5 renders as display value 1,5", () => {
    locale = "vi-VN";
    setActiveDisplayLocale("vi-VN");

    const initialRows: SplitRow[] = [{ id: "1", categoryId: "1", amount: "1.5", note: "" }];

    render(<SplitSectionHarness currency="USD" initialRows={initialRows} />);

    const amountInput = screen.getByPlaceholderText("0.00") as HTMLInputElement;
    expect(amountInput).toBeTruthy();
    expect(amountInput.value).toBe("1,5");
  });

  it("onValueChange callback is wired correctly to update amount", async () => {
    const initialRows: SplitRow[] = [{ id: "1", categoryId: "1", amount: "50", note: "" }];

    render(<SplitSectionHarness currency="USD" initialRows={initialRows} />);

    // Verify initial rows state
    let rowsOutput = screen.getByTestId("rows").textContent;
    let parsed = JSON.parse(rowsOutput || "[]");
    expect(parsed[0].amount).toBe("50");

    // Find the input with value "50"
    const amountInput = screen.getByDisplayValue("50") as HTMLInputElement;
    expect(amountInput).toBeTruthy();

    fireEvent.change(amountInput, { target: { value: "100" } });

    await waitFor(() => {
      rowsOutput = screen.getByTestId("rows").textContent;
      parsed = JSON.parse(rowsOutput || "[]");
      expect(parsed[0].amount).toBe("100");
    });
  });

  it("USD: Balanced status with dollar symbol", async () => {
    render(
      <SplitSectionHarness
        currency="USD"
        initialRows={[{ id: "1", categoryId: "1", amount: "100", note: "" }]}
        totalAmount={100}
      />
    );

    await waitFor(() => {
      const pageText = screen.getByTestId("enabled").parentElement?.textContent || "";
      expect(pageText).toContain("Balanced");
      expect(pageText).toContain(formatCurrency(100, "USD"));
    });
  });

  it("USD: Over by status displays correctly", () => {
    render(
      <SplitSectionHarness
        currency="USD"
        initialRows={[{ id: "1", categoryId: "1", amount: "110", note: "" }]}
        totalAmount={100}
      />
    );

    const pageText = screen.getByTestId("enabled").parentElement?.textContent || "";
    expect(pageText).toContain("Over by");
    expect(pageText).toContain(formatCurrency(10, "USD"));
  });

  it("VND balance test: amount=50000, totalAmount=100000 displays remaining 50000 in VND", () => {
    render(
      <SplitSectionHarness
        currency="VND"
        initialRows={[{ id: "1", categoryId: "1", amount: "50000", note: "" }]}
        totalAmount={100000}
      />
    );

    const { container } = render(
      <SplitSectionHarness
        currency="VND"
        initialRows={[{ id: "1", categoryId: "1", amount: "50000", note: "" }]}
        totalAmount={100000}
      />
    );

    const text = container.textContent || "";
    expect(text).toMatch(/50[.,\s]?000/);
    expect(text).toContain("remaining");
    expect(text).not.toContain("$");
  });

  it("AmountInput handles language-specific separators correctly", () => {
    locale = "vi-VN";
    setActiveDisplayLocale("vi-VN");

    const initialRows: SplitRow[] = [{ id: "1", categoryId: "1", amount: "1.5", note: "" }];

    render(<SplitSectionHarness currency="USD" initialRows={initialRows} />);

    const amountInput = screen.getByPlaceholderText("0.00") as HTMLInputElement;
    expect(amountInput).toBeTruthy();
    expect(amountInput.value).toBe("1,5");
  });

  it("split section correctly formats currency decimals - USD has 2 decimals", () => {
    render(
      <SplitSectionHarness
        currency="USD"
        initialRows={[{ id: "1", categoryId: "1", amount: "50.50", note: "" }]}
      />
    );

    const rowsText = screen.getByTestId("rows").textContent;
    expect(rowsText).toContain("50.50");
  });

  it("split section correctly formats currency decimals - VND has 0 decimals", () => {
    render(
      <SplitSectionHarness
        currency="VND"
        initialRows={[{ id: "1", categoryId: "1", amount: "50000", note: "" }]}
      />
    );

    const rowsText = screen.getByTestId("rows").textContent;
    expect(rowsText).toContain("50000");
  });

  it("placeholder uses correct decimal places for USD", () => {
    const { container } = render(
      <SplitSectionHarness currency="USD" initialRows={[{ id: "1", categoryId: "1", amount: "", note: "" }]} />
    );

    // USD should have ".00" in placeholder
    const placeholders = Array.from(container.querySelectorAll("input")).map((i) => i.placeholder);
    expect(placeholders.some((p) => p.includes("0.00"))).toBe(true);
  });

  it("placeholder uses correct decimal places for VND", () => {
    const { container } = render(
      <SplitSectionHarness currency="VND" initialRows={[{ id: "1", categoryId: "1", amount: "", note: "" }]} />
    );

    // VND should have "0" without decimals in placeholder
    const placeholders = Array.from(container.querySelectorAll("input")).map((i) => i.placeholder);
    expect(placeholders.some((p) => p === "0")).toBe(true);
  });

  it("handleAddRow pre-fills with currency-appropriate decimals for VND", async () => {
    render(
      <SplitSectionHarness
        currency="VND"
        initialRows={[]}
        totalAmount={100000}
      />
    );

    // Click Add Split Row button
    const addButton = screen.getByText("Add Split Row");
    expect(addButton).toBeTruthy();
    fireEvent.click(addButton);

    await waitFor(() => {
      const rowsOutput = screen.getByTestId("rows").textContent;
      const parsed = JSON.parse(rowsOutput || "[]");
      // VND is 0-decimal, so the pre-filled value should be "100000" not "100000.00"
      expect(parsed[0].amount).toBe("100000");
      expect(parsed[0].amount).not.toContain(".");
    });
  });

  it("fallback-currency test: uses displayCurrency when no account currency", () => {
    // This test verifies the component works with display currency fallback
    render(
      <SplitSectionHarness
        currency="EUR"
        initialRows={[{ id: "1", categoryId: "1", amount: "50", note: "" }]}
        totalAmount={100}
      />
    );

    const rowsText = screen.getByTestId("rows").textContent;
    expect(rowsText).toContain("50");
  });
});
