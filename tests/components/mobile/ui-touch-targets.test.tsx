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

describe("mobile-only touch targets (max-md:) — desktop sizes untouched", () => {
  it.each([
    ["default", "h-8", "max-md:h-11"],
    ["sm", "h-7", "max-md:h-11"],
    ["lg", "h-9", "max-md:h-11"],
    ["icon", "size-8", "max-md:size-11"],
    ["icon-sm", "size-7", "max-md:size-11"],
    ["icon-lg", "size-9", "max-md:size-11"],
  ] as const)("Button size=%s keeps %s and adds %s", (size, desktop, mobile) => {
    const c = cls(buttonVariants({ size }));
    expect(c).toContain(desktop);
    expect(c).toContain(mobile);
  });

  it("xs buttons keep their box but extend the hit area to >=44px", () => {
    const c = cls(buttonVariants({ size: "xs" }));
    expect(c).toContain("h-6");
    expect(c).toContain("max-md:before:-inset-2.5");
  });

  it("every mobile Button class is max-md: scoped (no un-scoped size change)", () => {
    render(<Button>Go</Button>);
    const c = cls(screen.getByRole("button").className);
    expect(c).toContain("h-8");
    expect(c.filter((t) => /^h-1[0-9]$|^size-1[0-9]$/.test(t))).toEqual([]);
  });

  it("Button exposes data-size so layout tests can tell xs from default", () => {
    render(<Button size="sm">x</Button>);
    expect(screen.getByRole("button").getAttribute("data-size")).toBe("sm");
  });

  it("Input: h-8 at md+, h-11 below", () => {
    render(<Input aria-label="n" />);
    const c = cls(screen.getByLabelText("n").className);
    expect(c).toContain("h-8");
    expect(c).toContain("max-md:h-11");
  });

  it("Select trigger: both sizes become 44px below md only", () => {
    const src = read("src/components/ui/select.tsx");
    expect(src).toContain("data-[size=default]:h-8");
    expect(src).toContain("max-md:data-[size=default]:h-11");
    expect(src).toContain("max-md:data-[size=sm]:h-11");
  });

  it("Tabs list: h-8 at md+, h-11 below; still horizontally scrollable", () => {
    render(
      <Tabs defaultValue="a">
        <TabsList data-testid="l">
          <TabsTrigger value="a">A</TabsTrigger>
        </TabsList>
      </Tabs>,
    );
    const c = cls(screen.getByTestId("l").className);
    expect(c).toContain("group-data-horizontal/tabs:h-8");
    expect(c).toContain("max-md:group-data-horizontal/tabs:h-11");
    expect(c).toContain("overflow-x-auto");
  });

  it("Card is denser below md only", () => {
    const src = read("src/components/ui/card.tsx");
    expect(src).toContain("py-4 max-md:py-3");
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
