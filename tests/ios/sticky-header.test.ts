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

describe("phone header: sticky on every PageHeader row (max-md only)", () => {
  const sticky = constant("PHONE_HEADER_STICKY");
  const tokens = sticky.split(/\s+/);

  it("is sticky below md and nothing else (desktop unchanged)", () => {
    expect(tokens).toContain("max-md:sticky");
    expect(tokens.filter((t) => t.startsWith("sticky") || t.startsWith("md:sticky"))).toEqual([]);
    expect(tokens.every((t) => t.startsWith("max-md:"))).toBe(true);
  });

  it("is pinned at the safe-area inset, not 0 (iOS status bar)", () => {
    expect(tokens).toContain("max-md:top-[var(--sat,0px)]");
    expect(tokens).not.toContain("max-md:top-0");
  });

  it("uses an opaque background and no backdrop blur", () => {
    expect(tokens).toContain("max-md:bg-background");
    expect(sticky).not.toMatch(/backdrop|blur/);
  });

  it("sits above section labels (z-30 > z-10) and keeps a hairline border", () => {
    expect(tokens).toContain("max-md:z-30");
    expect(tokens).toContain("max-md:border-b");
    expect(tokens).toContain("max-md:border-border");
  });

  it("row height comes from --phone-header-h", () => {
    expect(tokens).toContain("max-md:min-h-[var(--phone-header-h)]");
  });

  it("the back row and the plain row both use the shared sticky set", () => {
    expect(constant("PHONE_HEADER_ROW")).toContain("${PHONE_HEADER_STICKY}");
    expect(pageHeader).toMatch(/PHONE_HEADER_PLAIN = cn\(PHONE_HEADER_STICKY,/);
    // every PageHeader branch that renders a row carries the sticky set
    const openers = pageHeader.match(/data-slot="page-header"/g) ?? [];
    expect(openers.length).toBeGreaterThanOrEqual(4);
    expect(pageHeader).toMatch(/data-slot="page-header"\s+className=\{cn\(className, PHONE_HEADER_ROW\)\}/);
    expect(pageHeader).toMatch(/className=\{cn\(className, PHONE_HEADER_PLAIN\)\}/);
    expect(pageHeader).toMatch(/className=\{cn\(className, PHONE_HEADER_STICKY, "max-md:flex max-md:flex-row/);
  });

  it("the row no longer adds its own top safe-area padding (body already pads it in flow)", () => {
    expect(constant("PHONE_HEADER_ROW")).not.toMatch(/pt-\[var\(--sat\)\]/);
    expect(sticky).not.toMatch(/pt-\[var\(--sat\)\]/);
  });
});

describe("--phone-header-h", () => {
  it("is defined on :root as 3.5rem", () => {
    // the :root block that also holds the safe-area vars (--sat) carries the header height
    const blocks = [...css.matchAll(/:root\s*\{[\s\S]*?\n\}/g)].map((m) => m[0]);
    const withSat = blocks.filter((b) => b.includes("--sat:"));
    expect(withSat.length).toBe(1);
    expect(withSat[0]).toMatch(/--phone-header-h:\s*3\.5rem;/);
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

  it("settings back row uses the shared sticky set", () => {
    expect(settingsShell).toContain("PHONE_HEADER_STICKY");
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
