/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import React from "react";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";

vi.mock("next/link", () => ({
  default: ({ children, href, ...p }: React.PropsWithChildren<{ href: string }>) => React.createElement("a", { href, ...p }, children),
}));

import { PageHeader, HEADER_SECONDARY, HEADER_DESKTOP_ONLY } from "@/components/mobile";

afterEach(cleanup);
const cls = (el: HTMLElement) => el.className.split(/\s+/);

describe("PageHeader: one title for every size", () => {
  it("below regular the title is the system headline (text-base semibold)", () => {
    render(<PageHeader title="Accounts" />);
    const c = cls(screen.getByRole("heading", { level: 1, name: "Accounts" }));
    expect(c).toEqual(expect.arrayContaining(["max-regular:text-base", "max-regular:font-semibold", "max-regular:truncate"]));
  });

  it("from regular the title is text-3xl/9 extrabold (28/800 by D4, no arbitrary size)", () => {
    render(<PageHeader title="Portfolio" />);
    const c = cls(screen.getByRole("heading", { level: 1, name: "Portfolio" }));
    expect(c).toEqual(expect.arrayContaining(["text-3xl/9", "font-extrabold", "tracking-tight"]));
    expect(c.some((t) => /^text-\[/.test(t))).toBe(false);
    expect(c).not.toContain("font-bold");
  });

  it("ignores the deprecated titleClassName (accepted, no classes taken from it)", () => {
    render(<PageHeader title="Hi" titleClassName="text-xl font-semibold tracking-wide" />);
    const c = cls(screen.getByRole("heading", { level: 1 }));
    expect(c).not.toContain("text-xl");
    expect(c).not.toContain("tracking-wide");
    expect(c).toContain("text-3xl/9");
  });

  it("shows the subtitle at every size: a phone caption below regular, text-sm from regular", () => {
    render(<PageHeader title="Budgets" subtitle="Set limits" subtitleClassName="text-lg italic" />);
    const sub = screen.getByText("Set limits");
    expect(cls(sub)).toEqual(expect.arrayContaining(["block", "text-sm", "text-muted-foreground", "max-regular:text-xs", "max-regular:truncate"]));
    expect(cls(sub)).not.toContain("hidden");
    expect(cls(sub)).not.toContain("italic");
  });
});

describe("PageHeader: layout at regular and up", () => {
  it("applies the page's wrapper and actions classes verbatim at every size", () => {
    const { container } = render(
      <PageHeader title="T" className="flex flex-wrap items-center justify-between gap-3" actionsClassName="flex gap-2" actions={<button>Go</button>} />,
    );
    const wrap = container.firstElementChild as HTMLElement;
    expect(cls(wrap)).toEqual(expect.arrayContaining(["flex", "flex-wrap", "items-center", "justify-between", "gap-3"]));
    expect(cls(wrap.querySelector("[data-slot=page-header-actions]") as HTMLElement)).toEqual(expect.arrayContaining(["flex", "gap-2"]));
  });

  it("title only: one sticky bar at every size, empty left spacer, title in the middle column", () => {
    const { container } = render(<PageHeader title="Solo" />);
    const wrap = container.firstElementChild as HTMLElement;
    expect(wrap.tagName).toBe("DIV");
    expect(wrap.getAttribute("data-slot")).toBe("page-header");
    expect(wrap.querySelector('[data-slot="header-capsule"]')).toBeNull();
    const spacer = wrap.querySelector('[data-slot="page-header-spacer"]');
    expect(spacer?.textContent).toBe("");
    // sticky is not gated by a size variant (D5)
    expect(cls(wrap)).toEqual(expect.arrayContaining(["sticky", "z-30"]));
    expect(cls(wrap)).not.toContain("max-regular:sticky");
    expect(cls(wrap)).not.toContain("regular:sticky");
    // below regular: the grid bar; from regular: opaque, no glass
    expect(cls(wrap)).toEqual(expect.arrayContaining(["max-regular:-mx-4", "max-regular:grid", "regular:bg-background/90"]));
    const block = wrap.querySelector('[data-slot="page-header-title-block"]') as HTMLElement;
    expect(cls(block)).toEqual(expect.arrayContaining(["max-regular:col-start-2", "max-regular:min-w-0", "max-regular:pointer-events-none"]));
    expect(block.firstElementChild?.tagName).toBe("H1");
  });

  it("the back button is rendered at every size when backHref is passed", () => {
    const { container } = render(<PageHeader title="Edit" backHref="/accounts" />);
    const back = container.querySelector('[data-slot="back-button"]') as HTMLElement;
    expect(back.getAttribute("href")).toBe("/accounts");
    expect(cls(back)).toEqual(expect.arrayContaining(["min-h-11", "min-w-11"]));
    expect(cls(back).some((t) => t === "hidden" || t.endsWith(":hidden"))).toBe(false);
    expect(cls(back)).toEqual(expect.arrayContaining(["max-regular:size-11", "max-regular:rounded-full"]));
  });
});

describe("PageHeader: secondary actions (HEADER_SECONDARY)", () => {
  it("HEADER_SECONDARY hides below regular and is visible from regular up", () => {
    expect(HEADER_SECONDARY).toBe("max-regular:hidden");
  });

  it("HEADER_DESKTOP_ONLY is an alias with the same value", () => {
    expect(HEADER_DESKTOP_ONLY).toBe(HEADER_SECONDARY);
  });

  it("the desktopClasses() path is gone from the barrel", async () => {
    const barrel = await import("@/components/mobile");
    expect(barrel).not.toHaveProperty("desktopClasses");
  });
});

describe("PageHeader: overflow menu (Accounts-style)", () => {
  const onManage = vi.fn();
  const onArchived = vi.fn();
  const items = [
    { label: "Manage groups", onSelect: onManage },
    { label: "Show archived", onSelect: onArchived },
  ];

  it("shows a 44px, labelled ⋯ trigger below regular, keeps the primary visible, hides secondaries below regular", () => {
    render(
      <PageHeader
        title="Accounts"
        overflow={items}
        actions={
          <>
            <button className={HEADER_SECONDARY}>Manage groups</button>
            <button>Add</button>
          </>
        }
      />,
    );
    const trigger = screen.getByRole("button", { name: "More actions" });
    expect(cls(trigger)).toContain("regular:hidden");
    expect(cls(trigger)).toContain("pointer-coarse:size-11");
    expect(cls(screen.getByText("Manage groups", { selector: "button" }))).toContain("max-regular:hidden");
    expect(cls(screen.getByText("Add"))).not.toContain("max-regular:hidden");
  });

  it("the primary is the last child that is not a secondary action", () => {
    render(
      <PageHeader
        title="Accounts"
        actions={
          <>
            <button>Add</button>
            <button className={HEADER_SECONDARY}>Archive</button>
          </>
        }
      />,
    );
    expect(cls(screen.getByText("Add"))).toContain("phone-icon-action");
    expect(cls(screen.getByText("Archive"))).not.toContain("phone-icon-action");
  });

  it("opens an accessible menu with every secondary action and runs it", async () => {
    render(<PageHeader title="Accounts" overflow={items} actions={<button>Add</button>} />);
    fireEvent.click(screen.getByRole("button", { name: "More actions" }));
    const menu = await screen.findByRole("menu");
    const entries = within(menu).getAllByRole("menuitem");
    expect(entries.map((e) => e.textContent)).toEqual(["Manage groups", "Show archived"]);
    for (const e of entries) expect(cls(e)).toContain("min-h-11");
    fireEvent.click(entries[0]);
    expect(onManage).toHaveBeenCalledTimes(1);
  });

  it("renders no overflow trigger when there are no secondary actions", () => {
    render(<PageHeader title="Goals" actions={<button>Add Goal</button>} />);
    expect(screen.queryByRole("button", { name: "More actions" })).toBeNull();
  });
});
