// @vitest-environment node
// W7: contrast fixes. Light-mode primary text uses --primary-text (darker amber); badges and
// selected pills on amber/teal use the matching foreground token; tab labels (AppTabs, G2-04 replaced
// the sidebar section labels) use solid tab tokens without alpha.
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

const read = (p: string) => readFileSync(p, "utf8");

function block(css: string, selector: string): string {
  const start = css.indexOf(selector);
  expect(start, `selector ${selector} missing`).toBeGreaterThanOrEqual(0);
  const open = css.indexOf("{", start);
  const close = css.indexOf("\n}", open);
  return css.slice(open, close);
}

describe("W7 contrast tokens in globals.css", () => {
  const css = read("src/app/globals.css");

  it("--primary-text exists in the light :root block", () => {
    expect(block(css, ":root {")).toMatch(/--primary-text:\s*oklch\(0\.45 0\.13 70\)/);
  });

  it("--primary-text exists in the dark .dark block", () => {
    expect(block(css, ".dark {")).toMatch(/--primary-text:\s*oklch\(0\.75 0\.165 70\)/);
  });

  it("@theme inline maps --color-primary-text", () => {
    expect(block(css, "@theme inline {")).toContain("--color-primary-text: var(--primary-text);");
  });
});

describe("W7 contrast class strings", () => {
  it("onboarding tips label uses text-primary-text", () => {
    expect(read("src/components/onboarding-tips.tsx")).toContain(
      '<span className="text-sm font-medium text-primary-text">',
    );
  });

  it("settings has no pill row: the detail bar title is plain foreground text (no pill selected state)", () => {
    const shell = read("src/components/settings-shell.tsx");
    expect(shell).not.toContain("border-primary/40 bg-primary/10 text-primary-text");
    expect(shell).toContain("HEADER_TITLE_CLASS, PHONE_BAR_TITLE");
  });

  it("settings theme Light/Dark selected state uses text-primary-text", () => {
    expect(read("src/app/(app)/settings/general/page.tsx")).toContain(
      '"bg-primary/10 text-primary-text"',
    );
  });

  it("portfolio type chip uses text-primary-foreground when selected (toolbar chips, portfolio-ui)", () => {
    expect(read("src/app/(app)/portfolio/_components/portfolio-ui.tsx")).toContain(
      '"border-primary bg-primary text-primary-foreground"',
    );
  });

  it("reports import button uses text-primary-foreground on bg-primary", () => {
    expect(read("src/app/(app)/reports/page.tsx")).toContain(
      "rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground",
    );
  });

  it("preview table pos badge is dark text in dark mode", () => {
    expect(read("src/components/reconcile/preview-table.tsx")).toContain(
      '<Badge className="bg-pos text-white dark:text-primary-foreground text-xs">',
    );
  });

  it("AppTabs tab labels (bar and rail) use solid tab tokens without alpha", () => {
    const nav = read("src/components/nav.tsx");
    const tabs = nav.slice(nav.indexOf("export const AppTabs"));
    expect(tabs).toContain("mobile-tab-label");
    expect(tabs).toContain('"mobile-glass-pill text-tab-active"');
    expect(tabs).toContain('"text-tab-inactive"');
    expect(tabs).not.toMatch(/\btext-[a-z-]+\/\d+/);
    expect(tabs).not.toContain("text-sidebar-foreground/30");
    expect(tabs).not.toContain("text-muted-foreground hover:text-sidebar-foreground/50");
  });

  it("tab token values are solid oklch (no alpha) in light and dark, and are the values tabbar-glass contrast-checks", () => {
    const css = read("src/app/globals.css");
    expect(css).toMatch(/:root\s*\{[^}]*--tab-inactive:\s*oklch\(0\.42 0\.012 250\);/);
    expect(css).toMatch(/:root\s*\{[^}]*--tab-active:\s*oklch\(0\.45 0\.13 70\);/);
    expect(css).toMatch(/\.dark\s*\{[^}]*--tab-inactive:\s*oklch\(0\.80 0\.006 245\);/);
    expect(css).toMatch(/\.dark\s*\{[^}]*--tab-active:\s*oklch\(0\.75 0\.165 70\);/);
    // The 4.5:1 contrast checks for these tokens live in bar-fixes; they must still test the same values.
    const fixes = read("tests/ios/bar-fixes.test.ts");
    for (const v of ["oklch(0.42, 0.012, 250)", "oklch(0.45, 0.13, 70)", "oklch(0.8, 0.006, 245)", "oklch(0.75, 0.165, 70)"]) {
      expect(fixes).toContain(v);
    }
    expect(fixes).toContain("toBeGreaterThanOrEqual(4.5)");
  });
});
