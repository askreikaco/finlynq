import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

describe("accounts/page: OnboardingTips source-order guard", () => {
  it("guard: the SectionPage (shared header) elements appear before OnboardingTips elements in source", () => {
    const srcPath = path.resolve(__dirname, "../../src/app/(app)/accounts/page.tsx");
    const source = fs.readFileSync(srcPath, "utf-8");

    // Find all SectionPage (shared header) and OnboardingTips positions
    const pageHeaderIndices: number[] = [];
    const onboardingTipsIndices: number[] = [];

    let idx = 0;
    while ((idx = source.indexOf("<SectionPage", idx)) !== -1) {
      pageHeaderIndices.push(idx);
      idx += 1;
    }

    idx = 0;
    while ((idx = source.indexOf("<Notice source=\"tips:accounts\"", idx)) !== -1) {
      onboardingTipsIndices.push(idx);
      idx += 1;
    }

    // Ensure we have expected counts
    expect(pageHeaderIndices.length).toBe(2);
    expect(onboardingTipsIndices.length).toBe(2);

    // Each SectionPage should appear before its corresponding OnboardingTips
    pageHeaderIndices.forEach((headerIdx) => {
      const nextTipsIdx = onboardingTipsIndices.find((tipsIdx) => tipsIdx > headerIdx);
      expect(nextTipsIdx).toBeDefined();
      expect(headerIdx).toBeLessThan(nextTipsIdx!);
    });
  });
});
