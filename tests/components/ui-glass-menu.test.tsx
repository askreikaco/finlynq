/**
 * @vitest-environment jsdom
 */
// Glass menu: the DropdownMenu primitive is the iOS-style liquid-glass panel by default (desktop too).
// Pins the panel, row, separator, icon/description/destructive API, motion-safe animation, roles,
// keyboard navigation, and the CSS tokens/fallbacks in globals.css.
import { describe, it, expect, afterEach, vi } from "vitest";
import React from "react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { resolvedDecls } from "../helpers/css-tokens";
import { render, screen, cleanup, fireEvent, within, act } from "@testing-library/react";
import { Share2, Trash2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuGroup,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

afterEach(cleanup);

const root = join(__dirname, "../..");
const primitiveSrc = readFileSync(join(root, "src/components/ui/dropdown-menu.tsx"), "utf8");
const css = readFileSync(join(root, "src/app/globals.css"), "utf8");
const cls = (el: Element | null | undefined) => (el?.getAttribute("class") ?? "").split(/\s+/);

function Harness({ items }: { items?: React.ReactNode }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger>Open menu</DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuGroup>
          <DropdownMenuLabel>Share</DropdownMenuLabel>
          <DropdownMenuItem icon={<Share2 />} description="feature/glass-menu">
            Share link
          </DropdownMenuItem>
          <DropdownMenuItem>Plain row</DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem variant="destructive" icon={<Trash2 />}>
            Archive
          </DropdownMenuItem>
        </DropdownMenuGroup>
        {items}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

async function openMenu() {
  fireEvent.click(screen.getByRole("button", { name: "Open menu" }));
  return screen.findByRole("menu");
}

describe("glass menu: panel", () => {
  it("content is the glass panel with a 28px radius and no bg-popover/ring/shadow-md", async () => {
    render(<Harness />);
    const menu = await openMenu();
    const c = cls(menu);
    expect(c).toContain("glass-menu");
    expect(c).toContain("rounded-[28px]");
    expect(c).toContain("min-w-56");
    expect(c).toContain("max-w-[calc(100vw-2rem-var(--sal,0px)-var(--sar,0px))]");
    expect(c).not.toContain("bg-popover");
    expect(c).not.toContain("shadow-md");
    expect(c).not.toContain("ring-1");
  });

  it("the panel keeps the menu role and is the dropdown-menu-content slot", async () => {
    render(<Harness />);
    const menu = await openMenu();
    expect(menu.getAttribute("data-slot")).toBe("dropdown-menu-content");
  });

  it("the positioner keeps 12px collision padding and the 8px sideOffset in the source", () => {
    expect(primitiveSrc).toMatch(/collisionPadding=\{12\}/);
    expect(primitiveSrc).toMatch(/sideOffset = 8/);
  });
});

describe("glass menu: rows", () => {
  it("every item is at least 44px tall (min-h-11) with a rounded-xl highlight state", async () => {
    render(<Harness />);
    const menu = await openMenu();
    const items = within(menu).getAllByRole("menuitem");
    expect(items.length).toBe(3);
    for (const it of items) {
      expect(cls(it)).toContain("min-h-11");
      expect(cls(it)).toContain("rounded-xl");
      expect(cls(it)).toContain("px-4");
    }
    expect(primitiveSrc).toMatch(/data-highlighted:bg-\(--menu-highlight\)/);
  });

  it("an icon renders as a leading 22px element before the label", async () => {
    render(<Harness />);
    const menu = await openMenu();
    const row = within(menu).getByRole("menuitem", { name: /Share link/ });
    const icon = row.querySelector('[data-slot="dropdown-menu-item-icon"]');
    expect(icon).not.toBeNull();
    expect(cls(icon)).toEqual(expect.arrayContaining(["size-[22px]", "shrink-0"]));
    // DOM order: icon first, then the label text.
    expect(row.firstElementChild).toBe(icon);
    expect(row.textContent).toContain("Share link");
  });

  it("a description renders as a smaller grey second line under the label", async () => {
    render(<Harness />);
    const menu = await openMenu();
    const row = within(menu).getByRole("menuitem", { name: /Share link/ });
    const desc = row.querySelector('[data-slot="dropdown-menu-item-description"]');
    expect(desc?.textContent).toBe("feature/glass-menu");
    expect(cls(desc)).toEqual(expect.arrayContaining(["text-xs", "text-(--menu-muted)"]));
  });

  it("rows without an icon or description keep their plain children (no spacer)", async () => {
    render(<Harness />);
    const menu = await openMenu();
    const plain = within(menu).getByRole("menuitem", { name: "Plain row" });
    expect(plain.querySelector('[data-slot="dropdown-menu-item-icon"]')).toBeNull();
    expect(plain.querySelector('[data-slot="dropdown-menu-item-description"]')).toBeNull();
    expect(plain.textContent).toBe("Plain row");
  });

  it("destructive rows carry the destructive variant and the red token colour", async () => {
    render(<Harness />);
    const menu = await openMenu();
    const archive = within(menu).getByRole("menuitem", { name: /Archive/ });
    expect(archive.getAttribute("data-variant")).toBe("destructive");
    expect(cls(archive)).toContain("data-[variant=destructive]:text-(--menu-destructive)");
  });
});

describe("glass menu: separator and label", () => {
  it("separator is an inset hairline (mx-4, h-px, --menu-hairline), not full width", async () => {
    render(<Harness />);
    const menu = await openMenu();
    const sep = menu.querySelector('[data-slot="dropdown-menu-separator"]');
    expect(sep).not.toBeNull();
    expect(cls(sep)).toEqual(expect.arrayContaining(["mx-4", "h-px", "bg-(--menu-hairline)"]));
    expect(cls(sep)).not.toContain("-mx-1");
  });

  it("group labels use the muted menu token", async () => {
    render(<Harness />);
    const menu = await openMenu();
    const label = within(menu).getByText("Share");
    expect(cls(label)).toContain("text-(--menu-muted)");
  });
});

describe("glass menu: motion, tokens and layout", () => {
  it("entry and exit animations are motion-safe only (reduced-motion respected)", () => {
    expect(primitiveSrc).toMatch(/motion-safe:data-open:animate-in/);
    expect(primitiveSrc).toMatch(/motion-safe:data-closed:animate-out/);
    // No bare data-open/data-closed animate classes: every one is prefixed.
    expect(primitiveSrc).not.toMatch(/(?<!motion-safe:)data-open:animate-in/);
    expect(primitiveSrc).not.toMatch(/(?<!motion-safe:)data-closed:animate-out/);
    expect(primitiveSrc).toMatch(/duration-150/);
  });

  it("uses no viewport breakpoint tokens (sm:/md:/lg:/xl:/2xl:, max- prefixed too)", () => {
    expect(primitiveSrc).not.toMatch(/(?<![\w-])(max-)?(sm|md|lg|xl|2xl):/);
  });

  it("the glass-menu CSS carries blur 24px saturate 1.8 (spec 6.2 large glass) with the -webkit- prefix and an inset rim", () => {
    // Literal values live in --glass-menu-* tokens now; assert the resolved declarations (light theme).
    const block = resolvedDecls(css, ".glass-menu", "light");
    expect(block).toMatch(/-webkit-backdrop-filter:\s*blur\(24px\) saturate\(1\.8\)/);
    expect(block).toMatch(/\n\s+backdrop-filter:\s*blur\(24px\) saturate\(1\.8\)/);
    expect(block).toMatch(/box-shadow:\s*inset 0 0 0 1px oklch\(1 0 0 \/ 6%\)/);
    expect(block).toMatch(/background:\s*oklch\(0\.2 0\.008 250 \/ 78%\)/);
  });

  it("opaque fallbacks exist for no backdrop-filter and prefers-reduced-transparency", () => {
    const sup = css.slice(css.indexOf("@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {\n  .glass-menu"));
    expect(sup.slice(0, 200)).toContain(".glass-menu");
    expect(sup.slice(0, 200)).toContain("background: var(--menu-solid);");
    const rt = css.slice(css.indexOf("@media (prefers-reduced-transparency: reduce) {\n  .glass-menu"));
    expect(rt.slice(0, 200)).toContain("background: var(--menu-solid);");
    expect(rt.slice(0, 200)).toContain("backdrop-filter: none;");
  });
});

describe("glass menu: roles and keyboard", () => {
  it("keeps menu and menuitem roles and runs the item's onClick", async () => {
    const onShare = vi.fn();
    render(
      <DropdownMenu>
        <DropdownMenuTrigger>Open menu</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem icon={<Share2 />} onClick={onShare}>Share</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>,
    );
    const menu = await openMenu();
    const item = within(menu).getByRole("menuitem", { name: "Share" });
    fireEvent.click(item);
    expect(onShare).toHaveBeenCalledTimes(1);
  });

  it("arrow keys move the highlight between rows", async () => {
    render(<Harness />);
    const menu = await openMenu();
    const highlighted = () =>
      within(menu).getAllByRole("menuitem").filter((el) => el.hasAttribute("data-highlighted"));
    await act(async () => {
      fireEvent.keyDown(menu, { key: "ArrowDown" });
    });
    expect(highlighted()).toHaveLength(1);
    const after1 = highlighted()[0];
    await act(async () => {
      fireEvent.keyDown(menu, { key: "ArrowDown" });
    });
    expect(highlighted()).toHaveLength(1);
    const after2 = highlighted()[0];
    expect(after1).not.toBe(after2);
  });
});

