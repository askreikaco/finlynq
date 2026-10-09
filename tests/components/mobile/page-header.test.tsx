/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import React from "react";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";

vi.mock("next/link", () => ({
  default: ({ children, href, ...p }: React.PropsWithChildren<{ href: string }>) => React.createElement("a", { href, ...p }, children),
}));

import { PageHeader, desktopClasses, HEADER_DESKTOP_ONLY } from "@/components/mobile";

afterEach(cleanup);
const cls = (el: HTMLElement) => el.className.split(/\s+/);

describe("PageHeader: mobile title", () => {
  it("renders an h1 with the native 30/700 title (text-3xl) below md", () => {
    render(<PageHeader title="Accounts" />);
    const h1 = screen.getByRole("heading", { level: 1, name: "Accounts" });
    expect(cls(h1)).toContain("text-3xl/9");
    expect(cls(h1)).toContain("font-bold");
  });

  it("shows the subtitle on phones in the bar (muted, one line) and keeps its original classes at md+", () => {
    render(<PageHeader title="Budgets" subtitle="Set limits" subtitleClassName="text-sm text-muted-foreground mt-0.5" />);
    const sub = screen.getByText("Set limits");
    expect(cls(sub)).toEqual(expect.arrayContaining(["block", "max-md:text-xs", "max-md:truncate", "text-sm", "text-muted-foreground", "mt-0.5"]));
    expect(cls(sub)).not.toContain("hidden");
  });
});

describe("PageHeader: desktop classes unchanged (md: variants)", () => {
  it("re-emits every original h1 class behind md:", () => {
    render(<PageHeader title="Portfolio" titleClassName="text-2xl font-bold tracking-tight" />);
    const c = cls(screen.getByRole("heading", { level: 1 }));
    expect(c).toEqual(expect.arrayContaining(["md:text-2xl", "md:font-bold", "md:tracking-tight"]));
  });

  it("resets tracking at md+ when the original h1 had none", () => {
    render(<PageHeader title="Accounts" titleClassName="text-2xl font-bold" />);
    const c = cls(screen.getByRole("heading", { level: 1 }));
    expect(c).toContain("md:tracking-normal");
    expect(c).not.toContain("md:tracking-tight");
  });

  it("keeps semibold / text-xl originals (dashboard, settings)", () => {
    render(<PageHeader title="Hi" titleClassName="text-xl font-semibold tracking-tight" />);
    expect(cls(screen.getByRole("heading", { level: 1 }))).toEqual(expect.arrayContaining(["md:text-xl", "md:font-semibold"]));
  });

  it("maps sm: originals to md: (below md the title is always 28)", () => {
    expect(desktopClasses("text-2xl sm:text-3xl font-bold")).toBe("md:text-3xl md:font-bold");
  });

  it("every un-prefixed size/weight class has an md: override", () => {
    render(<PageHeader title="X" titleClassName="text-2xl font-bold" />);
    const c = cls(screen.getByRole("heading", { level: 1 }));
    const unprefixed = c.filter((t) => /^(text-\[|font-)/.test(t));
    expect(unprefixed.length).toBeGreaterThan(0);
    expect(c.some((t) => t.startsWith("md:text-"))).toBe(true);
    expect(c.some((t) => t.startsWith("md:font-"))).toBe(true);
  });

  it("title only: one glass sticky phone bar, empty left spacer, title block centred", () => {
    const { container } = render(<PageHeader title="Solo" />);
    const wrap = container.firstElementChild as HTMLElement;
    expect(wrap.tagName).toBe("DIV");
    expect(wrap.getAttribute("data-slot")).toBe("page-header");
    expect(wrap.querySelector('[data-slot="page-header-actions"]')).toBeNull();
    const spacer = wrap.querySelector('[data-slot="page-header-spacer"]');
    expect(spacer?.textContent).toBe("");
    expect(cls(wrap)).toEqual(expect.arrayContaining(["glass-bar", "max-md:sticky", "max-md:-mx-4"]));
    const block = wrap.querySelector('[data-slot="page-header-title-block"]') as HTMLElement;
    expect(cls(block)).toEqual(expect.arrayContaining(["max-md:absolute", "max-md:inset-x-[3.75rem]", "max-md:pointer-events-none"]));
    expect(block.firstElementChild?.tagName).toBe("H1");
  });

  it("applies the original wrapper + actions classes verbatim", () => {
    const { container } = render(
      <PageHeader title="T" className="flex flex-wrap items-center justify-between gap-3" actionsClassName="flex gap-2" actions={<button>Go</button>} />,
    );
    const wrap = container.firstElementChild as HTMLElement;
    expect(cls(wrap)).toEqual(expect.arrayContaining(["flex", "flex-wrap", "items-center", "justify-between", "gap-3"]));
    expect(cls(wrap.querySelector("[data-slot=page-header-actions]") as HTMLElement)).toEqual(expect.arrayContaining(["flex", "gap-2"]));
  });
});

describe("PageHeader: overflow menu (Accounts-style)", () => {
  const onManage = vi.fn();
  const onArchived = vi.fn();
  const items = [
    { label: "Manage groups", onSelect: onManage },
    { label: "Show archived", onSelect: onArchived },
  ];

  it("shows a 44px, labelled, md:hidden ⋯ trigger and keeps the primary visible", () => {
    render(
      <PageHeader
        title="Accounts"
        overflow={items}
        actions={
          <>
            <button className={HEADER_DESKTOP_ONLY}>Manage groups</button>
            <button>Add</button>
          </>
        }
      />,
    );
    const trigger = screen.getByRole("button", { name: "More actions" });
    expect(cls(trigger)).toContain("md:hidden");
    expect(cls(trigger)).toContain("max-md:size-11");
    // secondary inline button is desktop-only; primary has no hide class
    expect(cls(screen.getByText("Manage groups", { selector: "button" }))).toContain("max-md:hidden");
    expect(cls(screen.getByText("Add"))).not.toContain("max-md:hidden");
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
