/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { useState } from "react";

import {
  SplitRows,
  validateSplits,
  type SplitRowModel,
} from "@/components/transactions/split-rows";
import { formatCurrency } from "@/lib/currency";

afterEach(() => {
  cleanup();
});

const categories = [
  { id: 1, name: "Food" },
  { id: 2, name: "Transport" },
];

interface HarnessProps {
  initialCount?: string;
  initialRows?: SplitRowModel[];
  parentAmount?: number;
  currency?: string;
  parentCategoryId?: string;
  onOpenPad?: (rowId: string) => void;
  onClosePad?: () => void;
  onOpenCategory?: (rowId: string) => void;
  onRowBlur?: (rowId: string) => void;
}

/** Controlled host: state lives here, SplitRows only renders and reports changes. */
function Harness({
  initialCount = "",
  initialRows = [],
  parentAmount = 100,
  currency = "USD",
  parentCategoryId = "1",
  onOpenPad = () => {},
  onClosePad = () => {},
  onOpenCategory = () => {},
  onRowBlur,
}: HarnessProps) {
  const [count, setCount] = useState(initialCount);
  const [rows, setRows] = useState<SplitRowModel[]>(initialRows);
  const [pad, setPad] = useState<string | null>(null);
  return (
    <>
      <SplitRows
        count={count}
        onCountChange={setCount}
        rows={rows}
        onRowsChange={setRows}
        parentAmount={parentAmount}
        currency={currency}
        parentCategoryId={parentCategoryId}
        parentPayee="Coffee shop"
        categories={categories}
        onOpenCategory={onOpenCategory}
        padTargetRowId={pad}
        onOpenPad={(id) => {
          setPad(id);
          onOpenPad(id);
        }}
        onClosePad={() => {
          setPad(null);
          onClosePad();
        }}
        onRowBlur={onRowBlur}
        idPrefix="t"
      />
      <output data-testid="state-rows">{JSON.stringify(rows)}</output>
    </>
  );
}

const countInput = () => screen.getByTestId("split-count") as HTMLInputElement;
const amountInput = (n: number) => screen.getByTestId(`split-amount-${n}`) as HTMLInputElement;
const typeCount = (value: string) => fireEvent.change(countInput(), { target: { value } });
const typeAmount = (n: number, value: string) =>
  fireEvent.change(amountInput(n), { target: { value } });
const stateRows = (): SplitRowModel[] =>
  JSON.parse(screen.getByTestId("state-rows").textContent ?? "[]") as SplitRowModel[];
const row = (id: string, amount = "", categoryId = ""): SplitRowModel => ({
  id,
  categoryId,
  amount,
  note: "",
});

describe("SplitRows wording", () => {
  it("shows the Splits count field with a numeric keyboard and the Split icon row", () => {
    render(<Harness />);
    const input = countInput();
    expect(input.getAttribute("inputmode")).toBe("numeric");
    expect(input.getAttribute("pattern")).toBe("[0-9]*");
    expect(screen.getByLabelText("Number of splits")).toBeTruthy();
    expect(screen.getByText("Splits")).toBeTruthy();
  });

  it("uses the uniform split card and status strings, and none of the old strings", () => {
    render(<Harness initialCount="2" />);
    expect(screen.getByText("Split 1")).toBeTruthy();
    expect(screen.getByText("Split 2 · Remaining")).toBeTruthy();
    expect(screen.getAllByPlaceholderText("Note (optional)")).toHaveLength(2);
    expect(screen.getByText(`Payee Coffee shop · Total ${formatCurrency(100, "USD")}`)).toBeTruthy();
    expect(
      screen.getByText(`Allocated ${formatCurrency(0, "USD")} of ${formatCurrency(100, "USD")}`),
    ).toBeTruthy();
    expect(screen.queryByText(/Add Split Row|Pick category|Split note|Split #|Balanced/)).toBeNull();
  });

  it("shows the hint for 1 and the cap hint for more than 20", () => {
    const { unmount } = render(<Harness />);
    typeCount("1");
    expect(screen.getByText("Enter 2 or more to split")).toBeTruthy();
    expect(screen.queryByTestId("split-row-1")).toBeNull();
    unmount();

    render(<Harness />);
    typeCount("25");
    expect(screen.getByText("Up to 20 splits")).toBeTruthy();
    expect(screen.getByTestId("split-row-20")).toBeTruthy();
    expect(screen.queryByTestId("split-row-21")).toBeNull();
  });
});

describe("SplitRows count, growth, shrink, restore", () => {
  it("strips non-digits and caps the typed text at 2 characters", () => {
    render(<Harness />);
    typeCount("a3b");
    expect(countInput().value).toBe("3");
    expect(screen.getByTestId("split-row-3")).toBeTruthy();
  });

  it("grows to N rows, the last one being the read-only remainder", () => {
    render(<Harness />);
    typeCount("3");
    expect(screen.getByTestId("split-row-1")).toBeTruthy();
    expect(screen.getByTestId("split-row-3")).toBeTruthy();
    expect(screen.getByText("Split 3 · Remaining")).toBeTruthy();
    expect(amountInput(3).readOnly).toBe(true);
    expect(amountInput(2).readOnly).toBe(false);
    expect(stateRows()).toHaveLength(3);
  });

  it("hides rows beyond N on shrink but keeps their data for restore", () => {
    render(<Harness />);
    typeCount("4");
    typeAmount(1, "10");
    typeAmount(2, "20");
    typeAmount(3, "30");
    typeCount("2");
    expect(screen.queryByTestId("split-row-3")).toBeNull();
    expect(stateRows()).toHaveLength(4);
    expect(stateRows()[2].amount).toBe("30");
  });

  it("restores hidden rows with their data when N grows again; the former remainder row is cleared", () => {
    render(<Harness />);
    typeCount("4");
    typeAmount(1, "10");
    typeAmount(2, "20");
    typeAmount(3, "30");
    typeCount("2");
    typeCount("3");
    expect(amountInput(2).value).toBe("");
    expect(amountInput(2).readOnly).toBe(false);
    // Split 3 is the remainder again, so its typed 30 is kept in state but shown computed.
    expect(amountInput(3).readOnly).toBe(true);
    expect(stateRows()[2].amount).toBe("30");
  });

  it("restores a hidden editable row with its typed value when N grows back past it", () => {
    render(<Harness />);
    typeCount("4");
    typeAmount(1, "10");
    typeAmount(2, "20");
    typeAmount(3, "30");
    typeCount("2");
    typeCount("4");
    expect(amountInput(2).value).toBe("");
    expect(amountInput(2).readOnly).toBe(false);
    expect(amountInput(3).value).toBe("30");
    expect(amountInput(3).readOnly).toBe(false);
    expect(amountInput(4).readOnly).toBe(true);
    // 100 - 10 (split 1) - 0 (split 2, cleared) - 30 (split 3) = 60
    expect(amountInput(4).value).toBe("60.00");
  });
});

describe("SplitRows remainder", () => {
  it("is read-only, shows the computed value and updates live", () => {
    render(<Harness initialCount="2" />);
    expect(amountInput(2).readOnly).toBe(true);
    expect(amountInput(2).getAttribute("aria-readonly")).toBe("true");
    expect(amountInput(2).value).toBe("100.00");
    typeAmount(1, "30");
    expect(amountInput(2).value).toBe("70.00");
    expect(screen.getByText("auto")).toBeTruthy();
  });

  it("never opens the numpad for the remainder", () => {
    const onOpenPad = vi.fn();
    render(<Harness initialCount="2" onOpenPad={onOpenPad} />);
    fireEvent.focus(amountInput(2));
    expect(onOpenPad).not.toHaveBeenCalled();
  });
});

describe("SplitRows errors", () => {
  it("errors when the remainder is 0", () => {
    render(<Harness initialCount="2" />);
    typeAmount(1, "100");
    expect(screen.getByTestId("split-status-error").textContent).toBe(
      "Last split is 0 — lower the other splits or use fewer splits",
    );
    expect(amountInput(2).getAttribute("aria-invalid")).toBe("true");
  });

  it("errors when the other splits exceed the total", () => {
    render(<Harness initialCount="2" />);
    typeAmount(1, "120");
    expect(screen.getByTestId("split-status-error").textContent).toBe(
      `Splits exceed the total by ${formatCurrency(20, "USD")}`,
    );
  });

  it("flags zero and negative amounts on the row", () => {
    const { unmount } = render(<Harness initialCount="2" />);
    typeAmount(1, "0");
    expect(screen.getByTestId("split-error-1").textContent).toBe("Amount must be more than 0");
    unmount();

    render(<Harness initialCount="2" />);
    typeAmount(1, "-5");
    expect(screen.getByTestId("split-error-1").textContent).toBe("Amount must be more than 0");
  });

  it("flags an empty editable amount", () => {
    render(<Harness initialCount="2" />);
    expect(screen.getByTestId("split-error-1").textContent).toBe("Enter an amount");
  });

  it("hides the empty-amount message when showEmptyErrors is false (other errors still show)", () => {
    const { unmount } = render(
      <SplitRows
        count="2"
        onCountChange={() => {}}
        rows={[row("a"), row("b")]}
        onRowsChange={() => {}}
        parentAmount={100}
        currency="USD"
        parentCategoryId="1"
        categories={categories}
        onOpenCategory={() => {}}
        padTargetRowId={null}
        onOpenPad={() => {}}
        onClosePad={() => {}}
        idPrefix="t"
        showEmptyErrors={false}
      />,
    );
    expect(screen.queryByTestId("split-error-1")).toBeNull();
    unmount();
  });

  it("shows the first hidden save error in the status line when its row hides it", () => {
    render(
      <SplitRows
        count="3"
        onCountChange={() => {}}
        rows={[row("a"), row("b", "10"), row("c")]}
        onRowsChange={() => {}}
        parentAmount={100}
        currency="USD"
        parentCategoryId="1"
        categories={categories}
        onOpenCategory={() => {}}
        padTargetRowId={null}
        onOpenPad={() => {}}
        onClosePad={() => {}}
        idPrefix="t"
        showEmptyErrors={() => false}
      />,
    );
    expect(screen.queryByTestId("split-error-1")).toBeNull();
    expect(screen.getByTestId("split-status-error").textContent).toBe("Enter an amount for split 1");
  });

  it("reveals the empty-amount message per row when showEmptyErrors is a function", () => {
    render(
      <SplitRows
        count="3"
        onCountChange={() => {}}
        rows={[row("a"), row("b"), row("c")]}
        onRowsChange={() => {}}
        parentAmount={100}
        currency="USD"
        parentCategoryId="1"
        categories={categories}
        onOpenCategory={() => {}}
        padTargetRowId={null}
        onOpenPad={() => {}}
        onClosePad={() => {}}
        idPrefix="t"
        showEmptyErrors={(rowId) => rowId === "b"}
      />,
    );
    expect(screen.queryByTestId("split-error-1")).toBeNull();
    expect(screen.getByTestId("split-error-2").textContent).toBe("Enter an amount");
    expect(screen.getByTestId("split-status-error").textContent).toBe("Enter an amount for split 1");
  });

  it("reports a blur on an editable amount with its row id", () => {
    const onRowBlur = vi.fn();
    render(<Harness initialCount="3" onRowBlur={onRowBlur} />);
    fireEvent.blur(amountInput(2));
    expect(onRowBlur).toHaveBeenCalledWith("t-row-1");
    fireEvent.blur(amountInput(3));
    expect(onRowBlur).toHaveBeenCalledTimes(1);
  });

  it("shows no error for a valid split", () => {
    render(<Harness initialCount="2" />);
    typeAmount(1, "30");
    expect(screen.queryByTestId("split-error-1")).toBeNull();
    expect(screen.queryByTestId("split-status-error")).toBeNull();
  });
});

describe("SplitRows category chip", () => {
  it("labels inherited categories 'same as above'", () => {
    render(<Harness initialCount="2" parentCategoryId="1" />);
    expect(screen.getByTestId("split-category-1").textContent).toBe("Food · same as above");
    expect(screen.getByTestId("split-category-2").textContent).toBe("Food · same as above");
  });

  it("an explicit pick breaks inheritance for that row and the rows below follow it", () => {
    render(
      <Harness
        initialCount="2"
        parentCategoryId="1"
        initialRows={[row("a", "", "2"), row("b")]}
      />,
    );
    expect(screen.getByTestId("split-category-1").textContent).toBe("Transport");
    expect(screen.getByTestId("split-category-2").textContent).toBe("Transport · same as above");
  });

  it("warns 'Choose category' when nothing resolves", () => {
    render(<Harness initialCount="2" parentCategoryId="" />);
    const chip = screen.getByTestId("split-category-1");
    expect(chip.textContent).toBe("Choose category");
    expect(chip.className.includes("text-warning")).toBe(true);
  });

  it("calls onOpenCategory with the row id when tapped", () => {
    const onOpenCategory = vi.fn();
    render(<Harness initialCount="2" onOpenCategory={onOpenCategory} />);
    fireEvent.click(screen.getByTestId("split-category-1"));
    expect(onOpenCategory).toHaveBeenCalledWith("t-row-0");
  });
});

describe("SplitRows negative parent total", () => {
  it("shows the magnitude in the total and allocation text, with a positive remainder and no error", () => {
    render(<Harness initialCount="2" parentAmount={-100} />);
    expect(screen.getByText(`Payee Coffee shop · Total ${formatCurrency(100, "USD")}`)).toBeTruthy();
    expect(
      screen.getByText(`Allocated ${formatCurrency(0, "USD")} of ${formatCurrency(100, "USD")}`),
    ).toBeTruthy();
    expect(amountInput(2).value).toBe("100.00");
    expect(amountInput(2).getAttribute("aria-invalid")).toBeNull();
    typeAmount(1, "30");
    expect(amountInput(2).value).toBe("70.00");
    expect(screen.queryByTestId("split-status-error")).toBeNull();
  });
});

describe("SplitRows numpad hooks", () => {
  it("calls onOpenPad with the row id on an editable amount focus", () => {
    const onOpenPad = vi.fn();
    render(<Harness initialCount="3" onOpenPad={onOpenPad} />);
    fireEvent.focus(amountInput(1));
    expect(onOpenPad).toHaveBeenLastCalledWith("t-row-0");
    fireEvent.focus(amountInput(2));
    expect(onOpenPad).toHaveBeenLastCalledWith("t-row-1");
  });

  it("closes the numpad when a note or the count gets focus", () => {
    const onClosePad = vi.fn();
    render(<Harness initialCount="2" onClosePad={onClosePad} />);
    fireEvent.focus(screen.getByTestId("split-note-1"));
    expect(onClosePad).toHaveBeenCalledTimes(1);
    fireEvent.focus(countInput());
    expect(onClosePad).toHaveBeenCalledTimes(2);
  });
});

describe("SplitRows buttons", () => {
  it("has no Add or Delete row buttons", () => {
    render(<Harness initialCount="3" />);
    const names = screen.getAllByRole("button").map((b) => b.textContent ?? "");
    expect(names.some((name) => /add|delete|remove|trash/i.test(name))).toBe(false);
    expect(screen.queryByRole("button", { name: /remove split/i })).toBeNull();
  });
});

describe("validateSplits", () => {
  const base = { currency: "USD", parentCategoryId: "1" };

  it("uses the magnitude of a negative (expense) parent total", () => {
    const result = validateSplits({
      ...base,
      count: "2",
      rows: [row("a", "30"), row("b")],
      parentAmount: -100,
    });
    expect(result.canSave).toBe(true);
    expect(result.firstError).toBeUndefined();
    expect(result.remainder?.flag).toBe("ok");
    expect(result.remainder?.amount).toBe(70);
    expect(result.amounts).toEqual([30, 70]);
  });

  it("still blocks a zero parent total with a negative sign", () => {
    const result = validateSplits({
      ...base,
      count: "2",
      rows: [row("a", "")],
      parentAmount: -0,
    });
    expect(result.canSave).toBe(false);
    expect(result.formError).toBeUndefined();
  });

  it("is not saveable without a split (N 0 or 1)", () => {
    for (const count of ["", "1"]) {
      const result = validateSplits({ ...base, count, rows: [], parentAmount: 100 });
      expect(result.canSave).toBe(false);
      expect(result.n).toBe(0);
    }
  });

  it("passes a valid split and returns the amounts with the remainder last", () => {
    const result = validateSplits({
      ...base,
      count: "2",
      rows: [row("a", "30"), row("b")],
      parentAmount: 100,
    });
    expect(result.canSave).toBe(true);
    expect(result.amounts).toEqual([30, 70]);
    expect(result.firstError).toBeUndefined();
  });

  it("reports an empty amount with the save message and row id", () => {
    const result = validateSplits({
      ...base,
      count: "2",
      rows: [row("a", ""), row("b")],
      parentAmount: 100,
    });
    expect(result.canSave).toBe(false);
    expect(result.rowErrors).toEqual({ a: "Enter an amount" });
    expect(result.firstError).toBe("Enter an amount for split 1");
    expect(result.firstErrorRowId).toBe("a");
  });

  it("rejects zero and negative amounts", () => {
    for (const amount of ["0", "-5"]) {
      const result = validateSplits({
        ...base,
        count: "2",
        rows: [row("a", amount), row("b")],
        parentAmount: 100,
      });
      expect(result.canSave).toBe(false);
      expect(result.rowErrors.a).toBe("Amount must be more than 0");
    }
  });

  it("rejects splits that exceed the total", () => {
    const result = validateSplits({
      ...base,
      count: "2",
      rows: [row("a", "120"), row("b")],
      parentAmount: 100,
    });
    expect(result.canSave).toBe(false);
    expect(result.formError).toBe(`Splits exceed the total by ${formatCurrency(20, "USD")}`);
  });

  it("rejects a zero remainder", () => {
    const result = validateSplits({
      ...base,
      count: "2",
      rows: [row("a", "100"), row("b")],
      parentAmount: 100,
    });
    expect(result.canSave).toBe(false);
    expect(result.formError).toBe("Last split is 0 — lower the other splits or use fewer splits");
  });

  it("blocks save without a split error when the parent amount is 0", () => {
    const result = validateSplits({
      ...base,
      count: "2",
      rows: [row("a", "")],
      parentAmount: 0,
    });
    expect(result.canSave).toBe(false);
    expect(result.formError).toBeUndefined();
  });

  it("requires a resolvable category for every visible row", () => {
    const result = validateSplits({
      ...base,
      parentCategoryId: "",
      count: "2",
      rows: [row("a", "30"), row("b")],
      parentAmount: 100,
    });
    expect(result.canSave).toBe(false);
    expect(result.firstError).toBe("Choose a category for split 1");
  });

  it("accepts inherited categories", () => {
    const result = validateSplits({
      ...base,
      count: "2",
      rows: [row("a", "30"), row("b")],
      parentAmount: 100,
    });
    expect(result.resolved.map((r) => r.id)).toEqual(["1", "1"]);
    expect(result.canSave).toBe(true);
  });

  it("never validates hidden rows beyond N", () => {
    const result = validateSplits({
      ...base,
      count: "2",
      rows: [row("a", "30"), row("b"), row("c", "")],
      parentAmount: 100,
    });
    expect(result.canSave).toBe(true);
    expect(result.rowErrors.c).toBeUndefined();
  });

  it("rounds to the currency's minor units (VND has none)", () => {
    const result = validateSplits({
      currency: "VND",
      parentCategoryId: "1",
      count: "3",
      rows: [row("a", "333.33"), row("b", "333"), row("c")],
      parentAmount: 1000,
    });
    expect(result.canSave).toBe(true);
    expect(result.amounts).toEqual([333, 333, 334]);
  });

  it("does not drift with float inputs (0.1 + 0.1 + remainder)", () => {
    const result = validateSplits({
      currency: "USD",
      parentCategoryId: "1",
      count: "3",
      rows: [row("a", "0.1"), row("b", "0.1"), row("c")],
      parentAmount: 0.3,
    });
    expect(result.canSave).toBe(true);
    expect(result.amounts).toEqual([0.1, 0.1, 0.1]);
  });
});
