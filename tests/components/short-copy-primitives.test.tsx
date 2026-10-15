/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach } from "vitest";
import * as React from "react";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { FieldLabel, FormField, FormRow } from "@/components/forms";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";

afterEach(() => cleanup());

describe("FieldLabel / FormField", () => {
  it("shows the label and keeps the help in an (i) tip, not as visible text", async () => {
    render(
      <FormField label="Alias" htmlFor="a" info="Short nickname used when matching transactions.">
        <input id="a" />
      </FormField>,
    );
    expect(screen.getByLabelText("Alias")).toBeTruthy();
    expect(screen.queryByText(/Short nickname/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "About Alias" }));
    expect(await screen.findByText("Short nickname used when matching transactions.")).toBeTruthy();
  });

  it("renders no tip without info, and only a short error / warning under the control", () => {
    render(
      <FormField label="Name" htmlFor="n" error="Name is required" warning="Used by another account">
        <input id="n" />
      </FormField>,
    );
    expect(screen.queryByRole("button", { name: /About/ })).toBeNull();
    expect(screen.getByText("Name is required")).toBeTruthy();
    expect(screen.getByText("Used by another account")).toBeTruthy();
  });

  it("FieldLabel accepts a custom tip name", () => {
    render(<FieldLabel label="Group" info="x" infoLabel="Help for group" />);
    expect(screen.getByRole("button", { name: "Help for group" })).toBeTruthy();
  });
});

describe("FormRow info", () => {
  it("puts the help of an input row in a tip next to the label", async () => {
    render(<FormRow variant="input" label="Times" inputValue="3" onInputChange={() => {}} info="Total payments, including this one" />);
    expect(screen.queryByText(/Total payments/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "About times" }));
    expect(await screen.findByText("Total payments, including this one")).toBeTruthy();
  });
});

describe("CardTitle info", () => {
  it("adds an (i) tip after the title", async () => {
    render(
      <Card>
        <CardHeader>
          <CardTitle info="Stacked income and expenses per month" infoLabel="About breakdown">
            Breakdown
          </CardTitle>
        </CardHeader>
      </Card>,
    );
    expect(screen.queryByText(/Stacked income/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "About breakdown" }));
    expect(await screen.findByText("Stacked income and expenses per month")).toBeTruthy();
  });
});
