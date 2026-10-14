/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SectionCard } from "@/components/mobile";

describe("SectionCard labelPlacement", () => {
  it("inside (default): label is a row inside the card", () => {
    const { container } = render(<SectionCard label="Monthly">x</SectionCard>);
    const label = container.querySelector("[data-slot='section-card-label']");
    expect(label).toBeTruthy();
  });
  it("outside: heading sits above the card box, not inside it", () => {
    const { container } = render(<SectionCard label="Monthly" labelPlacement="outside">x</SectionCard>);
    const heading = screen.getByRole("heading", { name: "Monthly" });
    const body = container.querySelector("[data-slot='section-card-body']")!;
    expect(body.contains(heading)).toBe(false);
    expect(heading.nextElementSibling).toBe(body);
  });
});
