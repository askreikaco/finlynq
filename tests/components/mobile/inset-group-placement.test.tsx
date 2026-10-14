/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { InsetGroup, InsetRow } from "@/components/mobile/inset-group";

describe("InsetGroup headerPlacement", () => {
  it("inside (default): header is inside the card", () => {
    render(
      <InsetGroup header="Tools" data-testid="g">
        <InsetRow label="One" />
      </InsetGroup>,
    );
    expect(screen.getByTestId("g").contains(screen.getByRole("heading", { name: "Tools" }))).toBe(true);
  });

  it("outside: header sits above the card, not inside it", () => {
    render(
      <InsetGroup header="Explore" headerPlacement="outside" data-testid="g">
        <InsetRow label="One" />
      </InsetGroup>,
    );
    const heading = screen.getByRole("heading", { name: "Explore" });
    expect(screen.getByTestId("g").contains(heading)).toBe(false);
    expect(heading.parentElement).toBe(screen.getByTestId("g").parentElement);
  });
});
