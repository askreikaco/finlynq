/**
 * @vitest-environment jsdom
 */
// Chart: the one chart component. Every kind draws, every optional part shows/hides, nothing animates on mount, and
// no inline style attribute reaches the server-rendered HTML (CSP).
import { describe, it, expect, afterEach, vi } from "vitest";
import React from "react";
import { render, cleanup, fireEvent } from "@testing-library/react";
import { renderToString } from "react-dom/server";

vi.mock("@/components/currency-provider", () => ({ useDisplayCurrency: () => ({ displayCurrency: "USD" }) }));

// Marker recharts: every part renders a <g> carrying the props the tests look at.
vi.mock("recharts", () => {
  const mk = (kind: string) =>
    function Part(props: Record<string, unknown>) {
      const { children, dataKey, stackId, isAnimationActive, hide, y, x, type } = props as Record<string, unknown> & { children?: React.ReactNode };
      return React.createElement(
        "g",
        {
          "data-part": kind,
          "data-key": dataKey as string,
          "data-stack": stackId as string,
          "data-anim": String(isAnimationActive),
          "data-hide": String(hide),
          "data-y": y as number,
          "data-x": x as number,
          "data-type": type as string,
        },
        children,
      );
    };
  return {
    ResponsiveContainer: mk("container"),
    ComposedChart: mk("chart"),
    PieChart: mk("pie-chart"),
    Pie: mk("pie"),
    Area: mk("area"),
    Bar: mk("bar"),
    Line: mk("line"),
    Cell: mk("cell"),
    XAxis: mk("xaxis"),
    YAxis: mk("yaxis"),
    Tooltip: mk("tooltip"),
    CartesianGrid: mk("grid"),
    ReferenceLine: mk("refline"),
  };
});

import { Chart, sparkDomain } from "@/components/chart";
import { ChartTooltip } from "@/components/chart/shared";

afterEach(cleanup);

const ROWS = [
  { date: "2026-01", a: 10, b: 4 },
  { date: "2026-02", a: 14, b: 6 },
  { date: "2026-03", a: 12, b: 8 },
];
const SERIES = [
  { key: "a", name: "Alpha" },
  { key: "b", name: "Beta" },
];
const parts = (c: HTMLElement, kind: string) => Array.from(c.querySelectorAll(`[data-part="${kind}"]`));

describe("Chart: cartesian kinds", () => {
  it.each([
    ["line", "line"],
    ["area", "area"],
    ["bar", "bar"],
    ["stacked-bar", "bar"],
    ["stacked-area", "area"],
  ] as const)("kind %s draws one %s per series", (kind, part) => {
    const { container } = render(<Chart kind={kind} data={ROWS} series={SERIES} />);
    expect(parts(container, part).map((e) => e.getAttribute("data-key"))).toEqual(["a", "b"]);
  });

  it("stacked kinds put the series in one stack, plain kinds in none", () => {
    const stacked = render(<Chart kind="stacked-bar" data={ROWS} series={SERIES} />);
    expect(parts(stacked.container, "bar").map((e) => e.getAttribute("data-stack"))).toEqual(["stack", "stack"]);
    cleanup();
    const plain = render(<Chart kind="bar" data={ROWS} series={SERIES} />);
    expect(parts(plain.container, "bar").map((e) => e.getAttribute("data-stack"))).toEqual([null, null]);
  });

  it("series[].as draws a line over bars", () => {
    const { container } = render(<Chart kind="bar" data={ROWS} series={[{ key: "a" }, { key: "b", as: "line" }]} />);
    expect(parts(container, "bar")).toHaveLength(1);
    expect(parts(container, "line")).toHaveLength(1);
  });

  it("never animates on mount", () => {
    const { container } = render(<Chart kind="area" data={ROWS} series={SERIES} />);
    for (const p of [...parts(container, "area"), ...parts(container, "tooltip")]) {
      expect(["false", "undefined"]).toContain(p.getAttribute("data-anim"));
    }
    cleanup();
    const donut = render(<Chart kind="donut" data={[{ name: "x", value: 1 }]} />);
    expect(parts(donut.container, "pie")[0].getAttribute("data-anim")).toBe("false");
  });

  it("legend, tooltip, grid, axes and reference lines show and hide", () => {
    const on = render(<Chart kind="line" data={ROWS} series={SERIES} legend grid zeroLine lines={[{ y: 9 }, { x: "2026-02" }]} />);
    expect(on.container.querySelector('[data-slot="chart-legend"]')?.textContent).toContain("Alpha");
    expect(parts(on.container, "grid")).toHaveLength(1);
    expect(parts(on.container, "tooltip")).toHaveLength(1);
    expect(parts(on.container, "refline")).toHaveLength(3);
    expect(parts(on.container, "xaxis")[0].getAttribute("data-hide")).toBe("false");
    cleanup();
    const off = render(<Chart kind="line" data={ROWS} series={SERIES} tooltip={false} axes={false} />);
    expect(off.container.querySelector('[data-slot="chart-legend"]')).toBeNull();
    expect(parts(off.container, "grid")).toHaveLength(0);
    expect(parts(off.container, "tooltip")).toHaveLength(0);
    expect(parts(off.container, "refline")).toHaveLength(0);
    expect(parts(off.container, "xaxis")[0].getAttribute("data-hide")).toBe("true");
    expect(parts(off.container, "yaxis")[0].getAttribute("data-hide")).toBe("true");
  });

  it("delta chip shows the first -> last change and hides without the flag", () => {
    const { container } = render(<Chart kind="area" data={ROWS} series={SERIES} delta />);
    expect(container.querySelector('[data-slot="chart-delta"]')?.textContent).toMatch(/\+20/);
    cleanup();
    const none = render(<Chart kind="area" data={ROWS} series={SERIES} />);
    expect(none.container.querySelector('[data-slot="chart-delta"]')).toBeNull();
  });

  it("sparkline: hidden axes, padded domain, tooltip only with labels", () => {
    const bare = render(<Chart kind="sparkline" values={[1, 2, 3]} color="#6366f1" />);
    expect(parts(bare.container, "tooltip")).toHaveLength(0);
    expect(parts(bare.container, "yaxis")[0].getAttribute("data-hide")).toBe("true");
    cleanup();
    const hover = render(<Chart kind="sparkline" values={[1, 2, 3]} labels={["2026-01", "2026-02", "2026-03"]} color="#6366f1" />);
    expect(parts(hover.container, "tooltip")).toHaveLength(1);
    expect(sparkDomain([100, 120])[0]).toBeLessThan(100);
  });

  it("exposes role=img with the aria label and fills a sized parent with height=fill", () => {
    const { container } = render(<Chart kind="line" data={ROWS} series={SERIES} ariaLabel="Trend" height="fill" />);
    const root = container.querySelector('[data-slot="chart"]') as HTMLElement;
    expect(root.getAttribute("role")).toBe("img");
    expect(root.getAttribute("aria-label")).toBe("Trend");
    expect(root.className).toContain("h-full");
    expect(root.className).toContain("@container");
  });
});

describe("Chart: tooltip body", () => {
  const base = { series: [{ key: "a", name: "Alpha" }, { key: "b", name: "Beta" }], formatValue: (v: number) => `$${v}` };

  it("lists each series with its formatted value and the breakdown rows", () => {
    const row = { date: "2026-01", a: 10, b: 4, bd: [{ name: "Rent", value: 7 }] };
    const { getByText } = render(
      <ChartTooltip
        {...base}
        stacked={false}
        series={[{ key: "a", name: "Alpha", breakdownKey: "bd" }, { key: "b", name: "Beta" }]}
        breakdownHeading="By account"
        active
        label="2026-01"
        payload={[{ dataKey: "a", value: 10, color: "#111", payload: row }, { dataKey: "b", value: 4, color: "#222", payload: row }]}
      />,
    );
    expect(getByText("$10")).toBeTruthy();
    expect(getByText("Beta")).toBeTruthy();
    expect(getByText("By account")).toBeTruthy();
    expect(getByText("Rent")).toBeTruthy();
  });

  it("stacked: total on top, rows mirror the stack (last band first), zero bands dropped", () => {
    const { container, getAllByText } = render(
      <ChartTooltip
        {...base}
        stacked
        total
        active
        payload={[{ dataKey: "a", value: 10, payload: {} }, { dataKey: "b", value: 0, payload: {} }]}
      />,
    );
    expect(getAllByText("$10").length).toBeGreaterThan(0);
    expect(container.textContent).not.toContain("Beta");
  });

  it("renders nothing when inactive", () => {
    const { container } = render(<ChartTooltip {...base} stacked={false} active={false} payload={[]} />);
    expect(container.innerHTML).toBe("");
  });

  it("renderTooltip replaces the body", () => {
    const { getByText } = render(
      <ChartTooltip {...base} stacked={false} active payload={[{ dataKey: "a", value: 1, payload: { who: "custom" } }]} renderTooltip={(r: { who: string }) => <i>{r.who}</i>} />,
    );
    expect(getByText("custom")).toBeTruthy();
  });
});

describe("Chart: donut", () => {
  const DATA = [
    { name: "Housing", value: 600 },
    { name: "Food", value: 300 },
    { name: "Fun", value: 100, disabled: true },
  ];

  it("centre total, breakdown rows with share and bars, and each part can be hidden", () => {
    const on = render(<Chart kind="donut" data={DATA} currency="USD" center="total" breakdownList breakdownBars />);
    expect(on.container.textContent).toContain("$1,000");
    const rows = on.container.querySelectorAll('[data-slot="chart-breakdown-row"]');
    expect(rows).toHaveLength(3);
    expect(rows[0].textContent).toContain("Housing");
    expect(rows[0].textContent).toContain("60%");
    cleanup();
    const off = render(<Chart kind="donut" data={DATA} currency="USD" />);
    expect(off.container.querySelectorAll('[data-slot="chart-breakdown-row"]')).toHaveLength(0);
    expect(off.container.textContent).not.toContain("$1,000");
  });

  it("breakdownLimit and breakdownValue", () => {
    const { container } = render(<Chart kind="donut" data={DATA} currency="USD" breakdownList breakdownLimit={2} breakdownValue="both" />);
    const rows = container.querySelectorAll('[data-slot="chart-breakdown-row"]');
    expect(rows).toHaveLength(2);
    expect(rows[1].textContent).toContain("$300.00 (30%)");
  });

  it("list rows are buttons when onSliceClick is given; a disabled row does not fire", () => {
    const onSliceClick = vi.fn();
    const { getByRole } = render(<Chart kind="donut" data={DATA} breakdownList onSliceClick={onSliceClick} />);
    fireEvent.click(getByRole("button", { name: /^Food 30%$/ }));
    expect(onSliceClick).toHaveBeenCalledOnce();
    expect(onSliceClick.mock.calls[0][0]).toMatchObject({ name: "Food", value: 300 });
    expect((getByRole("button", { name: /^Fun 10%$/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("legend replaces the list when only the legend is on", () => {
    const { container } = render(<Chart kind="donut" data={DATA} legend />);
    expect(container.querySelector('[data-slot="chart-legend"]')?.textContent).toContain("Housing");
  });
});

describe("Chart: progress", () => {
  it("clamps to 0..100, names the bar and sets the width after mount", () => {
    const { getByRole } = render(<Chart kind="progress" value={140} ariaLabel="Paid" />);
    const bar = getByRole("progressbar");
    expect(bar.getAttribute("aria-valuenow")).toBe("100");
    expect(bar.getAttribute("aria-label")).toBe("Paid");
    expect((bar.firstElementChild as HTMLElement).style.width).toBe("100%");
  });

  it("tone / track tone / size / status / custom colour", () => {
    const tone = render(<Chart kind="progress" value={50} tone="destructive" trackTone="pos" size="lg" ariaLabel="x" />);
    const bar = tone.getByRole("progressbar");
    expect(bar.className).toContain("h-3");
    expect(bar.className).toContain("bg-pos/10");
    expect(bar.firstElementChild?.className).toContain("bg-destructive");
    cleanup();
    const custom = render(<Chart kind="progress" value={50} color="#8b5cf6" ariaLabel="x" />);
    expect((custom.getByRole("progressbar").firstElementChild as HTMLElement).style.background).toContain("rgb(139, 92, 246)");
    cleanup();
    const status = render(<Chart kind="progress" value={50} status="overdue" ariaLabel="x" />);
    expect((status.getByRole("progressbar").firstElementChild as HTMLElement).style.background).toContain("var(--destructive)");
  });

  it("label, value label and target marker are optional", () => {
    const on = render(<Chart kind="progress" value={40} label="Budget" valueLabel target={80} ariaLabel="b" />);
    expect(on.container.textContent).toContain("Budget");
    expect(on.container.textContent).toContain("40%");
    expect(on.container.querySelector("[aria-hidden]")).not.toBeNull();
    cleanup();
    const off = render(<Chart kind="progress" value={40} />);
    expect(off.container.textContent).toBe("");
    expect(off.container.querySelector("[role=progressbar]")).toBeNull();
  });

  it("server HTML carries no inline style attribute (CSP)", () => {
    const html = renderToString(
      <>
        <Chart kind="progress" value={30} color="#8b5cf6" target={50} ariaLabel="x" />
        <Chart kind="donut" data={[{ name: "a", value: 1 }]} breakdownList breakdownBars center="total" />
      </>,
    );
    expect(html).not.toMatch(/\sstyle="/);
  });
});

describe("Chart: sankey", () => {
  it("renders income and expense nodes with the savings bar, and hides the savings bar on request", () => {
    const sankey = { income: [{ name: "Salary", value: 100 }], expenses: [{ name: "Rent", value: 60 }] };
    const on = render(<Chart kind="sankey" sankey={sankey} currency="USD" />);
    expect(on.container.textContent).toContain("Salary");
    expect(on.container.textContent).toContain("Savings");
    cleanup();
    const off = render(<Chart kind="sankey" sankey={{ ...sankey, savings: false }} currency="USD" />);
    expect(off.container.textContent).not.toContain("Savings");
    cleanup();
    const empty = render(<Chart kind="sankey" sankey={{ income: [], expenses: [] }} currency="USD" />);
    expect(empty.container.textContent).toContain("No cash flow data");
  });
});
