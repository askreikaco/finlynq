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
    const { container } = render(<MetricCard label="x" icon={DollarSign} value={1} delta={{ pct, invert }} />);
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

describe("MetricCard optional parts show only when their prop is given", () => {
  afterEach(cleanup);

  it("a bare card has no progress, info tip, delta badge or link", () => {
    const { container } = render(<MetricCard label="Net worth" icon={DollarSign} value={5} />);
    expect(container.querySelector('[data-slot="metric-progress"]')).toBeNull();
    expect(container.querySelector('[data-slot="info-tip"]')).toBeNull();
    expect(container.querySelector(".rounded-full.font-semibold")).toBeNull();
    expect(container.querySelector("a")).toBeNull();
  });

  it("progress: a clamped bar plus a caption (default caption = the rounded percent)", () => {
    const { container, getByRole, getByText } = render(
      <MetricCard label="Budget" icon={DollarSign} value={1} progress={{ value: 140, tone: "destructive" }} />,
    );
    const bar = getByRole("progressbar");
    expect(bar.getAttribute("aria-valuenow")).toBe("100");
    expect(bar.getAttribute("aria-label")).toBe("Budget");
    expect(bar.firstElementChild?.className).toContain("bg-destructive");
    expect(container.querySelector('[data-slot="metric-progress"]')).not.toBeNull();
    getByText("140%");
  });

  it("progress caption overrides the percent", () => {
    const { getByText } = render(<MetricCard label="x" icon={DollarSign} value={1} progress={{ value: 40, caption: "40% of income spent" }} />);
    getByText("40% of income spent");
  });

  it("delta: pct badge plus text; sub wins over delta.text", () => {
    const a = render(<MetricCard label="x" icon={DollarSign} value={1} delta={{ pct: 2, text: "+$2 vs last month" }} />);
    a.getByText("+$2 vs last month");
    expect(a.container.querySelector(".rounded-full.font-semibold")).not.toBeNull();
    cleanup();
    const b = render(<MetricCard label="x" icon={DollarSign} value={1} sub="Caption" delta={{ pct: null, text: "hidden" }} />);
    b.getByText("Caption");
    expect(b.queryByText("hidden")).toBeNull();
    expect(b.container.querySelector(".rounded-full.font-semibold")).toBeNull();
  });

  it("info: an InfoTip in the label row", () => {
    const { container } = render(<MetricCard label="Net worth" icon={DollarSign} value={1} info="Assets minus debts." />);
    const row = container.querySelector('[data-slot="card-label"]')!;
    expect(row.querySelector('[data-slot="info-tip"]')).not.toBeNull();
  });

  it("action: rendered at the right of the label row", () => {
    const { getByLabelText } = render(<MetricCard label="x" icon={DollarSign} value={1} action={<button aria-label="Edit">e</button>} />);
    expect(getByLabelText("Edit").closest('[data-slot="card-label"]')).not.toBeNull();
  });

  it("number = money; a node renders as-is; valueTone / showSign colour and prefix", () => {
    const money = render(<MetricCard label="x" icon={DollarSign} value={12} currency="USD" showSign valueTone="auto" />);
    expect(money.container.textContent).toContain("+$12");
    expect(money.container.querySelector(".hero-number")!.className).toContain("text-pos");
    cleanup();
    const count = render(<MetricCard label="x" icon={DollarSign} value={<span>{7}</span>} />);
    expect(count.container.querySelector(".hero-number")!.textContent).toBe("7");
  });

  it("id: a labelled group with data-testid; cellClassName lands on the cell", () => {
    const { getByTestId } = render(<MetricCard id="total" label="Total" icon={DollarSign} value={1} cellClassName="max-regular:hidden" />);
    const cell = getByTestId("metric-total");
    expect(cell.getAttribute("role")).toBe("group");
    expect(cell.getAttribute("aria-label")).toBe("Total");
    expect(cell.className).toContain("max-regular:hidden");
  });
});
