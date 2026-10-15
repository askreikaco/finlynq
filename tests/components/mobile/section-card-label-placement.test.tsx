/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { SectionCard } from "@/components/mobile";

const body = (c: HTMLElement) => c.querySelector("[data-slot='section-card-body']")!;

describe("SectionCard label placement", () => {
  it("inside (default): label is a row inside the card", () => {
    const { container } = render(<SectionCard label="Monthly">x</SectionCard>);
    expect(container.querySelector("[data-slot='section-card-label']")).toBeTruthy();
  });

  it("outside: heading sits above the card box, not inside it", () => {
    const { container } = render(<SectionCard label="Monthly" labelPlacement="outside">x</SectionCard>);
    const heading = screen.getByRole("heading", { name: "Monthly" });
    expect(body(container).contains(heading)).toBe(false);
    expect(heading.nextElementSibling).toBe(body(container));
    expect(heading.className).toContain("px-4");
  });

  it("outside + bare: no card surface around the body", () => {
    const { container } = render(<SectionCard label="Assets" labelPlacement="outside" bare>x</SectionCard>);
    expect(body(container).className).not.toContain("surface-card");
  });
});

describe("SectionCard description", () => {
  it("follows the label: inside label puts it in the card, under the label", () => {
    const { container } = render(<SectionCard label="Plan" description="Billed monthly">x</SectionCard>);
    const card = container.querySelector("[data-slot=section-card]")!;
    const d = screen.getByText("Billed monthly");
    expect(card.contains(d)).toBe(true);
    expect(screen.getByRole("heading", { name: "Plan" }).closest("[data-slot=card-label]")!.nextElementSibling).toBe(d);
  });

  it("follows the label: outside label puts it between the heading and the card box", () => {
    const { container } = render(<SectionCard label="Plan" labelPlacement="outside" description="Billed monthly">x</SectionCard>);
    const d = screen.getByText("Billed monthly");
    expect(body(container).contains(d)).toBe(false);
    expect(screen.getByRole("heading", { name: "Plan" }).nextElementSibling).toBe(d);
    expect(d.nextElementSibling).toBe(body(container));
  });

  it("explicit descriptionPlacement=inside moves it into the card body under an outside label", () => {
    const { container } = render(
      <SectionCard label="Plan" labelPlacement="outside" description="Billed monthly" descriptionPlacement="inside">x</SectionCard>,
    );
    expect(body(container).contains(screen.getByText("Billed monthly"))).toBe(true);
    expect(screen.getByRole("heading", { name: "Plan" }).nextElementSibling).toBe(body(container));
  });

  it("explicit descriptionPlacement=outside puts it above an inside-label card", () => {
    const { container } = render(
      <SectionCard label="Plan" description="Billed monthly" descriptionPlacement="outside" data-testid="c">x</SectionCard>,
    );
    const d = screen.getByText("Billed monthly");
    const surface = container.querySelector("[data-slot=section-card-surface]")!;
    expect(surface.contains(d)).toBe(false);
    expect(surface.className).toContain("surface-card");
    expect(d.nextElementSibling).toBe(surface);
    expect(screen.getByTestId("c").contains(surface)).toBe(true);
  });
});

describe("SectionCard info tooltip", () => {
  it.each(["inside", "outside"] as const)("%s label gets an (i) InfoTip next to it", (placement) => {
    render(<SectionCard label="Budget" labelPlacement={placement} info="Resets on the 1st">x</SectionCard>);
    const heading = screen.getByRole("heading", { level: 2 });
    const tip = within(heading).getByRole("button", { name: "About Budget" });
    expect(tip.getAttribute("data-slot")).toBe("info-tip");
  });

  it("infoLabel names the button", () => {
    render(<SectionCard label="Budget" info="x" infoLabel="About the budget">y</SectionCard>);
    expect(screen.getByRole("button", { name: "About the budget" })).toBeTruthy();
  });

  it("no info prop renders no tip", () => {
    render(<SectionCard label="Budget">y</SectionCard>);
    expect(screen.queryByRole("button")).toBeNull();
  });
});

describe("SectionCard list", () => {
  it("is unpadded, clipped, with the --list-divider utility on the rows (inside and outside)", () => {
    for (const labelPlacement of ["inside", "outside"] as const) {
      const { container, unmount } = render(
        <SectionCard list label="Rows" labelPlacement={labelPlacement}>
          <div>a</div>
          <div>b</div>
        </SectionCard>,
      );
      const cls = (labelPlacement === "inside" ? container.querySelector("[data-slot=section-card]")! : body(container)).className;
      expect(cls).toContain("overflow-hidden");
      expect(body(container).className).toContain("[&>*:not(:last-child)]:shadow-[var(--list-divider)]");
      expect(body(container).className).not.toMatch(/\bp-4\b|pb-4/);
      unmount();
    }
  });

  it("works without a label", () => {
    const { container } = render(
      <SectionCard list>
        <div>a</div>
      </SectionCard>,
    );
    expect(body(container).className).toContain("surface-card");
    expect(body(container).className).toContain("[&>*:not(:last-child)]:shadow-[var(--list-divider)]");
  });
});
