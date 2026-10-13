/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { MetricGrid, METRIC_GRID_CLASS, metricGridClass } from "@/components/mobile/metric-grid";

afterEach(cleanup);

const tokens = (cls: string) => cls.split(/\s+/);

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
    expect(metricGridClass(2)).not.toContain("wide:grid-cols-4");
    expect(metricGridClass(3)).toContain("grid-cols-2 regular:grid-cols-3");
    expect(metricGridClass(3)).not.toContain("wide:grid-cols-4");
  });

  it("MetricGrid renders the shared classes for its items", () => {
    const { container } = render(
      <MetricGrid
        metrics={[
          { label: "A", value: 1 },
          { label: "B", value: 2 },
          { label: "C", value: 3 },
          { label: "D", value: 4 },
        ]}
      />,
    );
    const grid = container.querySelector('[data-slot="metric-grid"]') as HTMLElement;
    expect(grid.className).toContain("grid-cols-2 regular:grid-cols-3 wide:grid-cols-4");
    expect(grid.children).toHaveLength(4);
  });

  it("MetricGrid with two items does not reserve a fourth column", () => {
    const { container } = render(<MetricGrid metrics={[{ label: "A", value: 1 }, { label: "B", value: 2 }]} />);
    const grid = container.querySelector('[data-slot="metric-grid"]') as HTMLElement;
    expect(grid.className).not.toContain("wide:grid-cols-4");
  });
});
