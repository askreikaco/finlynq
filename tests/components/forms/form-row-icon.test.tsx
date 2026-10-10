/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach } from "vitest";
import * as React from "react";
import { render, screen, cleanup } from "@testing-library/react";
import { CalendarDays } from "lucide-react";
import { FormRow } from "@/components/forms/form-row";

afterEach(() => cleanup());

describe("FormRow icon prop", () => {
  it("renders the icon before the label text, aria-hidden, 18px, muted", () => {
    const { container } = render(
      <FormRow variant="button" label="Date" value="Today" icon={CalendarDays} onClick={() => {}} />,
    );
    const label = container.querySelector("button > span") as HTMLElement;
    const svg = label.querySelector("svg") as SVGElement;
    expect(svg).toBeTruthy();
    expect(svg.getAttribute("aria-hidden")).toBe("true");
    expect(svg.getAttribute("data-slot")).toBe("form-row-icon");
    expect(svg.getAttribute("class")).toContain("size-[18px]");
    expect(svg.getAttribute("class")).toContain("text-muted-foreground");
    expect(label.textContent).toBe("Date");
  });

  it("keeps the label cell width class (w-24 narrow, w-28 default) when an icon is set", () => {
    const { container, rerender } = render(
      <FormRow variant="button" label="Date" value="Today" icon={CalendarDays} labelWidth="narrow" onClick={() => {}} />,
    );
    const label = container.querySelector("button > span") as HTMLElement;
    expect(label.classList.contains("w-24")).toBe(true);
    expect(label.classList.contains("shrink-0")).toBe(true);
    rerender(<FormRow variant="button" label="Date" value="Today" icon={CalendarDays} onClick={() => {}} />);
    const again = container.querySelector("button > span") as HTMLElement;
    expect(again.classList.contains("w-28")).toBe(true);
  });

  it("lets a long label truncate inside the fixed column instead of widening it", () => {
    render(
      <FormRow variant="input" label="Received (VND)" inputValue="" onInputChange={() => {}} icon={CalendarDays} />,
    );
    const text = screen.getByText("Received (VND)");
    expect(text.classList.contains("truncate")).toBe(true);
    expect(text.classList.contains("min-w-0")).toBe(true);
  });

  it("without an icon the label is a bare text node (no extra wrapper, no icon)", () => {
    const { container } = render(
      <FormRow variant="input" label="Note" inputValue="" onInputChange={() => {}} />,
    );
    const label = container.querySelector("label") as HTMLElement;
    expect(label.querySelector("svg")).toBeNull();
    expect(label.children.length).toBe(0);
    expect(label.textContent).toBe("Note");
    expect(label.classList.contains("flex")).toBe(false);
  });

  it("works on the custom variant too", () => {
    const { container } = render(
      <FormRow variant="custom" label="Tags" htmlFor="t" icon={CalendarDays}>
        <input id="t" />
      </FormRow>,
    );
    const label = container.querySelector("label") as HTMLElement;
    expect(label.querySelector('svg[data-slot="form-row-icon"]')).toBeTruthy();
    expect(label.textContent).toBe("Tags");
  });
});
