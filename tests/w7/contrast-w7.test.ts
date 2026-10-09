// @vitest-environment node
// W7: contrast fixes. Light-mode primary text uses --primary-text (darker amber); badges and
// selected pills on amber/teal use the matching foreground token; sidebar section labels use
// muted-foreground without alpha.
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

  it("settings mobile pill selected state uses text-primary-text", () => {
    expect(read("src/components/settings-shell.tsx")).toContain(
      '"border-primary/40 bg-primary/10 text-primary-text"',
    );
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

  it("sidebar section labels use text-muted-foreground without alpha", () => {
    const nav = read("src/components/nav.tsx");
    expect(nav.split("text-muted-foreground hover:text-sidebar-foreground/50").length - 1).toBe(2);
    expect(nav).not.toContain("text-sidebar-foreground/30");
  });
});
