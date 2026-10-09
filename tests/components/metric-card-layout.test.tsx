/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import React from "react";
import { render, cleanup } from "@testing-library/react";
import { MetricCard } from "@/components/metric-card";
import { DollarSign } from "lucide-react";

// Mock recharts to avoid canvas/DOM issues in jsdom
vi.mock("recharts", () => ({
  AreaChart: ({ children, ...props }: any) => (
    <div data-testid="area-chart" {...props}>
      {children}
    </div>
  ),
  Area: (props: any) => <div data-testid="area" {...props} />,
  YAxis: (props: any) => <div data-testid="yaxis" {...props} />,
  Tooltip: (props: any) => <div data-testid="tooltip" {...props} />,
  ResponsiveContainer: ({ children, height }: any) => (
    <div data-testid="responsive-container" style={{ height }}>
      {children}
    </div>
  ),
}));

// Mock LazyView to simplify testing
vi.mock("@/components/ui/lazy-view", () => ({
  LazyView: ({ children, minHeight, className }: any) => (
    <div data-testid="lazy-view" style={{ minHeight }} className={className}>
      {children}
    </div>
  ),
}));

afterEach(cleanup);

describe("MetricCard layout and sizing", () => {
  it("renders metric card with hero size and sparkline", () => {
    const sparkData = [100, 120, 110, 130, 125];
    const { container } = render(
      <MetricCard
        label="Net Worth"
        icon={DollarSign}
        value={14116.68}
        size="hero"
        sparkData={sparkData}
        sparkColor="#6366f1"
      />
    );
    expect(container).toBeTruthy();
  });

  it("caps the wide column with correct classes at @[36rem]", () => {
    const sparkData = [100, 120, 110, 130, 125];
    const { container } = render(
      <MetricCard
        label="Net Worth"
        icon={DollarSign}
        value={14116.68}
        size="hero"
        sparkData={sparkData}
        sparkColor="#6366f1"
      />
    );

    // Find the wide column div by looking for the class that contains the expected strings
    const allDivs = container.querySelectorAll("div");
    let wideColumn = null;
    for (const div of allDivs) {
      if (
        div.className.includes("@[36rem]:w-[40%]") &&
        div.className.includes("@[36rem]:max-w-[18rem]") &&
        div.className.includes("@[36rem]:self-center")
      ) {
        wideColumn = div;
        break;
      }
    }

    expect(wideColumn).toBeTruthy();
    expect(wideColumn?.className).toContain("@[36rem]:w-[40%]");
    expect(wideColumn?.className).toContain("@[36rem]:max-w-[18rem]");
    expect(wideColumn?.className).toContain("@[36rem]:self-center");
  });

  it("sets narrow strip to 44px height on non-wide screens", () => {
    const sparkData = [100, 120, 110, 130, 125];
    const { container } = render(
      <MetricCard
        label="Net Worth"
        icon={DollarSign}
        value={14116.68}
        size="hero"
        sparkData={sparkData}
        sparkColor="#6366f1"
      />
    );

    // Find the LazyView for narrow card (the one with @[36rem]:hidden)
    const lazyViews = container.querySelectorAll('[data-testid="lazy-view"]');
    // The last LazyView should be the narrow strip with minHeight={44}
    const narrowStrip = lazyViews[lazyViews.length - 1] as HTMLElement;
    expect(narrowStrip).toBeTruthy();
    expect(narrowStrip.style.minHeight).toBe("44px");
  });

  it("sets wide column LazyView to 96px minHeight", () => {
    const sparkData = [100, 120, 110, 130, 125];
    const { container } = render(
      <MetricCard
        label="Net Worth"
        icon={DollarSign}
        value={14116.68}
        size="hero"
        sparkData={sparkData}
        sparkColor="#6366f1"
      />
    );

    // Find the LazyView for wide column
    const lazyViews = container.querySelectorAll('[data-testid="lazy-view"]');
    // First LazyView should be the wide column with minHeight={96}
    const wideColumn = lazyViews[0] as HTMLElement;
    expect(wideColumn).toBeTruthy();
    expect(wideColumn.style.minHeight).toBe("96px");
  });

  it("applies sparkline-fade class to wide sparkline", () => {
    const sparkData = [100, 120, 110, 130, 125];
    const { container } = render(
      <MetricCard
        label="Net Worth"
        icon={DollarSign}
        value={14116.68}
        size="hero"
        sparkData={sparkData}
        sparkColor="#6366f1"
      />
    );

    const sparklineWithFade = container.querySelector(".sparkline-fade");
    expect(sparklineWithFade).toBeTruthy();
  });

  it("renders without sparkline when sparkData is missing or empty", () => {
    const { container } = render(
      <MetricCard
        label="Empty Card"
        icon={DollarSign}
        value={1000}
        size="default"
      />
    );
    const lazyViews = container.querySelectorAll('[data-testid="lazy-view"]');
    expect(lazyViews.length).toBe(0);
  });
});
