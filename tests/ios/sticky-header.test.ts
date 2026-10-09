// @vitest-environment node
// Sticky phone header on every PageHeader page (max-md only). Source-level: the header is
// pinned by CSS classes, so we assert the class strings, the offset arithmetic and the
// collision offsets for the elements that sit under it.
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const read = (p: string) => readFileSync(join(__dirname, "../../", p), "utf8");
const pageHeader = read("src/components/mobile/page-header.tsx");
const css = read("src/app/globals.css");
const txList = read("src/components/transactions/mobile-tx-list.tsx");
const overview = read("src/app/(app)/family/_components/overview-tab.tsx");
const settingsShell = read("src/components/settings-shell.tsx");

/** Value of `export const NAME =\n  "..." ` (string or template literal body). */
function constant(name: string): string {
  const m = pageHeader.match(new RegExp(`export const ${name} =\\s*\\n?\\s*[\`"]([^\`"]+)[\`"]`));
  expect(m, `${name} defined`).not.toBeNull();
  return m![1];
}

describe("phone top bar: sticky on every PageHeader row (max-md only)", () => {
  const bar = constant("PHONE_BAR");
  const tokens = bar.split(/\s+/);

  it("is sticky below md and nothing else (desktop unchanged)", () => {
    expect(tokens).toContain("max-md:sticky");
    expect(tokens.filter((t) => t.startsWith("sticky") || t.startsWith("md:sticky"))).toEqual([]);
    expect(tokens.filter((t) => /^(md:|sm:|lg:)/.test(t))).toEqual([]);
  });

  it("is pinned at the safe-area inset, not 0 (iOS status bar)", () => {
    expect(tokens).toContain("max-md:top-[var(--sat,0px)]");
    expect(tokens).not.toContain("max-md:top-0");
  });

  it("uses the glass-bar material (no opaque bg token on the bar itself)", () => {
    expect(tokens).toContain("glass-bar");
    expect(tokens).not.toContain("max-md:bg-background");
  });

  it("sits above section labels (z-30 > z-10)", () => {
    expect(tokens).toContain("max-md:z-30");
  });

  it("row height comes from --phone-header-h", () => {
    expect(tokens).toContain("max-md:min-h-[var(--phone-header-h)]");
  });

  it("is full-bleed inside the app shell gutter (-mx-4 + px-4)", () => {
    expect(tokens).toContain("max-md:-mx-4");
    expect(tokens).toContain("max-md:px-4");
  });

  it("every PageHeader row (title only, back, actions) renders the shared bar", () => {
    const openers = pageHeader.match(/data-slot="page-header"/g) ?? [];
    expect(openers.length).toBe(1);
    expect(pageHeader).toMatch(/data-slot="page-header" className=\{cn\(className, PHONE_BAR\)\}/);
  });

  it("the bar adds no top safe-area padding (body already pads it in flow)", () => {
    expect(bar).not.toMatch(/pt-\[var\(--sat\)\]/);
  });
});

describe("--phone-header-h", () => {
  it("is defined on :root as 3.75rem (one bar height on every page)", () => {
    // the :root block that also holds the safe-area vars (--sat) carries the header height
    const blocks = [...css.matchAll(/:root\s*\{[\s\S]*?\n\}/g)].map((m) => m[0]);
    const withSat = blocks.filter((b) => b.includes("--sat:"));
    expect(withSat.length).toBe(1);
    expect(withSat[0]).toMatch(/--phone-header-h:\s*3\.75rem;/);
  });
});

describe("elements under the header offset by sat + header height", () => {
  it("transactions section labels stick under the page header", () => {
    expect(txList).toContain("sticky top-[calc(var(--sat,0px)+var(--phone-header-h))]");
    expect(txList).not.toContain("sticky top-[var(--sat,0)]");
  });

  it("family overview filter toolbar offsets on phones, desktop keeps --sat", () => {
    expect(overview).toContain("max-md:top-[calc(var(--sat)+var(--phone-header-h))]");
    expect(overview).toContain("md:top-[var(--sat)]");
    expect(overview).not.toMatch(/sticky top-\[var\(--sat\)\]/);
  });

  it("settings back row uses the shared bar", () => {
    expect(settingsShell).toContain("<div className={PHONE_BAR}>");
    expect(settingsShell).not.toContain("max-md:pt-[var(--sat)]");
  });

  it("settings detail pages: the page PageHeader row collapses (only the back row is sticky)", () => {
    expect(settingsShell).toContain("max-md:[&_[data-slot=page-header]]:static");
    expect(settingsShell).toContain("max-md:[&_[data-slot=page-header]]:min-h-0");
    expect(settingsShell).toContain("max-md:[&_[data-slot=page-header-title]]:sr-only");
    // the content wrapper keeps the phone-level overflow rule (no scroll container around the header)
    expect(settingsShell).toContain('className="max-md:overflow-x-clip md:overflow-x-auto"');
  });

  it("dashboard header wrapper is display:contents on phones (its parent must be taller than the sticky row)", () => {
    const dash = read("src/app/(app)/dashboard/page.tsx");
    expect(dash).toMatch(/<motion\.div variants=\{itemVariants\} className="max-md:contents">\s*<PageHeader/);
  });
});
