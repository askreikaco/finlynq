import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

describe("budgets/page: OnboardingTips source-order guard", () => {
  it("guard: PageHeader element appears before OnboardingTips element in source", () => {
    const srcPath = path.resolve(__dirname, "../../src/app/(app)/budgets/page.tsx");
    const source = fs.readFileSync(srcPath, "utf-8");
    const pageHeaderIndex = source.indexOf("<PageHeader");
    const onboardingTipsIndex = source.indexOf("<OnboardingTips page=\"budgets\"");
    expect(pageHeaderIndex).toBeGreaterThan(-1);
    expect(onboardingTipsIndex).toBeGreaterThan(-1);
    expect(pageHeaderIndex).toBeLessThan(onboardingTipsIndex);
  });
});
