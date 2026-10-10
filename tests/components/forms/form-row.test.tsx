/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import * as React from "react";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";

import { FormGroup, FormRow } from "@/components/forms";

afterEach(() => cleanup());

describe("FormRow", () => {
  it("default is w-28 label and min-h-11 row", () => {
    render(
      <FormGroup>
        <FormRow variant="button" label="Account" value="Cash" onClick={() => {}} testId="r" />
      </FormGroup>,
    );
    const row = screen.getByTestId("r");
    expect(row.classList.contains("min-h-11")).toBe(true);
    expect(row.classList.contains("min-h-12")).toBe(false);
    expect(within(row).getByText("Account").classList.contains("w-28")).toBe(true);
  });

  it("labelWidth narrow + height tall gives w-24 and min-h-12", () => {
    render(
      <FormGroup>
        <FormRow variant="button" label="Account" value="Cash" labelWidth="narrow" height="tall" onClick={() => {}} testId="r" />
      </FormGroup>,
    );
    const row = screen.getByTestId("r");
    expect(row.classList.contains("min-h-12")).toBe(true);
    expect(within(row).getByText("Account").classList.contains("w-24")).toBe(true);
  });

  it("button variant is a button named label + value and fires onClick", () => {
    const onClick = vi.fn();
    render(<FormRow variant="button" label="Account" value="Cash VND" onClick={onClick} />);
    const btn = screen.getByRole("button", { name: "Account Cash VND" });
    expect(btn.getAttribute("type")).toBe("button");
    fireEvent.click(btn);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("button variant shows Required in text-neg when invalid and empty", () => {
    render(<FormRow variant="button" label="Category" invalid onClick={() => {}} />);
    const btn = screen.getByRole("button", { name: "Category Required" });
    expect(btn.hasAttribute("aria-invalid")).toBe(false);
    expect(within(btn).getByText("Required").classList.contains("text-neg")).toBe(true);
  });

  it("input variant links label to input, sets inputMode and enterKeyHint", () => {
    const onInputChange = vi.fn();
    render(
      <FormRow variant="input" label="Payee" inputValue="" onInputChange={onInputChange} enterKeyHint="next" inputMode="text" />,
    );
    const input = screen.getByLabelText("Payee") as HTMLInputElement;
    expect(input.getAttribute("enterkeyhint")).toBe("next");
    expect(input.getAttribute("inputmode")).toBe("text");
    fireEvent.change(input, { target: { value: "Grab" } });
    expect(onInputChange).toHaveBeenCalledWith("Grab");
  });

  it("input variant sets aria-invalid when invalid", () => {
    render(<FormRow variant="input" label="Note" inputValue="" onInputChange={() => {}} invalid />);
    expect(screen.getByLabelText("Note").getAttribute("aria-invalid")).toBe("true");
  });

  it("custom variant renders children under a label bound by htmlFor", () => {
    render(
      <FormRow variant="custom" label="Rate" htmlFor="rate-in">
        <input id="rate-in" />
      </FormRow>,
    );
    expect(screen.getByLabelText("Rate").tagName).toBe("INPUT");
  });

  it("error renders under the row in text-destructive; hint is ignored when error is set", () => {
    const { rerender } = render(
      <FormRow variant="input" label="Name" inputValue="" onInputChange={() => {}} error="Too short" hint="Helper" />,
    );
    expect(screen.getByText("Too short").classList.contains("text-destructive")).toBe(true);
    expect(screen.queryByText("Helper")).toBeNull();
    rerender(<FormRow variant="input" label="Name" inputValue="" onInputChange={() => {}} hint="Helper" />);
    expect(screen.getByText("Helper").classList.contains("text-muted-foreground")).toBe(true);
  });
});
