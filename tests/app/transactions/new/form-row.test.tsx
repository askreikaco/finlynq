/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import * as React from "react";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";

import { FormRow } from "@/app/(app)/transactions/new/_components/form-row";
import { AmountRow } from "@/app/(app)/transactions/new/_components/amount-row";
import { TypeSegmented, TX_TYPE_ORDER } from "@/app/(app)/transactions/new/_components/type-segmented";
import { ListCard } from "@/app/(app)/transactions/new/_components/list-card";

afterEach(() => cleanup());

function expectClass(el: Element, ...classes: string[]) {
  for (const c of classes) expect(el.classList.contains(c), `class ${c}`).toBe(true);
}

describe("FormRow", () => {
  it("button variant is a full-row button named label + value", () => {
    const onClick = vi.fn();
    render(
      <ListCard>
        <FormRow variant="button" label="Account" value="Cash VND" onClick={onClick} testId="txnew-row-account" />
      </ListCard>,
    );
    const btn = screen.getByRole("button", { name: "Account Cash VND" });
    expect(btn.tagName).toBe("BUTTON");
    expect(btn.getAttribute("type")).toBe("button");
    expect(btn.getAttribute("data-testid")).toBe("txnew-row-account");
    fireEvent.click(btn);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("button variant shows Required in text-neg and aria-invalid when invalid and empty", () => {
    render(
      <ListCard>
        <FormRow variant="button" label="Category" value={undefined} invalid onClick={() => {}} />
      </ListCard>,
    );
    const btn = screen.getByRole("button", { name: "Category Required" });
    // aria-invalid is not a button attribute; the Required value carries the state.
    expect(btn.hasAttribute("aria-invalid")).toBe(false);
    expectClass(within(btn).getByText("Required"), "text-neg");
    expectClass(within(btn).getByText("Category"), "text-neg");
  });

  it("button variant without invalid has no aria-invalid and shows placeholder", () => {
    render(
      <ListCard>
        <FormRow variant="button" label="Category" placeholder="Select Category" onClick={() => {}} />
      </ListCard>,
    );
    const btn = screen.getByRole("button", { name: "Category Select Category" });
    expect(btn.hasAttribute("aria-invalid")).toBe(false);
  });

  it("input variant links the label to an input with enterKeyHint and inputMode", () => {
    const onInputChange = vi.fn();
    render(
      <ListCard>
        <FormRow
          variant="input"
          label="Payee"
          inputValue=""
          onInputChange={onInputChange}
          enterKeyHint="next"
          inputMode="text"
          testId="txnew-row-payee"
        />
      </ListCard>,
    );
    const input = screen.getByLabelText("Payee") as HTMLInputElement;
    expect(input.tagName).toBe("INPUT");
    expect(input.getAttribute("enterkeyhint")).toBe("next");
    expect(input.getAttribute("inputmode")).toBe("text");
    fireEvent.change(input, { target: { value: "Grab" } });
    expect(onInputChange).toHaveBeenCalledWith("Grab");
  });

  it("input variant marks invalid with aria-invalid and text-neg label", () => {
    render(
      <ListCard>
        <FormRow variant="input" label="Note" inputValue="" onInputChange={() => {}} invalid />
      </ListCard>,
    );
    expect(screen.getByLabelText("Note").getAttribute("aria-invalid")).toBe("true");
    expectClass(screen.getByText("Note"), "text-neg");
  });
});

describe("AmountRow", () => {
  const base = {
    value: "",
    onChange: () => {},
    onOpenPad: () => {},
    currency: "VND",
    onOpenCurrency: () => {},
  };

  it("amount input is inputMode none, named Amount, and opens the pad on focus", () => {
    const onOpenPad = vi.fn();
    render(<AmountRow {...base} onOpenPad={onOpenPad} />);
    const input = screen.getByRole("textbox", { name: "Amount" });
    expect(input.getAttribute("inputmode")).toBe("none");
    expectClass(input, "text-2xl", "font-semibold", "tabular-nums");
    fireEvent.focus(input);
    expect(onOpenPad).toHaveBeenCalledTimes(1);
  });

  it("stays typeable from a hardware keyboard (onChange fires)", () => {
    const onChange = vi.fn();
    render(<AmountRow {...base} onChange={onChange} />);
    fireEvent.change(screen.getByRole("textbox", { name: "Amount" }), { target: { value: "12.5" } });
    expect(onChange).toHaveBeenCalledWith("12.5");
  });

  it("shows the Currency trigger only when showCurrency is set, and opens the currency sheet on click", () => {
    const onOpenCurrency = vi.fn();
    const { rerender } = render(<AmountRow {...base} showCurrency onOpenCurrency={onOpenCurrency} />);
    const trigger = screen.getByRole("button", { name: "Currency" });
    expect(trigger.textContent).toContain("VND");
    fireEvent.click(trigger);
    expect(onOpenCurrency).toHaveBeenCalledTimes(1);
    rerender(<AmountRow {...base} showCurrency={false} />);
    expect(screen.queryByRole("button", { name: "Currency" })).toBeNull();
  });

  it("currency trigger sits in the same w-24 label column as FormRow labels, so the amount starts at the value column", () => {
    const { container } = render(
      <>
        <AmountRow {...base} showCurrency />
        <ListCard>
          <FormRow variant="input" label="Note" inputValue="" onInputChange={() => {}} />
        </ListCard>
      </>,
    );
    const cell = container.querySelector('[data-slot="amount-label-cell"]') as HTMLElement;
    expectClass(cell, "w-24", "shrink-0");
    const noteLabel = screen.getByText("Note");
    expectClass(noteLabel, "w-24", "shrink-0");
    // Same row padding and gap as the FormRow row, so the value column x matches.
    expect(cell.parentElement!.classList.contains("gap-3")).toBe(true);
    expect(cell.parentElement!.parentElement!.classList.contains("px-4")).toBe(true);
    expect(noteLabel.parentElement!.classList.contains("gap-3")).toBe(true);
    expect(noteLabel.parentElement!.classList.contains("px-4")).toBe(true);
  });

  it("renders the fxLine slot", () => {
    render(<AmountRow {...base} fxLine={<span>1 USD = 25,000 VND</span>} />);
    expect(screen.getByText("1 USD = 25,000 VND")).toBeTruthy();
  });
});

describe("TypeSegmented", () => {
  it("is a radiogroup named Transaction type with radios in Income, Expense, Transfer order", () => {
    render(<TypeSegmented value="Expense" onChange={() => {}} />);
    const group = screen.getByRole("radiogroup", { name: "Transaction type" });
    const radios = within(group).getAllByRole("radio");
    expect(radios.map((r) => r.textContent)).toEqual(["Income", "Expense", "Transfer"]);
    expect(TX_TYPE_ORDER).toEqual(["Income", "Expense", "Transfer"]);
  });

  it("sets aria-checked on the selected option and applies the selected colours", () => {
    render(<TypeSegmented value="Expense" onChange={() => {}} />);
    expect(screen.getByRole("radio", { name: "Expense" }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByRole("radio", { name: "Income" }).getAttribute("aria-checked")).toBe("false");
    expectClass(screen.getByRole("radio", { name: "Expense" }), "bg-neg/10", "text-neg");
    expectClass(screen.getByRole("radio", { name: "Income" }), "text-muted-foreground");
  });

  it("ArrowRight and ArrowLeft move the selection and wrap around", () => {
    const onChange = vi.fn();
    render(<TypeSegmented value="Expense" onChange={onChange} />);
    fireEvent.keyDown(screen.getByRole("radio", { name: "Expense" }), { key: "ArrowRight" });
    expect(onChange).toHaveBeenLastCalledWith("Transfer");
    fireEvent.keyDown(screen.getByRole("radio", { name: "Expense" }), { key: "ArrowLeft" });
    expect(onChange).toHaveBeenLastCalledWith("Income");
    fireEvent.keyDown(screen.getByRole("radio", { name: "Income" }), { key: "ArrowLeft" });
    expect(onChange).toHaveBeenLastCalledWith("Transfer");
  });

  it("clicking an option calls onChange with it", () => {
    const onChange = vi.fn();
    render(<TypeSegmented value="Expense" onChange={onChange} />);
    fireEvent.click(screen.getByRole("radio", { name: "Transfer" }));
    expect(onChange).toHaveBeenCalledWith("Transfer");
  });
});

describe("ListCard", () => {
  it("applies the list card tokens and renders children", () => {
    render(
      <ListCard data-testid="card">
        <div>row</div>
      </ListCard>,
    );
    const card = screen.getByTestId("card");
    expectClass(card, "rounded-2xl", "border", "border-border", "bg-card", "divide-y", "divide-border", "overflow-hidden");
    expect(card.textContent).toContain("row");
  });
});
