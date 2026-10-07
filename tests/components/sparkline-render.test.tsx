/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import React from "react";
import { render, cleanup } from "@testing-library/react";
import { Sparkline, sparkDomain } from "@/components/sparkline";

// Store YAxis props to verify sparkDomain is applied
let yaxisProps: any = null;

// Mock LazyView
vi.mock("@/components/ui/lazy-view", () => ({
  LazyView: ({ children, minHeight, className }: any) => (
    <div data-testid="lazy-view" style={{ minHeight }} className={className}>
      {children}
    </div>
  ),
}));

// Mock the hooks
vi.mock("@/hooks/use-animations", () => ({
  useAnimations: () => true,
}));

vi.mock("@/components/currency-provider", () => ({
  useDisplayCurrency: () => ({ displayCurrency: "USD" }),
}));

// Mock recharts: render YAxis to capture props, render SVG structure for gradient
vi.mock("recharts", () => ({
  AreaChart: ({ children, ...props }: any) => (
    <svg data-testid="area-chart" {...props}>
      {children}
    </svg>
  ),
  Area: (props: any) => (
    // Render SVG path for area
    React.createElement("path", { "data-testid": "area", ...props })
  ),
  YAxis: (props: any) => {
    yaxisProps = props;
    // Render a g element to represent YAxis
    return React.createElement("g", { "data-testid": "yaxis", "data-hide": String(props.hide), ...props });
  },
  Tooltip: (props: any) => React.createElement("g", { "data-testid": "tooltip", ...props }),
  ResponsiveContainer: ({ children, height }: any) => (
    <svg data-testid="responsive-container" style={{ height }} width="100%" height={height}>
      {children}
    </svg>
  ),
}));

beforeEach(() => {
  yaxisProps = null;
});

afterEach(cleanup);

describe("Sparkline render", () => {
  it("renders hidden YAxis with sparkDomain applied as domain prop", () => {
    const data = [100, 120, 110, 130, 125];
    const { container } = render(
      <Sparkline data={data} color="#6366f1" />
    );

    // Find the YAxis element
    const yaxis = container.querySelector('[data-testid="yaxis"]');
    expect(yaxis).toBeTruthy();

    // Verify YAxis was rendered with hide prop
    expect(yaxis?.getAttribute("data-hide")).toBe("true");

    // Verify sparkDomain was applied - stored in yaxisProps
    expect(yaxisProps).toBeTruthy();
    expect(yaxisProps.hide).toBe(true);

    // Verify the domain from sparkDomain
    const expectedDomain = sparkDomain(data);
    expect(yaxisProps.domain).toEqual(expectedDomain);
  });

  it("sparkline applies area gradient with stopOpacity 0.18", () => {
    const data = [100, 120, 110, 130, 125];
    const color = "#6366f1";
    const { container } = render(
      <Sparkline data={data} color={color} />
    );

    // Find all stop elements - they should be in the defs
    const stops = container.querySelectorAll("stop");
    expect(stops.length).toBeGreaterThan(0);

    // Check for the first stop with opacity 0.18
    // Note: JSX stopOpacity becomes the HTML attribute stop-opacity
    let foundOpacityStop = false;
    for (const stop of stops) {
      const opacityAttr = stop.getAttribute("stop-opacity");
      if (opacityAttr === "0.18") {
        foundOpacityStop = true;
        break;
      }
    }
    expect(foundOpacityStop).toBe(true);
  });

  it("sparkDomain filters non-finite values correctly", () => {
    // Test with NaN
    const [min1, max1] = sparkDomain([100, NaN, 120]);
    expect(min1).toBeLessThan(100);
    expect(max1).toBeGreaterThan(120);

    // Test with Infinity
    const [min2, max2] = sparkDomain([100, Infinity, 120]);
    expect(min2).toBeLessThan(100);
    expect(max2).toBeGreaterThan(120);

    // Test with all non-finite values
    expect(sparkDomain([NaN, Infinity, -Infinity])).toEqual([0, 1]);
  });
});
