/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import * as React from "react";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

// The size class is the only input for collapseBelow; mock it so each size can be set directly.
const size = vi.hoisted(() => ({ value: "compact" as "compact" | "regular" | "wide" }));
vi.mock("@/components/adaptive/size-class-context", () => ({
  useAppSizeClass: () => size.value,
}));

import { Disclosure } from "@/components/adaptive/disclosure";

afterEach(() => {
  cleanup();
  size.value = "compact";
  localStorage.clear();
});

const region = (toggle: HTMLElement) => document.getElementById(toggle.getAttribute("aria-controls")!) as HTMLElement;

describe("Disclosure collapseBelow=regular", () => {
  it("is collapsed at compact: aria-expanded false, region hidden, content still mounted", () => {
    size.value = "compact";
    render(
      <Disclosure title="More insights" expandedTitle="Fewer insights" collapseBelow="regular">
        <p>secondary card</p>
      </Disclosure>,
    );
    const toggle = screen.getByRole("button", { name: "More insights" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(region(toggle).hidden).toBe(true);
    expect(screen.getByText("secondary card")).toBeTruthy();
  });

  it("is expanded from regular up: aria-expanded true and the expanded title", () => {
    for (const s of ["regular", "wide"] as const) {
      cleanup();
      size.value = s;
      render(
        <Disclosure title="More insights" expandedTitle="Fewer insights" collapseBelow="regular">
          <p>secondary card</p>
        </Disclosure>,
      );
      const toggle = screen.getByRole("button", { name: "Fewer insights" });
      expect(toggle.getAttribute("aria-expanded")).toBe("true");
      expect(region(toggle).hidden).toBe(false);
    }
  });

  it("follows a size change until the user toggles", () => {
    const view = () => (
      <Disclosure title="More insights" collapseBelow="regular">
        <p>secondary card</p>
      </Disclosure>
    );
    size.value = "compact";
    const { rerender } = render(view());
    expect(screen.getByRole("button", { name: "More insights" }).getAttribute("aria-expanded")).toBe("false");
    size.value = "regular";
    rerender(view());
    expect(screen.getByRole("button", { name: "More insights" }).getAttribute("aria-expanded")).toBe("true");
  });

  it("the user toggle always works and then wins over the size class", () => {
    const view = () => (
      <Disclosure title="More insights" collapseBelow="regular">
        <p>secondary card</p>
      </Disclosure>
    );
    size.value = "regular";
    const { rerender } = render(view());
    const toggle = screen.getByRole("button", { name: "More insights" });
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(region(toggle).hidden).toBe(true);
    // a later size change does not override the user's choice
    size.value = "compact";
    rerender(view());
    expect(screen.getByRole("button", { name: "More insights" }).getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(screen.getByRole("button", { name: "More insights" }));
    expect(screen.getByRole("button", { name: "More insights" }).getAttribute("aria-expanded")).toBe("true");
  });

  it("does not persist the state", () => {
    size.value = "compact";
    render(
      <Disclosure title="More insights" collapseBelow="regular">
        <p>secondary card</p>
      </Disclosure>,
    );
    fireEvent.click(screen.getByRole("button", { name: "More insights" }));
    expect(localStorage.length).toBe(0);
  });
});

describe("Disclosure a11y wiring", () => {
  it("header has aria-controls to the region, and the region is labelled by the header", () => {
    size.value = "compact";
    render(
      <Disclosure title="More insights" collapseBelow="regular">
        <p>secondary card</p>
      </Disclosure>,
    );
    const toggle = screen.getByRole("button", { name: "More insights" });
    const r = region(toggle);
    expect(r.getAttribute("role")).toBe("region");
    expect(r.getAttribute("aria-labelledby")).toBe(toggle.id);
    expect(toggle.getAttribute("aria-controls")).toBe(r.id);
    expect(toggle.getAttribute("type")).toBe("button");
  });

  it("the chevron is decorative and animates only when motion is allowed", () => {
    size.value = "compact";
    const { container } = render(
      <Disclosure title="More insights" collapseBelow="regular">
        <p>x</p>
      </Disclosure>,
    );
    const svg = container.querySelector("button svg") as SVGElement;
    expect(svg.getAttribute("aria-hidden")).toBe("true");
    expect(svg.getAttribute("class")).toContain("motion-safe:transition-transform");
  });

  it("the open chevron rotates", () => {
    size.value = "regular";
    const { container } = render(
      <Disclosure title="More insights" collapseBelow="regular">
        <p>x</p>
      </Disclosure>,
    );
    expect((container.querySelector("button svg") as SVGElement).getAttribute("class")).toContain("rotate-180");
  });
});

describe("Disclosure without collapseBelow and trailing", () => {
  it("defaultOpen sets the initial state, independent of the size class", () => {
    size.value = "compact";
    render(
      <Disclosure title="Open by default" defaultOpen>
        <p>x</p>
      </Disclosure>,
    );
    expect(screen.getByRole("button", { name: "Open by default" }).getAttribute("aria-expanded")).toBe("true");
  });

  it("renders trailing next to the header button, not inside it", () => {
    size.value = "compact";
    render(
      <Disclosure title="Tips" collapseBelow="regular" trailing={<button type="button">Dismiss all</button>}>
        <p>x</p>
      </Disclosure>,
    );
    const toggle = screen.getByRole("button", { name: "Tips" });
    const dismiss = screen.getByRole("button", { name: "Dismiss all" });
    expect(toggle.contains(dismiss)).toBe(false);
    expect(toggle.parentElement).toBe(dismiss.parentElement);
  });
});
