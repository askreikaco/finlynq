/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import * as React from "react";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/goals",
}));

import { PageToolbar, MonthSwitcher, SearchToggle, FilterButton } from "@/components/page-toolbar";
import type { RangeSelection } from "@/lib/metrics/period";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-14T09:00:00"));
  push.mockClear();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function Harness(props: { initial?: RangeSelection; withSearch?: boolean; withFilter?: boolean; onRange?: (s: RangeSelection) => void }) {
  const [sel, setSel] = React.useState<RangeSelection>(props.initial ?? { range: "this_month" });
  const [q, setQ] = React.useState("");
  return (
    <PageToolbar
      range={{ selection: sel, onChange: (n) => { setSel(n); props.onRange?.(n); } }}
      search={props.withSearch === false ? undefined : { value: q, onChange: setQ }}
      filter={props.withFilter === false ? undefined : { href: "/filter/goals?returnTo=%2Fgoals", activeCount: 2 }}
    />
  );
}

describe("PageToolbar slots", () => {
  it("renders range, month switcher, search, filter in that order", () => {
    render(<Harness />);
    const bar = screen.getByTestId("page-toolbar");
    const order = ["Time range", "Previous month", "Next month", "Search", "Filter"].map((label) => {
      const el = within(bar).getByLabelText(label, { selector: "button, a, [role=combobox], input" });
      return { label, el };
    });
    for (let i = 0; i < order.length - 1; i++) {
      const rel = order[i].el.compareDocumentPosition(order[i + 1].el);
      expect(rel & Node.DOCUMENT_POSITION_FOLLOWING, `${order[i].label} before ${order[i + 1].label}`).toBeTruthy();
    }
  });

  it("omits slots that do not apply", () => {
    render(<Harness withSearch={false} withFilter={false} />);
    expect(screen.queryByLabelText("Search")).toBeNull();
    expect(screen.queryByLabelText("Filter")).toBeNull();
    expect(screen.getByLabelText("Time range")).toBeTruthy();
  });

  it("renders nothing without any slot", () => {
    const { container } = render(<PageToolbar />);
    expect(container.firstChild).toBeNull();
  });

  it("offers This month, This quarter, This year, Custom", async () => {
    render(<Harness />);
    fireEvent.click(screen.getByLabelText("Time range"));
    const options = await screen.findAllByRole("option");
    expect(options.map((o) => o.textContent)).toEqual(["This month", "This quarter", "This year", "Custom"]);
  });

  it("Custom reveals from / to dates and hides the month switcher", async () => {
    const seen: RangeSelection[] = [];
    render(<Harness onRange={(s) => seen.push(s)} />);
    await userEvent.click(screen.getByLabelText("Time range"));
    await userEvent.click(await screen.findByRole("option", { name: "Custom" }));
    expect(screen.getByLabelText("From date")).toBeTruthy();
    expect(screen.getByLabelText("To date")).toBeTruthy();
    expect(screen.queryByLabelText("Previous month")).toBeNull();
    expect(seen[0].range).toBe("custom");
    expect(seen[0].from).toMatch(/^2026-10-01$/);
    expect(seen[0].to).toMatch(/^2026-10-14$/);
  });
});

describe("MonthSwitcher", () => {
  it("steps back and forth, label follows, next is disabled on the current month", () => {
    render(<Harness />);
    const next = screen.getByLabelText("Next month") as HTMLButtonElement;
    expect(screen.getByTestId("month-label").textContent).toBe("Oct 2026");
    expect(next.disabled).toBe(true);
    fireEvent.click(screen.getByLabelText("Previous month"));
    expect(screen.getByTestId("month-label").textContent).toBe("Sep 2026");
    expect((screen.getByLabelText("Next month") as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByLabelText("Next month"));
    expect(screen.getByTestId("month-label").textContent).toBe("Oct 2026");
  });

  it("steps by the quarter and the year when those ranges are active", () => {
    render(<Harness initial={{ range: "this_quarter" }} />);
    expect(screen.getByTestId("month-label").textContent).toBe("Q4 2026");
    fireEvent.click(screen.getByLabelText("Previous quarter"));
    expect(screen.getByTestId("month-label").textContent).toBe("Q3 2026");
    cleanup();
    render(<Harness initial={{ range: "this_year" }} />);
    fireEvent.click(screen.getByLabelText("Previous year"));
    expect(screen.getByTestId("month-label").textContent).toBe("2025");
  });

  it("prev and next are icon-only buttons", () => {
    render(<MonthSwitcher selection={{ range: "this_month" }} onChange={() => {}} />);
    for (const name of ["Previous month", "Next month"]) {
      const b = screen.getByLabelText(name);
      expect(b.textContent).toBe("");
      expect(b.querySelector("svg")).toBeTruthy();
    }
  });

  it("renders nothing for a custom range", () => {
    const { container } = render(<MonthSwitcher selection={{ range: "custom", from: "2026-01-01", to: "2026-01-31" }} onChange={() => {}} />);
    expect(container.firstChild).toBeNull();
  });
});

describe("SearchToggle", () => {
  function Search() {
    const [v, setV] = React.useState("");
    return <SearchToggle value={v} onChange={setV} />;
  }
  it("is an icon button that expands an input in place", () => {
    render(<Search />);
    const btn = screen.getByLabelText("Search");
    expect(btn.textContent).toBe("");
    expect(screen.queryByRole("searchbox")).toBeNull();
    fireEvent.click(btn);
    const input = screen.getByRole("searchbox") as HTMLInputElement;
    expect(document.activeElement).toBe(input);
  });
  it("Escape clears and collapses; blur while empty collapses; blur with text stays open", () => {
    render(<Search />);
    fireEvent.click(screen.getByLabelText("Search"));
    let input = screen.getByRole("searchbox");
    fireEvent.change(input, { target: { value: "cof" } });
    fireEvent.blur(input);
    expect(screen.queryByRole("searchbox")).not.toBeNull();
    fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.queryByRole("searchbox")).toBeNull();
    fireEvent.click(screen.getByLabelText("Search"));
    input = screen.getByRole("searchbox");
    expect((input as HTMLInputElement).value).toBe("");
    fireEvent.blur(input);
    expect(screen.queryByRole("searchbox")).toBeNull();
  });
  it("starts expanded when a query is already set", () => {
    render(<SearchToggle value="rent" onChange={() => {}} />);
    expect((screen.getByRole("searchbox") as HTMLInputElement).value).toBe("rent");
  });
});

describe("FilterButton", () => {
  it("is icon-only: no visible text, aria-label Filter, funnel svg", () => {
    render(<FilterButton href="/filter/goals" />);
    const b = screen.getByRole("link", { name: "Filter" });
    expect(b.textContent).toBe("");
    expect(b.getAttribute("aria-label")).toBe("Filter");
    expect(b.querySelector("svg")).toBeTruthy();
    expect(screen.queryByTestId("filter-badge")).toBeNull();
  });
  it("links to the filter page and shows the active count", () => {
    render(<FilterButton href="/filter/goals?returnTo=%2Fgoals" activeCount={3} />);
    expect(screen.getByTestId("filter-badge").textContent).toBe("3");
    expect(screen.getByRole("link", { name: "Filter" }).getAttribute("href")).toBe("/filter/goals?returnTo=%2Fgoals");
  });
  it("a function href is re-read after each render (current address)", () => {
    let cur = "/filter/x?a=1";
    const { rerender } = render(<FilterButton href={() => cur} />);
    expect(screen.getByRole("link", { name: "Filter" }).getAttribute("href")).toBe("/filter/x?a=1");
    cur = "/filter/x?a=2";
    rerender(<FilterButton href={() => cur} activeCount={1} />);
    expect(screen.getByRole("link", { name: "Filter" }).getAttribute("href")).toBe("/filter/x?a=2");
  });
});
