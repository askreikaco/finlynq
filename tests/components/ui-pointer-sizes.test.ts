/**
 * @vitest-environment jsdom
 */
// G2-14e: ui primitives size by pointer, not viewport width.
// Touch sizes are pointer-coarse:* (44px on every coarse device, iPad included). Compact density
// (dense:) may shrink fine-pointer desktops only: every dense: token must be dense:pointer-fine:*,
// so a coarse pointer never matches it. Static source assertions plus buttonVariants strings.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as buttonModule from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button";
import { readdirSync } from "node:fs";
import { cn } from "@/lib/utils";

const read = (p: string) => readFileSync(join(__dirname, "../../", p), "utf8");
const cls = (s: string) => s.split(/\s+/).filter(Boolean);

// Width-based breakpoint tokens: sm:/md:/lg:/xl:/2xl: and max-*: prefixed. Object keys (`sm: "h-7"`) are not tokens.
const WIDTH_TOKEN_SRC = /(?<![\w-])(max-)?(sm|md|lg|xl|2xl):(?=[a-z\[!@-])/;

// Every primitive that carries a size or touch rule in this package.
const PRIMITIVES = [
  "button", "input", "select", "combobox", "group-combobox", "tabs", "switch",
  "pagination", "card", "checkbox", "badge", "table",
] as const;

// Touch controls: each must carry these pointer-coarse 44px rules in its source.
const TOUCH_RULES: Record<string, string[]> = {
  button: ["pointer-coarse:h-11", "pointer-coarse:size-11", "pointer-coarse:before:-inset-2.5"],
  input: ["pointer-coarse:h-11"],
  select: ["pointer-coarse:data-[size=default]:h-11", "pointer-coarse:data-[size=sm]:h-11"],
  combobox: ["pointer-coarse:data-[size=default]:h-11", "pointer-coarse:data-[size=sm]:h-11"],
  "group-combobox": ["pointer-coarse:h-11", "pointer-coarse:min-h-11"],
  tabs: ["pointer-coarse:group-data-horizontal/tabs:h-11", "pointer-coarse:before:-inset-y-1.5"],
  switch: ["pointer-coarse:before:-inset-y-3", "pointer-coarse:before:-inset-x-2"],
};

const source = (name: string) => read(`src/components/ui/${name}.tsx`);

// A Button size is 44px on coarse pointers if it sets the box or the hit-slop pseudo-element.
function coarse44(c: string[]): boolean {
  return (
    c.includes("pointer-coarse:h-11") ||
    c.includes("pointer-coarse:size-11") ||
    (c.includes("pointer-coarse:relative") &&
      c.includes("pointer-coarse:before:absolute") &&
      c.includes("pointer-coarse:before:-inset-2.5"))
  );
}

describe("ui primitives: pointer-coarse touch sizes", () => {
  it.each(Object.keys(TOUCH_RULES))("%s carries its pointer-coarse 44px rule", (name) => {
    const src = source(name);
    for (const token of TOUCH_RULES[name]) {
      expect(src, `${name}.tsx missing ${token}`).toContain(token);
    }
  });

  it.each(["default", "xs", "sm", "lg", "icon", "icon-xs", "icon-sm", "icon-lg"] as const)(
    "Button size=%s is 44px on coarse pointers",
    (size) => {
      expect(coarse44(cls(buttonVariants({ size })))).toBe(true);
    },
  );

  it("Button default: desktop h-8, coarse h-11, compact fine h-7", () => {
    const c = cls(buttonVariants({ size: "default" }));
    expect(c).toContain("h-8");
    expect(c).toContain("pointer-coarse:h-11");
    expect(c).toContain("dense:pointer-fine:h-7");
  });
});

describe("ui primitives: no width-based token anywhere in src/components/ui", () => {
  it("every ui/* source file is free of sm:/md:/lg:/xl:/2xl:/max-* tokens", () => {
    const dir = join(__dirname, "../../src/components/ui");
    const offenders = readdirSync(dir)
      .filter((f) => /\.(tsx|ts)$/.test(f))
      .filter((f) => (readFileSync(join(dir, f), "utf8").match(new RegExp(WIDTH_TOKEN_SRC.source, "g")) ?? []).length > 0);
    expect(offenders).toEqual([]);
  });

  it("consumer regular:max-w-2xl replaces the DialogContent base regular:max-w-lg under cn()", () => {
    const base = read("src/components/ui/dialog.tsx").match(/"([^"]*regular:max-w-lg[^"]*)"/)?.[1] ?? "";
    expect(base).not.toBe("");
    const merged = cls(cn(base, "regular:max-w-2xl"));
    expect(merged).toContain("regular:max-w-2xl");
    expect(merged).not.toContain("regular:max-w-lg");
  });

  it("consumer regular:justify-between replaces the DialogFooter base regular:justify-end under cn()", () => {
    const base = read("src/components/ui/dialog.tsx").match(/"([^"]*regular:justify-end[^"]*)"/)?.[1] ?? "";
    expect(base).not.toBe("");
    const merged = cls(cn(base, "regular:justify-between"));
    expect(merged).toContain("regular:justify-between");
    expect(merged).not.toContain("regular:justify-end");
  });
});

describe("ui primitives: no width-based touch or size token", () => {
  it.each(PRIMITIVES)("%s has no sm:/md:/lg:/xl:/max-* class token", (name) => {
    const hits = source(name).match(new RegExp(WIDTH_TOKEN_SRC.source, "g")) ?? [];
    expect(hits, `${name}.tsx width tokens`).toEqual([]);
  });

  it.each(["default", "xs", "sm", "lg", "icon", "icon-xs", "icon-sm", "icon-lg"] as const)(
    "Button size=%s strings carry no width token",
    (size) => {
      const c = cls(buttonVariants({ size }));
      expect(c.filter((t) => WIDTH_TOKEN_SRC.test(` ${t}`))).toEqual([]);
    },
  );
});

describe("ui primitives: dense never reduces a coarse target", () => {
  it.each(PRIMITIVES)("%s: every dense: token is dense:pointer-fine:", (name) => {
    const bare = source(name).match(/dense:(?!pointer-fine:)[^\s"'`]*/g) ?? [];
    expect(bare, `${name}.tsx dense tokens without pointer-fine`).toEqual([]);
  });

  it("dense reductions are present where planned (button, icon, input, select, combobox, group-combobox, tabs)", () => {
    for (const name of ["button", "input", "select", "combobox", "group-combobox", "tabs"]) {
      expect(source(name), name).toContain("dense:pointer-fine:");
    }
  });
});

describe("ui primitives: public API unchanged", () => {
  it("button exports only Button and buttonVariants", () => {
    expect(Object.keys(buttonModule).sort()).toEqual(["Button", "buttonVariants"]);
  });
});
