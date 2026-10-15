/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach } from "vitest";
import React from "react";
import { render, screen, cleanup } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Field } from "@/components/ui/field";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

afterEach(cleanup);
const cls = (s: string) => s.split(/\s+/);
const read = (p: string) => readFileSync(join(__dirname, "../../../", p), "utf8");

// Width-based tokens (sm:/md:/lg:/max-md:) must not carry a touch size. Pointer-based touch sizes use pointer-coarse:.
const WIDTH_TOKEN = /(^|\s)(max-)?(sm|md|lg|xl|2xl):/;

describe("pointer-based touch targets (pointer-coarse: 44px, every coarse device incl. iPad)", () => {
  it.each([
    ["md", false, "h-8", "pointer-coarse:h-11"],
    ["sm", false, "h-7", "pointer-coarse:h-11"],
    ["lg", false, "h-11", "pointer-coarse:h-11"],
    ["md", true, "size-8", "pointer-coarse:size-11"],
    ["sm", true, "size-7", "pointer-coarse:size-11"],
    ["lg", true, "size-11", "pointer-coarse:size-11"],
  ] as const)("Button size=%s iconOnly=%s keeps %s and adds %s", (size, iconOnly, desktop, touch) => {
    const c = cls(cn(buttonVariants({ size, iconOnly })));
    expect(c).toContain(desktop);
    expect(c).toContain(touch);
  });

  it("no Button size uses a width-based touch token", () => {
    for (const size of ["sm", "md", "lg", "fab"] as const) {
      for (const iconOnly of [false, true]) expect(cls(buttonVariants({ size, iconOnly })).filter((t) => WIDTH_TOKEN.test(` ${t}`))).toEqual([]);
    }
  });

  it("every rendered Button size class is pointer-scoped (no un-scoped size change)", () => {
    render(<Button>Go</Button>);
    const c = cls(screen.getByRole("button").className);
    expect(c).toContain("h-8");
    expect(c).toContain("pointer-coarse:h-11");
    expect(c.filter((t) => /^h-1[0-9]$|^size-1[0-9]$/.test(t))).toEqual([]);
  });

  it("Button exposes data-size so layout tests can tell sizes apart", () => {
    render(<Button size="sm">x</Button>);
    expect(screen.getByRole("button").getAttribute("data-size")).toBe("sm");
  });

  it("Field control: 44px at every width (h-11), 16px text on touch; compact is 32px with a 44px touch floor", () => {
    render(
      <>
        <Field aria-label="n" value="" onChange={() => {}} />
        <Field aria-label="c" compact value="" onChange={() => {}} />
      </>,
    );
    const [std, cmp] = Array.from(document.querySelectorAll('[data-slot="field-surface"]')) as HTMLElement[];
    const c = cls(std.className);
    expect(c).toContain("h-11");
    expect(c).toContain("text-base");
    expect(c).toContain("regular:pointer-fine:text-sm");
    expect(c.filter((t) => WIDTH_TOKEN.test(` ${t}`))).toEqual([]);
    const k = cls(cmp.className);
    expect(k).toContain("h-8");
    expect(k).toContain("pointer-coarse:h-11");
  });

  it("Select trigger: 44px on every pointer, 44px option rows on touch, no width tokens", () => {
    const src = read("src/components/ui/field/select-base.tsx");
    expect(src).toContain("CONTROL_BOX");
    expect(src).toContain("pointer-coarse:min-h-11");
    expect(src).not.toMatch(/max-md:/);
  });

  it("Tabs list: h-8 everywhere, pointer-coarse:h-11 for touch; still horizontally scrollable", () => {
    render(
      <Tabs defaultValue="a">
        <TabsList data-testid="l">
          <TabsTrigger value="a">A</TabsTrigger>
        </TabsList>
      </Tabs>,
    );
    const c = cls(screen.getByTestId("l").className);
    expect(c).toContain("group-data-horizontal/tabs:h-8");
    expect(c).toContain("pointer-coarse:group-data-horizontal/tabs:h-11");
    expect(c).toContain("overflow-x-auto");
    expect(c.filter((t) => WIDTH_TOKEN.test(` ${t}`))).toEqual([]);
  });

  it("Card padding is a layout token: py-3 by default, regular:py-4 from 640px", () => {
    const src = read("src/components/ui/card.tsx");
    expect(src).toContain("py-3 regular:py-4");
    expect(src).not.toMatch(/max-md:/);
  });
});

describe("app shell below md", () => {
  it("(app) layout: flat bg + tight top padding below md, desktop padding unchanged", () => {
    const l = read("src/app/(app)/layout.tsx");
    expect(l).toContain("px-4 pt-0 pb-3 regular:px-6 regular:pt-0 regular:pb-8 wide:px-8");
    // Main pads for the PageFab on phones; no padding on desktop
    expect(l).toContain("pb-[calc(var(--mobile-bar-clearance)+16px)] regular:pb-0");
    // Assert bg-dot-pattern is still present
    expect(l).toMatch(/bg-dot-pattern/);
  });

  it("globals.css: dot/glow off and sans amounts under 48rem only, pos/neg tokens exist", () => {
    const css = read("src/app/globals.css");
    expect(css).toMatch(/@media \(width < 48rem\) \{\s*\.bg-dot-pattern \{ background-image: none !important; \}\s*\}/);
    // The dark ambient glow (.ambient-glow::after) is removed everywhere, not just below 48rem.
    expect(css).not.toContain(".ambient-glow::after");
    expect(css).not.toContain(".dark .ambient-glow::after");
    expect(css).not.toContain("color-mix(in oklab, var(--primary) 10%, transparent)");
    expect(css).toMatch(/@media \(width < 48rem\) \{\s*\.tabular-nums, \[data-value\] \{\s*font-family: var\(--font-ui\);/);
    expect(css).toContain("--color-pos: var(--pos)");
    expect(css).toContain("--color-neg: var(--destructive)");
    // existing `font-mono` amounts switch too (inside <main>, minus code/keys), still only under 48rem
    expect(css).toMatch(/@media \(width < 48rem\) \{[^@]*main \.font-mono:not\(pre, code, kbd, samp, textarea, input, \.break-all, \.select-all, \[data-keep-mono\]\)/);
    // the unscoped mono rule is still there for md+
    expect(css).toMatch(/\.tabular-nums, \[data-value\] \{\s*font-family: var\(--font-stack-mono\);/);
  });
});
