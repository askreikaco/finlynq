import { describe, it, expect } from "vitest";
import * as fs from "fs";

describe("CSS rules guard", () => {
  it("should have .hero-number.tabular-nums rule in globals.css", () => {
    const globalsPath = "src/app/globals.css";
    const content = fs.readFileSync(globalsPath, "utf-8");

    // Check for the .hero-number.tabular-nums rule
    const hasHeroNumberTabularNumsRule = /\.hero-number\.tabular-nums\s*\{[\s\S]*?font-family:\s*var\(--font-sans\)[\s\S]*?\}/.test(
      content
    );

    expect(
      hasHeroNumberTabularNumsRule,
      "Missing .hero-number.tabular-nums rule with font-family: var(--font-sans)"
    ).toBe(true);
  });

  it("should have .sparkline-fade class in globals.css", () => {
    const globalsPath = "src/app/globals.css";
    const content = fs.readFileSync(globalsPath, "utf-8");

    // Check for the .sparkline-fade rule with mask-image
    const hasSparklineFadeRule = /\.sparkline-fade\s*\{[\s\S]*?mask-image:[\s\S]*?\}/.test(
      content
    );

    expect(
      hasSparklineFadeRule,
      "Missing .sparkline-fade rule with mask-image property"
    ).toBe(true);
  });

  it("globals.css has no legacy hue 265 inside any oklch() color", () => {
    const content = fs.readFileSync("src/app/globals.css", "utf-8");
    const calls = content.match(/oklch\([^)]*\)/g) ?? [];
    const legacy = calls.filter((c) => /\b265\b/.test(c));
    expect(legacy, "legacy hue 265 found in oklch()").toEqual([]);
  });

  it("::selection uses the primary token", () => {
    const content = fs.readFileSync("src/app/globals.css", "utf-8");
    const m = content.match(/::selection\s*\{[^}]*\}/);
    expect(m, "::selection rule missing").not.toBeNull();
    expect(m![0]).toContain("var(--primary)");
  });

});
