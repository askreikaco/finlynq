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
  it("the title is the system headline (text-base semibold) at every width", () => {
    render(<PageHeader title="Accounts" />);
    const c = cls(screen.getByRole("heading", { level: 1, name: "Accounts" }));
    expect(c).toEqual(expect.arrayContaining(["text-base", "font-semibold", "truncate"]));
  });

  it("there is no separate desktop title style (no text-3xl / extrabold, no arbitrary size)", () => {
    render(<PageHeader title="Portfolio" />);
    const c = cls(screen.getByRole("heading", { level: 1, name: "Portfolio" }));
    expect(c).not.toContain("text-3xl/9");
    expect(c).not.toContain("font-extrabold");
    expect(c.some((t) => /^text-\[/.test(t) || t.includes("regular:"))).toBe(false);
    expect(c).not.toContain("font-bold");
  });

  it("ignores the deprecated titleClassName (accepted, no classes taken from it)", () => {
    render(<PageHeader title="Hi" titleClassName="text-xl font-semibold tracking-wide" />);
    const c = cls(screen.getByRole("heading", { level: 1 }));
    expect(c).not.toContain("text-xl");
    expect(c).not.toContain("tracking-wide");
    expect(c).toContain("text-base");
  });

  it("shows no subtitle line at any size (the text is only in the InfoTip)", () => {
    render(<PageHeader title="Budgets" subtitle="Set limits" subtitleClassName="text-lg italic" />);
    expect(screen.queryByText("Set limits")).toBeNull();
    expect(screen.getByRole("button", { name: "About Budgets" })).toBeTruthy();
  });
});

describe("PageHeader: layout (same at every width)", () => {
  it("the bar grid wins over a page's conflicting wrapper classes; actionsClassName is ignored", () => {
    const { container } = render(
      <PageHeader title="T" className="flex flex-wrap items-start justify-between" actionsClassName="flex gap-5 regular:w-auto" actions={<button>Go</button>} />,
    );
    const wrap = container.firstElementChild as HTMLElement;
    expect(cls(wrap)).toEqual(expect.arrayContaining(["grid", "items-center"]));
    expect(cls(wrap)).not.toContain("flex");
    expect(cls(wrap)).not.toContain("items-start");
    const actions = wrap.querySelector("[data-slot=page-header-actions]") as HTMLElement;
    expect(cls(actions)).toContain("col-start-3");
    expect(cls(actions)).not.toContain("gap-5");
    expect(cls(actions)).not.toContain("regular:w-auto");
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
    // the same grid glass bar at every width
    expect(cls(wrap)).toEqual(expect.arrayContaining(["page-header-bleed", "grid", "glass-bar"]));
    expect(cls(wrap).some((t) => t.includes("regular:"))).toBe(false);
    const block = wrap.querySelector('[data-slot="page-header-title-block"]') as HTMLElement;
    expect(cls(block)).toEqual(expect.arrayContaining(["col-start-2", "min-w-0", "pointer-events-none"]));
    expect(block.firstElementChild?.tagName).toBe("H1");
  });

  it("the back button is rendered at every size when backHref is passed", () => {
    const { container } = render(<PageHeader title="Edit" backHref="/accounts" />);
    const back = container.querySelector('[data-slot="back-button"]') as HTMLElement;
    expect(back.getAttribute("href")).toBe("/accounts");
    expect(cls(back)).toEqual(expect.arrayContaining(["size-11", "rounded-full"]));
    expect(cls(back).some((t) => t === "hidden" || t.endsWith(":hidden"))).toBe(false);
  });
});

describe("PageHeader: secondary actions (HEADER_SECONDARY)", () => {
  it("HEADER_SECONDARY hides at every width (it is reachable in the overflow menu)", () => {
    expect(HEADER_SECONDARY).toBe("header-secondary hidden");
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

  it("shows a 44px, labelled ⋯ trigger below regular, keeps the primary visible, hides secondaries at every width", () => {
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
    // More is the header group's first button at every size (not phone-only)
    expect(cls(trigger)).not.toContain("regular:hidden");
    expect(cls(trigger)).toContain("pointer-coarse:size-11");
    expect(cls(screen.getByText("Manage groups", { selector: "button" }))).toContain("hidden");
    expect(cls(screen.getByText("Add"))).not.toContain("hidden");
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
