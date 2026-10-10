/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { useState } from "react";

import { SplitSection, type SplitSectionProps } from "@/app/(app)/transactions/new/_components/split-section";
import type { SplitRowModel } from "@/lib/transactions/split-math";

interface HarnessProps {
  initialCount?: string;
  initialRows?: SplitRowModel[];
  parentAmount?: number;
  currency?: string;
  parentCategoryId?: string;
  showEmptyErrors?: boolean;
  onOpenCategory?: SplitSectionProps["onOpenCategory"];
  onOpenPad?: SplitSectionProps["onOpenPad"];
}

/** Parent-like harness: owns count, rows and the numpad target, as the page does. */
function Harness({
  initialCount = "",
  initialRows = [],
  parentAmount = 100,
  currency = "USD",
  parentCategoryId = "1",
  showEmptyErrors = true,
  onOpenCategory = () => {},
  onOpenPad = () => {},
}: HarnessProps) {
  const [count, setCount] = useState(initialCount);
  const [rows, setRows] = useState<SplitRowModel[]>(initialRows);
  const [pad, setPad] = useState<string | null>(null);
  return (
    <>
      <SplitSection
        count={count}
        onCountChange={setCount}
        rows={rows}
        onRowsChange={setRows}
        parentAmount={parentAmount}
        currency={currency}
        parentCategoryId={parentCategoryId}
        onOpenCategory={onOpenCategory}
        padTargetRowId={pad}
        onOpenPad={(id) => {
          setPad(id);
          onOpenPad(id);
        }}
        onClosePad={() => setPad(null)}
        showEmptyErrors={showEmptyErrors}
      />
      <output data-testid="state-count">{count}</output>
      <output data-testid="state-rows">{JSON.stringify(rows)}</output>
      <output data-testid="state-pad">{pad ?? ""}</output>
    </>
  );
}

const countInput = () => screen.getByTestId("split-count") as HTMLInputElement;
const amountInput = (n: number) => screen.getByTestId(`split-amount-${n}`) as HTMLInputElement;
const typeCount = (value: string) => fireEvent.change(countInput(), { target: { value } });
const typeAmount = (n: number, value: string) => fireEvent.change(amountInput(n), { target: { value } });
const stateRows = (): SplitRowModel[] =>
  JSON.parse(screen.getByTestId("state-rows").textContent ?? "[]") as SplitRowModel[];

afterEach(() => {
  cleanup();
});

describe("SplitSection count field", () => {
  it("shows the Splits count field instead of a switch, with no Add Split Row button", () => {
    render(<Harness />);
    expect(countInput().getAttribute("inputmode")).toBe("numeric");
    expect(screen.getByText("Splits")).toBeTruthy();
    expect(screen.queryByRole("switch")).toBeNull();
    expect(screen.queryByText("Add Split Row")).toBeNull();
    expect(screen.queryByText("Split this transaction")).toBeNull();
  });

  it("creates N rows from the count; the last row is the read-only remainder", () => {
    render(<Harness />);
    typeCount("3");
    expect(screen.getByTestId("state-count").textContent).toBe("3");
    expect(stateRows()).toHaveLength(3);
    expect(screen.getByTestId("split-row-3").textContent).toContain("#3");
    expect(screen.getByTestId("split-row-3").textContent).not.toContain("Remaining");
    expect(amountInput(3).readOnly).toBe(true);
    expect(amountInput(1).readOnly).toBe(false);
  });

  it("shows the hint for 1 and does not create rows", () => {
    render(<Harness />);
    typeCount("1");
    expect(screen.getByText("Enter 2 or more to split")).toBeTruthy();
    expect(screen.queryByTestId("split-row-1")).toBeNull();
  });

  it("strips non-digits from the typed count", () => {
    render(<Harness />);
    typeCount("2a");
    expect(countInput().value).toBe("2");
  });

  it("shows the cap hint and clamps to 20 rows", () => {
    render(<Harness />);
    typeCount("25");
    expect(screen.getByText("Up to 20 splits")).toBeTruthy();
    expect(stateRows()).toHaveLength(20);
  });

  it("hides rows beyond N on shrink; growing clears the former remainder and restores the hidden tail", () => {
    render(<Harness initialCount="4" />);
    typeAmount(2, "30");
    typeAmount(3, "10");
    typeCount("2");
    expect(screen.queryByTestId("split-row-3")).toBeNull();
    typeCount("3");
    expect(amountInput(2).value).toBe("");
    expect(screen.getByTestId("split-row-3").textContent).toContain("#3");
    expect(stateRows()[2].amount).toBe("10");
  });
});

describe("SplitSection remainder and status", () => {
  it("computes the last row live from the other rows", () => {
    render(<Harness initialCount="2" parentAmount={100} />);
    typeAmount(1, "30");
    expect(amountInput(2).value).toBe("70.00");
    typeAmount(1, "45.5");
    expect(amountInput(2).value).toBe("54.50");
    // Entry variant: no "Allocated x of y" status line, only error lines.
    expect(screen.queryByTestId("txnew-split-status")).toBeNull();
    expect(screen.queryByText(/Allocated/)).toBeNull();
  });

  it("uses 0 decimals for VND", () => {
    render(<Harness initialCount="2" parentAmount={100000} currency="VND" />);
    typeAmount(1, "30000");
    expect(amountInput(2).value).toBe("70000");
    expect(amountInput(1).placeholder).toBe("0");
  });

  it("shows the over-total error in the status line and tints the remainder", () => {
    render(<Harness initialCount="2" parentAmount={100} />);
    typeAmount(1, "120");
    expect(screen.getByTestId("split-status-error").textContent).toContain("Splits exceed the total by");
    expect(amountInput(2).value).toBe("-20.00");
  });
});

describe("SplitSection amounts and numpad", () => {
  it("focusing an editable amount reports its row id to the parent", () => {
    const seen: string[] = [];
    render(
      <Harness
        initialCount="2"
        initialRows={[
          { id: "r0", categoryId: "", amount: "", note: "" },
          { id: "r1", categoryId: "", amount: "", note: "" },
        ]}
        onOpenPad={(id) => seen.push(id)}
      />,
    );
    fireEvent.focus(amountInput(1));
    expect(seen).toEqual(["r0"]);
    expect(screen.getByTestId("state-pad").textContent).toBe("r0");
  });

  it("the remainder never opens the numpad", () => {
    render(<Harness initialCount="2" />);
    fireEvent.focus(amountInput(2));
    expect(screen.getByTestId("state-pad").textContent).toBe("");
  });

  it("amount inputs never open the OS keyboard", () => {
    render(<Harness initialCount="2" />);
    expect(amountInput(1).getAttribute("inputmode")).toBe("none");
  });
});

describe("SplitSection validation messages", () => {
  it("hides the empty-amount message until showEmptyErrors is set", () => {
    const { rerender } = render(<Harness initialCount="2" showEmptyErrors={false} />);
    expect(screen.queryByTestId("split-error-1")).toBeNull();
    rerender(<Harness initialCount="2" showEmptyErrors />);
    expect(screen.getByTestId("split-error-1").textContent).toBe("Enter an amount");
  });

  it("shows an amount error for zero or negative values", () => {
    render(<Harness initialCount="2" />);
    typeAmount(1, "0");
    expect(screen.getByTestId("split-error-1").textContent).toBe("Amount must be more than 0");
  });
});

describe("SplitSection entry variant chrome", () => {
  it("has no category chip, account chip, currency chip, payee context line or allocated line", () => {
    const { container } = render(<Harness initialCount="2" />);
    expect(screen.queryByTestId("split-category-1")).toBeNull();
    expect(screen.queryByTestId("split-category-2")).toBeNull();
    expect(screen.queryByTestId("txnew-split-context")).toBeNull();
    expect(screen.queryByText(/Payee/)).toBeNull();
    expect(screen.queryByText(/Total/)).toBeNull();
    expect(container.querySelector('[data-slot="split-currency"]')).toBeNull();
    expect(screen.queryByText("USD")).toBeNull();
  });

  it("labels each split '#n' with a note field and no per-row header", () => {
    render(<Harness initialCount="2" />);
    expect(screen.getByText("#1")).toBeTruthy();
    expect(screen.getByText("#2")).toBeTruthy();
    expect(screen.queryByText("Split 1")).toBeNull();
    expect(screen.getAllByPlaceholderText("Note (optional)")).toHaveLength(2);
  });

  it("shows the Splits stepper with 44px buttons", () => {
    render(<Harness />);
    expect(screen.getByRole("button", { name: "Decrease splits" }).className).toContain("size-11");
    expect(screen.getByRole("button", { name: "Increase splits" }).className).toContain("size-11");
  });

  it("the stepper's + and - change the count; typing still works", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Increase splits" }));
    expect(countInput().value).toBe("2");
    fireEvent.click(screen.getByRole("button", { name: "Increase splits" }));
    expect(countInput().value).toBe("3");
    fireEvent.click(screen.getByRole("button", { name: "Decrease splits" }));
    expect(countInput().value).toBe("2");
    fireEvent.click(screen.getByRole("button", { name: "Decrease splits" }));
    expect(countInput().value).toBe("");
    typeCount("5");
    expect(countInput().value).toBe("5");
    expect(screen.getByTestId("split-row-5")).toBeTruthy();
  });

  it("reports 'Choose a category first' as one status error and blocks the rows' category errors", () => {
    render(<Harness initialCount="2" parentCategoryId="" />);
    expect(screen.getByTestId("split-status-error").textContent).toBe("Choose a category first");
    expect(screen.queryByText("Choose category")).toBeNull();
    expect(screen.queryByText(/Choose a category for split/)).toBeNull();
  });

  it("inherits the parent category: no error when a category is set", () => {
    render(<Harness initialCount="2" parentCategoryId="2" />);
    typeAmount(1, "30");
    expect(screen.queryByTestId("split-status-error")).toBeNull();
  });
});
