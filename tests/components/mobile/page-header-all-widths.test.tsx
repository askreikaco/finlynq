/**
 * @vitest-environment jsdom
 */
// One top bar at every width (owner 2026-10-13): the phone bar is the only header design. No regular:/wide:
// layout classes on the bar, back + title + right action group share one grid, secondary actions live in More.
import { describe, it, expect, afterEach, vi } from "vitest";
import React from "react";
import * as fs from "fs";
import * as path from "path";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";

vi.mock("next/link", () => ({
  default: ({ children, href, ...p }: React.PropsWithChildren<{ href: string }>) => React.createElement("a", { href, ...p }, children),
}));
vi.mock("@/components/adaptive/use-back-target", () => ({
  useBackTarget: () => ({ level: 2, href: "/accounts", label: "Accounts" }),
}));

import { PageHeader, HEADER_SECONDARY } from "@/components/mobile";
import { PHONE_BAR, PHONE_BAR_RIGHT, PHONE_BAR_CENTER, PHONE_CAPSULE } from "@/components/mobile/page-header";

afterEach(cleanup);
const cls = (el: Element | null) => (el?.getAttribute("class") ?? "").split(/\s+/).filter(Boolean);
const VARIANT = /(^|\s)(max-)?(regular|wide):/;

function renderBar() {
  const onSelect = vi.fn();
  const utils = render(
    <PageHeader
      title="Checking"
      subtitle="Bank"
      overflow={[{ label: "Export CSV", onSelect }]}
      actions={
        <>
          <button className={HEADER_SECONDARY}>Export CSV</button>
          <button>Add</button>
        </>
      }
    />,
  );
  return { ...utils, onSelect };
}

describe("PageHeader at every width: no desktop layout branch", () => {
  it("(a) the layout constants carry no regular:/wide: (or max-regular:) classes", () => {
    for (const c of [PHONE_BAR, PHONE_BAR_RIGHT, PHONE_BAR_CENTER, PHONE_CAPSULE, HEADER_SECONDARY]) {
      expect(c).not.toMatch(VARIANT);
    }
  });

  it("(a) no rendered element of the bar carries a regular:/wide: layout class", () => {
    const { container } = renderBar();
    const bar = container.querySelector('[data-slot="page-header"]') as HTMLElement;
    for (const el of [bar, ...Array.from(bar.querySelectorAll("*"))]) {
      const own = cls(el).filter((t) => /^(max-)?(regular|wide):/.test(t) && !/^(pointer-coarse|hover|focus|data-|aria-|dark)/.test(t));
      // Third-party primitives (Button, menu) may carry their own variants; the bar's own elements must not.
      if (el === bar || el.getAttribute("data-slot")?.startsWith("page-header")) expect(own).toEqual([]);
    }
  });

  it("the page-header.tsx source has no regular:/wide: classes at all", () => {
    const src = fs.readFileSync(path.join(process.cwd(), "src/components/mobile/page-header.tsx"), "utf-8");
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(code).not.toMatch(/(?<![\w-])(max-)?(regular|wide):/);
  });
});

describe("PageHeader at every width: back, title and right group share one grid", () => {
  it("(b) renders the back button from the auto back target, with title and the right action group in the same grid", () => {
    const { container } = renderBar();
    const bar = container.querySelector('[data-slot="page-header"]') as HTMLElement;
    expect(cls(bar)).toEqual(expect.arrayContaining(["grid", "glass-bar", "sticky", "page-header-bleed"]));
    const back = bar.querySelector('[data-slot="back-button"]') as HTMLElement;
    expect(back.getAttribute("href")).toBe("/accounts");
    expect(cls(back)).toEqual(expect.arrayContaining(["size-11", "rounded-full"]));
    const block = bar.querySelector('[data-slot="page-header-title-block"]') as HTMLElement;
    const actions = bar.querySelector('[data-slot="page-header-actions"]') as HTMLElement;
    expect(cls(block)).toContain("col-start-2");
    expect(cls(actions)).toContain("col-start-3");
    // back is a grid item (its wrapper is display: contents) and all three live in the bar
    for (const el of [back, block, actions]) expect(bar.contains(el)).toBe(true);
    expect(block.querySelector("h1")?.textContent).toBe("Checking");
    expect(within(actions).getByRole("button", { name: "Add" })).toBeTruthy();
  });

  it("an explicit backHref/onBack also shows the back button", () => {
    const onBack = vi.fn();
    render(<PageHeader title="X" onBack={onBack} />);
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});

describe("PageHeader at every width: secondary actions", () => {
  it("(c) secondary actions are not in the bar (hidden marker) but present in the overflow menu", async () => {
    const { container, onSelect } = renderBar();
    const bar = container.querySelector('[data-slot="page-header"]') as HTMLElement;
    const inline = within(bar).getByText("Export CSV", { selector: "button" });
    // display:none at every width: never takes a bar slot
    expect(cls(inline)).toEqual(expect.arrayContaining(["header-secondary", "hidden"]));
    // the primary stays a visible bar control
    expect(cls(within(bar).getByRole("button", { name: "Add" }))).not.toContain("hidden");

    fireEvent.click(within(bar).getByRole("button", { name: "More actions" }));
    const menu = await screen.findByRole("menu");
    const item = within(menu).getByRole("menuitem", { name: "Export CSV" });
    fireEvent.click(item);
    expect(onSelect).toHaveBeenCalledTimes(1);
  });
});
