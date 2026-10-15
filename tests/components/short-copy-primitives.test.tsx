/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach } from "vitest";
import * as React from "react";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { Field } from "@/components/ui/field";
import { Card } from "@/components/ui/card";

afterEach(() => cleanup());

describe("Field info", () => {
  it("shows the label and keeps the help in an (i) tip, not as visible text", async () => {
    render(<Field label="Alias" id="a" info="Short nickname used when matching transactions." value="" onChange={() => {}} />);
    expect(screen.getByLabelText("Alias")).toBeTruthy();
    expect(screen.queryByText(/Short nickname/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "About alias" }));
    expect(await screen.findByText("Short nickname used when matching transactions.")).toBeTruthy();
  });

  it("renders no tip without info, and only a short error / warning under the control", () => {
    render(<Field label="Name" id="n" error="Name is required" warning="Used by another account" value="" onChange={() => {}} />);
    expect(screen.queryByRole("button", { name: /About/ })).toBeNull();
    expect(screen.getByText("Name is required")).toBeTruthy();
  });

  it("accepts a custom tip name", () => {
    render(<Field label="Group" info="x" infoLabel="Help for group" value="" onChange={() => {}} />);
    expect(screen.getByRole("button", { name: "Help for group" })).toBeTruthy();
  });

  it("puts the help of a row in a tip next to the label for every control", async () => {
    render(<Field control="stepper" label="Times" stepLabel="times" value="3" onValueChange={() => {}} info="Total payments, including this one" />);
    expect(screen.queryByText(/Total payments/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "About times" }));
    expect(await screen.findByText("Total payments, including this one")).toBeTruthy();
  });
});

describe("Card info", () => {
  it("adds an (i) tip after the title", async () => {
    render(
      <Card title="Breakdown" info="Stacked income and expenses per month" infoLabel="About breakdown" />,
    );
    expect(screen.queryByText(/Stacked income/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "About breakdown" }));
    expect(await screen.findByText("Stacked income and expenses per month")).toBeTruthy();
  });
});
