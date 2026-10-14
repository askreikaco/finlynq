/**
 * @vitest-environment jsdom
 */
import "@testing-library/jest-dom";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";

const nav = vi.hoisted(() => ({ pathname: "/more" }));
vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));
vi.mock("@/components/more-menu", async () => {
  const ctx = await import("@/components/mobile/column-context");
  return {
    MoreMenu: () => {
      const cur = ctx.useColumnCurrent();
      return (
        <div data-testid="more-menu">
          <a href="/settings" aria-current={ctx.isCurrentRoute(cur, "/settings") ? "true" : undefined}>Settings</a>
          <a href="/goals" aria-current={ctx.isCurrentRoute(cur, "/goals") ? "true" : undefined}>Goals</a>
        </div>
      );
    },
  };
});
vi.mock("@/components/settings-hub", async () => {
  const ctx = await import("@/components/mobile/column-context");
  return {
    SettingsHub: () => {
      const cur = ctx.useColumnCurrent();
      return (
        <div data-testid="settings-hub">
          <a href="/settings/general" aria-current={ctx.isCurrentRoute(cur, "/settings/general") ? "true" : undefined}>General</a>
          <a href="/settings/about" aria-current={ctx.isCurrentRoute(cur, "/settings/about") ? "true" : undefined}>About</a>
        </div>
      );
    },
  };
});

import { ColumnShell, columnLevelFor, columnSelection } from "@/components/mobile/column-nav";

function setWidth(px: number) {
  Object.defineProperty(document.documentElement, "clientWidth", { configurable: true, value: px });
}

describe("columnLevelFor / columnSelection", () => {
  it("maps the family to column depth and nothing else", () => {
    expect(columnLevelFor("/more")).toBe(1);
    expect(columnLevelFor("/settings")).toBe(2);
    expect(columnLevelFor("/settings/")).toBe(2);
    expect(columnLevelFor("/settings/general")).toBe(3);
    expect(columnLevelFor("/settings/rules/12/edit")).toBe(3);
    expect(columnLevelFor("/settings-x")).toBeNull();
    expect(columnLevelFor("/portfolio")).toBeNull();
    expect(columnLevelFor("/connect")).toBeNull();
    expect(columnLevelFor(null)).toBeNull();
  });
  it("selects Settings in col 1 and the first page segment in col 2", () => {
    expect(columnSelection("/more")).toEqual({ col1: null, col2: null });
    expect(columnSelection("/settings")).toEqual({ col1: "/settings", col2: null });
    expect(columnSelection("/settings/general")).toEqual({ col1: "/settings", col2: "/settings/general" });
    expect(columnSelection("/settings/rules/12/edit")).toEqual({ col1: "/settings", col2: "/settings/rules" });
  });
});

describe("ColumnShell", () => {
  beforeEach(() => setWidth(1440));
  afterEach(() => setWidth(0));

  it("/more: col 1 is the leaf, no ancestors", () => {
    nav.pathname = "/more";
    const { container } = render(<ColumnShell><div data-testid="leaf" /></ColumnShell>);
    expect(container.querySelector('[data-column-pane="col1"] [data-testid="leaf"]')).not.toBeNull();
    expect(container.querySelector('[data-column-pane="col2"]')).toBeNull();
    expect(container.querySelector('[data-column-pane="col3"]')).toBeNull();
    expect(screen.queryByTestId("more-menu")).toBeNull();
  });

  it("/settings: More in col 1 (Settings marked), the leaf (hub) in col 2", () => {
    nav.pathname = "/settings";
    const { container } = render(<ColumnShell><div data-testid="leaf" /></ColumnShell>);
    expect(container.querySelector('[data-column-pane="col1"] [data-testid="more-menu"]')).not.toBeNull();
    expect(screen.getByText("Settings")).toHaveAttribute("aria-current", "true");
    expect(screen.getByText("Goals")).not.toHaveAttribute("aria-current");
    expect(container.querySelector('[data-column-pane="col2"] [data-testid="leaf"]')).not.toBeNull();
    expect(container.querySelector('[data-column-pane="col3"]')).toBeNull();
  });

  it("/settings/general: More, hub (General marked) and the leaf in col 3", () => {
    nav.pathname = "/settings/general";
    const { container } = render(<ColumnShell><div data-testid="leaf" /></ColumnShell>);
    expect(container.querySelector('[data-column-pane="col1"] [data-testid="more-menu"]')).not.toBeNull();
    expect(container.querySelector('[data-column-pane="col2"] [data-testid="settings-hub"]')).not.toBeNull();
    expect(container.querySelector('[data-column-pane="col3"] [data-testid="leaf"]')).not.toBeNull();
    expect(screen.getByText("General")).toHaveAttribute("aria-current", "true");
    expect(screen.getByText("About")).not.toHaveAttribute("aria-current");
    expect(container.querySelectorAll('[data-testid="leaf"]').length).toBe(1);
  });

  it("phone / portrait tablet: only the leaf renders, ancestors are unmounted", () => {
    setWidth(390);
    nav.pathname = "/settings/general";
    const { container } = render(<ColumnShell><div data-testid="leaf" /></ColumnShell>);
    expect(screen.queryByTestId("more-menu")).toBeNull();
    expect(screen.queryByTestId("settings-hub")).toBeNull();
    expect(container.querySelector('[data-column-pane="col3"] [data-testid="leaf"]')).not.toBeNull();
    setWidth(1024); // exactly 1024 is still `regular`
    const r2 = render(<ColumnShell><div data-testid="leaf" /></ColumnShell>);
    expect(r2.container.querySelector('[data-column-pane="col1"]')).toBeNull();
  });

  it("routes outside the family render the leaf untouched", () => {
    nav.pathname = "/portfolio";
    const { container } = render(<ColumnShell><div data-testid="leaf" /></ColumnShell>);
    expect(container.querySelector("[data-column-shell]")).toBeNull();
    expect(screen.getByTestId("leaf")).toBeInTheDocument();
  });
});
