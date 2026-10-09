/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach } from "vitest";
import React from "react";
import { render, screen, cleanup } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

afterEach(cleanup);
const cls = (s: string) => s.split(/\s+/);
const read = (p: string) => readFileSync(join(__dirname, "../../../", p), "utf8");

// Width-based tokens (sm:/md:/lg:/max-md:) must not carry a touch size. Pointer-based touch sizes use pointer-coarse:.
const WIDTH_TOKEN = /(^|\s)(max-)?(sm|md|lg|xl|2xl):/;

describe("pointer-based touch targets (pointer-coarse: 44px, every coarse device incl. iPad)", () => {
  it.each([
    ["default", "h-8", "pointer-coarse:h-11"],
    ["sm", "h-7", "pointer-coarse:h-11"],
    ["lg", "h-9", "pointer-coarse:h-11"],
    ["icon", "size-8", "pointer-coarse:size-11"],
    ["icon-sm", "size-7", "pointer-coarse:size-11"],
    ["icon-lg", "size-9", "pointer-coarse:size-11"],
  ] as const)("Button size=%s keeps %s and adds %s", (size, desktop, touch) => {
    const c = cls(buttonVariants({ size }));
    expect(c).toContain(desktop);
    expect(c).toContain(touch);
  });

  it("xs buttons keep their box but extend the hit area to >=44px on coarse pointers", () => {
    const c = cls(buttonVariants({ size: "xs" }));
    expect(c).toContain("h-6");
    expect(c).toContain("pointer-coarse:before:-inset-2.5");
    expect(c).toContain("pointer-coarse:relative");
  });

  it("no Button size uses a width-based touch token", () => {
    for (const size of ["default", "xs", "sm", "lg", "icon", "icon-xs", "icon-sm", "icon-lg"] as const) {
      expect(cls(buttonVariants({ size })).filter((t) => WIDTH_TOKEN.test(` ${t}`))).toEqual([]);
    }
  });

  it("every rendered Button size class is pointer-scoped (no un-scoped size change)", () => {
    render(<Button>Go</Button>);
    const c = cls(screen.getByRole("button").className);
    expect(c).toContain("h-8");
    expect(c).toContain("pointer-coarse:h-11");
    expect(c.filter((t) => /^h-1[0-9]$|^size-1[0-9]$/.test(t))).toEqual([]);
  });

  it("Button exposes data-size so layout tests can tell xs from default", () => {
    render(<Button size="sm">x</Button>);
    expect(screen.getByRole("button").getAttribute("data-size")).toBe("sm");
  });

  it("Input: h-8 at every width, pointer-coarse:h-11 for touch; 16px text stays on touch", () => {
    render(<Input aria-label="n" />);
    const c = cls(screen.getByLabelText("n").className);
    expect(c).toContain("h-8");
    expect(c).toContain("pointer-coarse:h-11");
    expect(c).toContain("text-base");
    expect(c).toContain("regular:pointer-fine:text-sm");
    expect(c.filter((t) => WIDTH_TOKEN.test(` ${t}`))).toEqual([]);
  });

  it("Select trigger: both sizes become 44px on coarse pointers only", () => {
    const src = read("src/components/ui/select.tsx");
    expect(src).toContain("data-[size=default]:h-8");
    expect(src).toContain("pointer-coarse:data-[size=default]:h-11");
    expect(src).toContain("pointer-coarse:data-[size=sm]:h-11");
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
    expect(l).toContain("px-4 py-3 sm:px-6 sm:py-8 lg:px-8");
    // Main pads for the PageFab on phones; no padding on desktop
    expect(l).toContain("pb-[calc(var(--mobile-bar-clearance)+80px)] regular:pb-0");
    // Assert bg-dot-pattern is still present
    expect(l).toMatch(/bg-dot-pattern/);
  });

  it("globals.css: dot/glow off and sans amounts under 48rem only, pos/neg tokens exist", () => {
    const css = read("src/app/globals.css");
    expect(css).toMatch(/@media \(width < 48rem\) \{\s*\.bg-dot-pattern \{ background-image: none !important; \}\s*\.ambient-glow::after \{ display: none !important; \}/);
    expect(css).toMatch(/@media \(width < 48rem\) \{\s*\.tabular-nums, \[data-value\] \{\s*font-family: var\(--font-ui\);/);
    expect(css).toContain("--color-pos: var(--pos)");
    expect(css).toContain("--color-neg: var(--destructive)");
    // existing `font-mono` amounts switch too (inside <main>, minus code/keys), still only under 48rem
    expect(css).toMatch(/@media \(width < 48rem\) \{[^@]*main \.font-mono:not\(pre, code, kbd, samp, textarea, input, \.break-all, \.select-all, \[data-keep-mono\]\)/);
    // the unscoped mono rule is still there for md+
    expect(css).toMatch(/\.tabular-nums, \[data-value\] \{\s*font-family: var\(--font-stack-mono\);/);
  });
});
