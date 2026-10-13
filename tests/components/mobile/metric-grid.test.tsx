/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { MetricGrid } from "@/components/mobile";
import { formatCurrency } from "@/lib/currency";

afterEach(cleanup);

describe("MetricGrid", () => {
  it("defaults to a 2-column grid", () => {
    const { container } = render(<MetricGrid metrics={[{ label: "A", value: 1 }]} />);
    const grid = container.querySelector("[data-slot=metric-grid]") as HTMLElement;
    expect(grid.getAttribute("data-columns")).toBe("2");
    expect(grid.className).toContain("grid-cols-2");
    expect(grid.className).not.toContain("wide:grid-cols-3");
  });

  it("columns={3} is 2 columns on phones and 3 from the wide breakpoint", () => {
    const { container } = render(<MetricGrid columns={3} metrics={[{ label: "A", value: 1 }]} />);
    const grid = container.querySelector("[data-slot=metric-grid]") as HTMLElement;
    expect(grid.getAttribute("data-columns")).toBe("3");
    expect(grid.className).toContain("grid-cols-2");
    expect(grid.className).toContain("wide:grid-cols-3");
  });

  it("money values go through Amount in the given currency; text values render as given", () => {
    render(
      <MetricGrid
        metrics={[
          { label: "Total debt", value: 1234.5, currency: "USD", tone: "neg" },
          { label: "FIRE age", text: "Age 65" },
        ]}
      />,
    );
    expect(screen.getByText(formatCurrency(1234.5, "USD"))).toBeTruthy();
    expect(screen.getByText("Age 65")).toBeTruthy();
  });

  it("shows the sub line under the value and a signed amount when showSign is set", () => {
    render(<MetricGrid metrics={[{ label: "Extra", value: 50, currency: "USD", showSign: true, sub: "per month" }]} />);
    expect(screen.getByText("+" + formatCurrency(50, "USD"))).toBeTruthy();
    expect(screen.getByText("per month")).toBeTruthy();
  });

  it("renders no table", () => {
    const { container } = render(<MetricGrid metrics={[{ label: "A", value: 1 }]} />);
    expect(container.querySelector("table")).toBeNull();
  });
});
