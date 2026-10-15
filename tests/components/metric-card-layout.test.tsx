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
  ComposedChart: ({ children, ...props }: any) => (
    <div data-testid="area-chart" {...props}>
      {children}
    </div>
  ),
  Area: (props: any) => <div data-testid="area" {...props} />,
  YAxis: (props: any) => <div data-testid="yaxis" {...props} />,
  XAxis: () => null,
  CartesianGrid: () => null,
  ReferenceLine: () => null,
  Bar: () => null,
  Line: () => null,
  Cell: () => null,
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

  const wideColumnOf = (size: "hero" | "default") => {
    const { container } = render(
      <MetricCard label="Net Worth" icon={DollarSign} value={14116.68} size={size} sparkData={[100, 120, 110, 130, 125]} sparkColor="#6366f1" />,
    );
    return Array.from(container.querySelectorAll("div")).find(
      (d) => d.className.includes("hidden @[36rem]:block") && d.className.includes("@[36rem]:self-center"),
    );
  };

  it("caps the wide sparkline column at @[36rem] on a default card", () => {
    const col = wideColumnOf("default");
    expect(col).toBeTruthy();
    expect(col?.className).toContain("@[36rem]:w-[40%]");
    expect(col?.className).toContain("@[36rem]:max-w-[18rem]");
  });

  it("hero card: the sparkline column fills the free width (no empty gap between value and chart)", () => {
    const col = wideColumnOf("hero");
    expect(col).toBeTruthy();
    expect(col?.className).toContain("@[36rem]:flex-1");
    expect(col?.className).not.toContain("@[36rem]:max-w-[18rem]");
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

describe("MetricCard badge tone", () => {
  const html = (invert: boolean, pct: number) => {
    const { container } = render(<MetricCard label="x" icon={DollarSign} value={1} badgePct={pct} invertTone={invert} />);
    const b = container.querySelector(".rounded-full.font-semibold")!;
    cleanup();
    return b.className;
  };
  it("default: up is green, down is red", () => {
    expect(html(false, 5)).toContain("text-pos");
    expect(html(false, -5)).toContain("text-destructive");
  });
  it("invertTone: up is red, down is green (expenses)", () => {
    expect(html(true, 5)).toContain("text-destructive");
    expect(html(true, -5)).toContain("text-pos");
  });
});

describe("MetricCard label wraps instead of truncating", () => {
  afterEach(cleanup);
  it("label wraps words and never ellipsizes", () => {
    const { getByText } = render(<MetricCard label="Financial Health" icon={DollarSign} value={73} />);
    const cls = getByText("Financial Health").className;
    expect(cls).toMatch(/\bbreak-words\b/);
    expect(cls).not.toMatch(/\btruncate\b/);
  });
});
