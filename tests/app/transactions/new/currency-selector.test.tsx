/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import * as React from "react";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { CurrencySelector, currencyName } from "@/app/(app)/transactions/new/_components/currency-selector";

afterEach(() => cleanup());

const currencies = ["EUR", "USD", "VND"];

function sheetContent(): HTMLElement {
  const el = document.querySelector('[data-slot="sheet-content"]');
  expect(el).not.toBeNull();
  return el as HTMLElement;
}

function rowNames(): string[] {
  return within(sheetContent())
    .getAllByRole("button")
    .filter((b) => !b.hasAttribute("data-slot") && b.textContent)
    .map((b) => b.textContent ?? "");
}

describe("CurrencySelector", () => {
  it("renders the sheet titled Select Currency with every currency as a row", () => {
    render(
      <CurrencySelector open onOpenChange={() => {}} currencies={currencies} onSelect={() => {}} selected="USD" />,
    );
    expect(sheetContent().getAttribute("data-side")).toBe("bottom");
    expect(screen.getByRole("heading", { name: "Select Currency" })).toBeTruthy();
    expect(rowNames()).toEqual([
      expect.stringMatching(/^EUR/),
      expect.stringMatching(/^USD/),
      expect.stringMatching(/^VND/),
    ]);
  });

  it("marks the selected code and shows the currency name as detail", () => {
    render(
      <CurrencySelector open onOpenChange={() => {}} currencies={currencies} onSelect={() => {}} selected="USD" />,
    );
    const usd = screen.getByRole("button", { name: /^USD/ });
    expect(usd.getAttribute("aria-current")).toBe("true");
    expect(screen.getByRole("button", { name: /^EUR/ }).getAttribute("aria-current")).toBeNull();
    expect(usd.textContent).toContain(currencyName("USD") ?? "USD");
  });

  it("search filters by code and by currency name", () => {
    render(
      <CurrencySelector open onOpenChange={() => {}} currencies={currencies} onSelect={() => {}} />,
    );
    const search = screen.getByRole("textbox", { name: "Search currency..." });
    fireEvent.change(search, { target: { value: "vnd" } });
    expect(rowNames()).toEqual([expect.stringMatching(/^VND/)]);
    fireEvent.change(search, { target: { value: "euro" } });
    expect(rowNames()).toEqual([expect.stringMatching(/^EUR/)]);
    fireEvent.change(search, { target: { value: "zzz" } });
    expect(screen.getByText("No currencies found")).toBeTruthy();
  });

  it("selecting a row calls onSelect with the code and closes the sheet", () => {
    const onSelect = vi.fn();
    const onOpenChange = vi.fn();
    render(
      <CurrencySelector open onOpenChange={onOpenChange} currencies={currencies} onSelect={onSelect} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /^EUR/ }));
    expect(onSelect).toHaveBeenCalledWith("EUR");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("renders nothing when closed", () => {
    render(
      <CurrencySelector open={false} onOpenChange={() => {}} currencies={currencies} onSelect={() => {}} />,
    );
    expect(document.querySelector('[data-slot="sheet-content"]')).toBeNull();
  });
});
