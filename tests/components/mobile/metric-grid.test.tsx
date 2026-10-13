/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { MetricGrid, METRIC_GRID_CLASS, metricGridClass } from "@/components/mobile/metric-grid";
import { formatCurrency } from "@/lib/currency";

afterEach(cleanup);

const tokens = (cls: string) => cls.split(/\s+/);
const four = [
  { label: "A", value: 1 },
  { label: "B", value: 2 },
  { label: "C", value: 3 },
  { label: "D", value: 4 },
];

describe("metric grid rule: 2 mobile (max), 3 tablet (max), 4 desktop (default)", () => {
  it("METRIC_GRID_CLASS is exactly the shared breakpoint classes", () => {
    expect(tokens(METRIC_GRID_CLASS)).toEqual(expect.arrayContaining(["grid", "grid-cols-2", "regular:grid-cols-3", "wide:grid-cols-4"]));
    expect(METRIC_GRID_CLASS).not.toContain("grid-cols-1");
  });

  it("four or more items use the full rule", () => {
    expect(metricGridClass(4)).toContain("grid-cols-2 regular:grid-cols-3 wide:grid-cols-4");
    expect(metricGridClass(7)).toContain("wide:grid-cols-4");
  });

  it("fewer items than columns never leave empty columns", () => {
    expect(metricGridClass(1)).toContain("grid-cols-1");
    expect(metricGridClass(1)).not.toContain("grid-cols-2");
    expect(metricGridClass(2)).toContain("grid-cols-2");
    expect(metricGridClass(2)).not.toContain("regular:grid-cols-3");
    expect(metricGridClass(3)).toContain("grid-cols-2 regular:grid-cols-3");
    expect(metricGridClass(3)).not.toContain("wide:grid-cols-4");
  });

  it("max caps the desktop columns (3 = at most 3, 2 = always 2)", () => {
    expect(metricGridClass(6, "gap-3", 3)).not.toContain("wide:grid-cols-4");
    expect(metricGridClass(6, "gap-3", 3)).toContain("regular:grid-cols-3");
    expect(metricGridClass(6, "gap-3", 2)).not.toContain("regular:grid-cols-3");
  });
});

describe("MetricGrid", () => {
  it("defaults to 2 / 3 / 4 columns", () => {
    const { container } = render(<MetricGrid metrics={four} />);
    const grid = container.querySelector("[data-slot=metric-grid]") as HTMLElement;
    expect(grid.getAttribute("data-columns")).toBe("4");
    expect(grid.className).toContain("grid-cols-2 regular:grid-cols-3 wide:grid-cols-4");
    expect(grid.children).toHaveLength(4);
  });

  it("two items do not reserve extra columns", () => {
    const { container } = render(<MetricGrid metrics={[four[0], four[1]]} />);
    const grid = container.querySelector("[data-slot=metric-grid]") as HTMLElement;
    expect(grid.className).not.toContain("wide:grid-cols-4");
    expect(grid.className).not.toContain("regular:grid-cols-3");
  });

  it("columns={3} caps desktop at 3", () => {
    const { container } = render(<MetricGrid columns={3} metrics={four} />);
    const grid = container.querySelector("[data-slot=metric-grid]") as HTMLElement;
    expect(grid.getAttribute("data-columns")).toBe("3");
    expect(grid.className).toContain("regular:grid-cols-3");
    expect(grid.className).not.toContain("wide:grid-cols-4");
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
