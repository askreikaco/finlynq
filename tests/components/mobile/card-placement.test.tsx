/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { Card } from "@/components/ui/card";

const body = (c: HTMLElement) => c.querySelector("[data-slot='card-body']")!;
const surface = (c: HTMLElement) => c.querySelector("[data-slot='card-surface']")!;

describe("Card title placement", () => {
  it("inside (default): label is a row inside the card", () => {
    const { container } = render(<Card title="Monthly">x</Card>);
    expect(container.querySelector("[data-slot='card-label-text']")).toBeTruthy();
  });

  it("outside: heading sits above the card box, not inside it", () => {
    const { container } = render(<Card title="Monthly" titlePlacement="outside">x</Card>);
    const heading = screen.getByRole("heading", { name: "Monthly" });
    expect(body(container).contains(heading)).toBe(false);
    expect(heading.nextElementSibling).toBe(surface(container));
    expect(surface(container).contains(body(container))).toBe(true);
    expect(heading.className).toContain("px-4");
  });

  it("outside + bare: no card surface around the body", () => {
    const { container } = render(<Card title="Assets" titlePlacement="outside" frame="bare">x</Card>);
    expect(surface(container).className).not.toContain("surface-card");
    expect(body(container).className).not.toMatch(/\bp-4\b/);
  });
});

describe("Card description", () => {
  it("follows the label: inside label puts it in the card, under the label", () => {
    const { container } = render(<Card title="Plan" description="Billed monthly">x</Card>);
    const card = container.querySelector("[data-slot=card]")!;
    const d = screen.getByText("Billed monthly");
    expect(card.contains(d)).toBe(true);
    // the description is the first line of the padded body, right under the title row
    const row = screen.getByRole("heading", { name: "Plan" }).closest("[data-slot=card-label]")!;
    expect(row.nextElementSibling).toBe(body(container));
    expect(body(container).firstElementChild).toBe(d);
  });

  it("follows the label: outside label puts it between the heading and the card box", () => {
    const { container } = render(<Card title="Plan" titlePlacement="outside" description="Billed monthly">x</Card>);
    const d = screen.getByText("Billed monthly");
    expect(body(container).contains(d)).toBe(false);
    expect(screen.getByRole("heading", { name: "Plan" }).nextElementSibling).toBe(d);
    expect(d.nextElementSibling).toBe(surface(container));
  });

  it("explicit descriptionPlacement=inside moves it into the card body under an outside label", () => {
    const { container } = render(
      <Card title="Plan" titlePlacement="outside" description="Billed monthly" descriptionPlacement="inside">x</Card>,
    );
    expect(body(container).contains(screen.getByText("Billed monthly"))).toBe(true);
    expect(screen.getByRole("heading", { name: "Plan" }).nextElementSibling).toBe(surface(container));
  });

  it("explicit descriptionPlacement=outside puts it above an inside-label card", () => {
    const { container } = render(
      <Card title="Plan" description="Billed monthly" descriptionPlacement="outside" data-testid="c">x</Card>,
    );
    const d = screen.getByText("Billed monthly");
    const s = surface(container);
    expect(s.contains(d)).toBe(false);
    expect(s.className).toContain("surface-card");
    expect(d.nextElementSibling).toBe(s);
    expect(screen.getByTestId("c").contains(s)).toBe(true);
  });
});

describe("Card info tooltip", () => {
  it.each(["inside", "outside"] as const)("%s label gets an (i) InfoTip next to it", (placement) => {
    render(<Card title="Budget" titlePlacement={placement} info="Resets on the 1st">x</Card>);
    const heading = screen.getByRole("heading", { level: 2 });
    const tip = within(heading).getByRole("button", { name: "About Budget" });
    expect(tip.getAttribute("data-slot")).toBe("info-tip");
  });

  it("infoLabel names the button", () => {
    render(<Card title="Budget" info="x" infoLabel="About the budget">y</Card>);
    expect(screen.getByRole("button", { name: "About the budget" })).toBeTruthy();
  });

  it("no info prop renders no tip", () => {
    render(<Card title="Budget">y</Card>);
    expect(screen.queryByRole("button")).toBeNull();
  });
});

describe("Card list", () => {
  it("is unpadded, clipped, with the --list-divider utility on the rows (inside and outside)", () => {
    for (const labelPlacement of ["inside", "outside"] as const) {
      const { container, unmount } = render(
        <Card frame="list" title="Rows" titlePlacement={labelPlacement}>
          <div>a</div>
          <div>b</div>
        </Card>,
      );
      const cls = (labelPlacement === "inside" ? container.querySelector("[data-slot=card]")! : surface(container)).className;
      expect(cls).toContain("overflow-hidden");
      expect(body(container).className).toContain("[&>*:not(:last-child)]:shadow-[var(--list-divider)]");
      expect(body(container).className).not.toMatch(/\bp-4\b|pb-4/);
      unmount();
    }
  });

  it("works without a label", () => {
    const { container } = render(
      <Card frame="list">
        <div>a</div>
      </Card>,
    );
    expect(container.querySelector("[data-slot=card]")!.className).toContain("surface-card");
    expect(body(container).className).toContain("[&>*:not(:last-child)]:shadow-[var(--list-divider)]");
  });
});
