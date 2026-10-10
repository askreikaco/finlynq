// C-01 parity: src/lib/design/tokens.ts must mirror the CSS tokens in src/app/globals.css.
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import { TOKENS } from "../../src/lib/design/tokens";

const css = fs.readFileSync("src/app/globals.css", "utf-8").replace(/\/\*[\s\S]*?\*\//g, "");

// Exactly one declaration of --name in the stylesheet; returns its raw value.
function declValue(name: string): string {
  const re = new RegExp(`(?<![\\w-])${name}\\s*:\\s*([^;]+);`, "g");
  const hits = [...css.matchAll(re)].map((m) => m[1].trim());
  expect(hits.length, `${name} must be declared exactly once`).toBe(1);
  return hits[0];
}

function toPx(raw: string): number {
  const m = raw.match(/^(-?\d*\.?\d+)(px|rem)?$/);
  if (!m) throw new Error(`not a px/rem length: ${raw}`);
  return m[2] === "rem" ? parseFloat(m[1]) * 16 : parseFloat(m[1]);
}

const CSS_FOR: Record<keyof typeof TOKENS, string> = {
  hitMin: "--hit-min",
  barCtlH: "--bar-ctl-h",
  phoneHeaderH: "--phone-header-h",
  tabBarH: "--tab-bar-h",
  tabBarInset: "--tab-bar-inset",
  tabBarRadius: "--tab-bar-radius",
  tabLabelSize: "--tab-label-size",
  row: "--spacing-row",
  rowTall: "--spacing-row-tall",
  rowLabelW: "--spacing-row-label",
  rowLabelNarrowW: "--spacing-row-label-narrow",
  groupRadius: "--radius-group",
  formW: "--container-form",
  sectionW: "--container-section",
  reportW: "--container-report",
  docW: "--container-doc",
  consoleW: "--container-console",
};

describe("design tokens: TS mirror matches globals.css", () => {
  it.each(Object.entries(CSS_FOR))("%s = %s", (key, cssName) => {
    expect(toPx(declValue(cssName))).toBe(TOKENS[key as keyof typeof TOKENS]);
  });

  it("chrome names keep their old spelling (no rename)", () => {
    expect(declValue("--phone-header-h")).toBe("3.75rem");
    expect(declValue("--tab-label-size")).toBe("0.625rem");
  });
});

describe("design tokens: glass classes read tokens only", () => {
  const GLASS = /^\s*\.(glass|glass-bar|glass-capsule|glass-menu|mobile-glass-bar)\s*\{([^}]*)\}/gm;

  it("no oklch() literal inside any glass class body", () => {
    const bodies = [...css.matchAll(GLASS)];
    expect(bodies.length).toBeGreaterThan(0);
    const offenders = bodies.filter((b) => /oklch\(/.test(b[2])).map((b) => b[1]);
    expect(offenders, "glass classes must read var(--glass-*)").toEqual([]);
  });

  it("every --glass-* token a glass class reads is defined", () => {
    const used = new Set<string>();
    for (const b of css.matchAll(GLASS)) for (const v of b[2].matchAll(/var\((--glass-[\w-]+)\)/g)) used.add(v[1]);
    expect(used.size).toBeGreaterThan(0);
    // Glass tokens are declared in :root and again in .dark, so only presence is checked here.
    for (const name of used) {
      expect(new RegExp(`(?<![\\w-])${name}\\s*:`).test(css), name).toBe(true);
    }
  });
});
