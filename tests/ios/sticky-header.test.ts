// @vitest-environment node
// Sticky header on every PageHeader page, every size (D5). Phone layer is max-regular (below 640px). Source-level: the header is
// pinned by CSS classes, so we assert the class strings, the offset arithmetic and the
// collision offsets for the elements that sit under it.
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { rootValue, resolvedToken } from "../helpers/css-tokens";

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

describe("phone top bar: sticky on every PageHeader row (below regular)", () => {
  const bar = constant("PHONE_BAR");
  const tokens = bar.split(/\s+/);

  it("is sticky at every breakpoint (no max-regular: gate on the position)", () => {
    expect(tokens).toContain("sticky");
    expect(tokens).not.toContain("max-regular:sticky");
    expect(tokens.filter((t) => /^(md:|sm:|lg:)?(sticky|relative|absolute|fixed|static)$/.test(t))).toEqual(["sticky"]);
  });

  it("is pinned at the safe-area inset below regular, 0 from regular (iOS status bar)", () => {
    expect(tokens).toContain("top-[var(--sat,0px)]");
    expect(tokens).toContain("regular:top-0");
    expect(tokens).not.toContain("max-regular:top-0");
  });

  it("uses the glass-bar material (no opaque bg token on the bar itself)", () => {
    expect(tokens).toContain("glass-bar");
    expect(tokens).not.toContain("max-regular:bg-background");
  });

  it("sits above section labels (z-30 > z-10)", () => {
    expect(tokens).toContain("z-30");
  });

  it("row height comes from --phone-header-h", () => {
    expect(tokens).toContain("max-regular:min-h-[var(--phone-header-h)]");
  });

  it("is full-bleed inside the app shell gutter (-mx-4 + px-4)", () => {
    expect(tokens).toContain("max-regular:-mx-4");
    expect(tokens).toContain("max-regular:px-4");
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
    // declared in a top-level :root block (token), resolved the same in light and dark
    expect(rootValue(css, "--phone-header-h")).toBe("3.75rem");
    expect(resolvedToken(css, "--phone-header-h", "light")).toBe("3.75rem");
    expect(resolvedToken(css, "--phone-header-h", "dark")).toBe("3.75rem");
  });
});

describe("elements under the header offset by sat + header height", () => {
  it("transactions section labels stick under the page header", () => {
    expect(txList).toContain("sticky top-[calc(var(--sat,0px)+var(--header-h))]");
    expect(txList).not.toContain("sticky top-[var(--sat,0)]");
  });

  it("--header-h is the phone bar on phones and the regular bar maximum from 640px", () => {
    expect(css).toMatch(/--header-h:\s*var\(--phone-header-h\);/);
    expect(css).toMatch(/@media \(width >= 40rem\)\s*\{\s*:root\s*\{\s*--header-h:\s*3\.75rem;/);
  });

  it("family overview filter toolbar offsets on phones, desktop keeps --sat", () => {
    expect(overview).toContain("max-regular:top-[calc(var(--sat)+var(--phone-header-h))]");
    expect(overview).toContain("regular:static");
    expect(overview).not.toContain("md:top-[var(--sat)]");
    expect(overview).not.toMatch(/sticky top-\[var\(--sat\)\]/);
  });

  it("settings shell draws no bar of its own: the page PageHeader (sticky, shared bar) is the one top bar", () => {
    expect(settingsShell).not.toMatch(/PHONE_BAR|settings-detail-bar/);
    expect(settingsShell).not.toContain("max-md:pt-[var(--sat)]");
    expect(pageHeader).toContain('export const PHONE_BAR_STICKY =');
    expect(pageHeader).toContain('data-slot="page-header" className={cn(className, PHONE_BAR)}');
  });

  it("settings sub-pages: no static override, no sr-only title; the content wrapper keeps the no-scroll rule", () => {
    expect(settingsShell).not.toContain("[&_[data-slot=page-header]]:static");
    expect(settingsShell).not.toContain("[&_[data-slot=page-header-title]]:sr-only");
    expect(settingsShell).not.toContain("sr-only");
    expect(settingsShell).toContain('<div className="overflow-x-clip">{children}</div>');
  });

  it("dashboard header wrapper is display:contents at every breakpoint (its parent must span the page)", () => {
    const dash = read("src/app/(app)/dashboard/page.tsx");
    expect(dash).toMatch(/<motion\.div variants=\{itemVariants\} className="contents">\s*<PageHeader/);
  });
});
