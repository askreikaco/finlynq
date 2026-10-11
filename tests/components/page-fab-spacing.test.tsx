/**
 * @vitest-environment node
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";

describe("PageFab spacing in app layout", () => {
  const layoutCode = fs.readFileSync("./src/app/(app)/layout.tsx", "utf-8");

  it("main pads 16px above the bar clearance on phones (no floating button) and none from regular (640px) up", () => {
    expect(layoutCode).toContain("pb-[calc(var(--mobile-bar-clearance)+16px)] regular:pb-0");
  });

  it("padding is unconditional (no flag-gated ternary, no legacy md:pb-24)", () => {
    expect(layoutCode).not.toContain("isQuickAddEnabled");
    expect(layoutCode).not.toContain("md:pb-24");
    expect(layoutCode).not.toContain("+64px");
  });

  it("the floating button is not mounted (each page header carries its own add action)", () => {
    expect(layoutCode).not.toMatch(/<PageFab \/>/);
    expect(layoutCode).toContain("<PageFabProvider>");
  });
});
