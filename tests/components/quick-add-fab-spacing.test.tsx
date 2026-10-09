/**
 * @vitest-environment node
 */
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import * as fs from "fs";

describe("QuickAddFAB spacing in layout", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.resetModules();
  });

  it("should apply increased padding (pb-[calc(var(--mobile-bar-clearance)+64px)]) and md:pb-24 when FAB is enabled", async () => {
    const layoutCode = fs.readFileSync(
      "./src/app/(app)/layout.tsx",
      "utf-8"
    );

    // Verify that the layout contains the new padding calculation and desktop clearance
    expect(layoutCode).toContain("pb-[calc(var(--mobile-bar-clearance)+64px)]");
    expect(layoutCode).toContain("md:pb-24");
    expect(layoutCode).toContain("isQuickAddEnabled()");
  });

  it("should apply default padding (pb-[var(--mobile-bar-clearance)]) when FAB is disabled", async () => {
    const layoutCode = fs.readFileSync(
      "./src/app/(app)/layout.tsx",
      "utf-8"
    );

    // Verify that the layout contains the default padding calculation for the disabled case
    expect(layoutCode).toContain("pb-[var(--mobile-bar-clearance)]");
  });

  it("should use conditional padding based on isQuickAddEnabled flag with correct order", async () => {
    const layoutCode = fs.readFileSync(
      "./src/app/(app)/layout.tsx",
      "utf-8"
    );

    // Verify the conditional logic is present with the ternary in the correct order
    // Flag-on branch: includes md:pb-24 for desktop FAB clearance
    // Flag-off branch: includes md:pb-0 for default desktop behavior
    const conditionRegex = /isQuickAddEnabled\(\)\s*\?\s*"pb-\[calc\(var\(--mobile-bar-clearance\)\+64px\)\]\s+md:pb-24"\s*:\s*"pb-\[var\(--mobile-bar-clearance\)\]\s+md:pb-0"/;
    expect(layoutCode).toMatch(conditionRegex);

    // Verify bg-dot-pattern is still present in the main className
    const mainClassRegex = /bg-dot-pattern/;
    expect(layoutCode).toMatch(mainClassRegex);
  });
});
