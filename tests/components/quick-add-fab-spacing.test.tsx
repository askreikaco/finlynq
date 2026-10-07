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

  it("should apply increased padding (pb-[calc(132px+var(--sab))]) and md:pb-24 when FAB is enabled", async () => {
    const layoutCode = fs.readFileSync(
      "./src/app/(app)/layout.tsx",
      "utf-8"
    );

    // Verify that the layout contains the new padding calculation and desktop clearance
    expect(layoutCode).toContain("pb-[calc(132px+var(--sab))]");
    expect(layoutCode).toContain("md:pb-24");
    expect(layoutCode).toContain("isQuickAddEnabled()");
  });

  it("should apply default padding (pb-[calc(60px+var(--sab))]) when FAB is disabled", async () => {
    const layoutCode = fs.readFileSync(
      "./src/app/(app)/layout.tsx",
      "utf-8"
    );

    // Verify that the layout contains the default padding calculation for the disabled case
    expect(layoutCode).toContain("pb-[calc(60px+var(--sab))]");
  });

  it("should use conditional padding based on isQuickAddEnabled flag with correct order", async () => {
    const layoutCode = fs.readFileSync(
      "./src/app/(app)/layout.tsx",
      "utf-8"
    );

    // Verify the conditional logic is present with the ternary in the correct order
    // Flag-on branch: includes md:pb-24 for desktop FAB clearance
    // Flag-off branch: includes md:pb-0 for default desktop behavior
    const conditionRegex = /isQuickAddEnabled\(\)\s*\?\s*"pb-\[calc\(132px\+var\(--sab\)\)\]\s+md:pb-24"\s*:\s*"pb-\[calc\(60px\+var\(--sab\)\)\]\s+md:pb-0"/;
    expect(layoutCode).toMatch(conditionRegex);

    // Verify bg-dot-pattern is still present in the main className
    const mainClassRegex = /bg-dot-pattern/;
    expect(layoutCode).toMatch(mainClassRegex);
  });
});
