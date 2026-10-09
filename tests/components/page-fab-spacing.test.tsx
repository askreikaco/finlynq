/**
 * @vitest-environment node
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";

describe("PageFab spacing in app layout", () => {
  const layoutCode = fs.readFileSync("./src/app/(app)/layout.tsx", "utf-8");

  it("main pads for the PageFab on phones (80px = 12 gap + 56 FAB + 12) and none on desktop", () => {
    expect(layoutCode).toContain("pb-[calc(var(--mobile-bar-clearance)+80px)] md:pb-0");
  });

  it("padding is unconditional (no flag-gated ternary, no legacy md:pb-24)", () => {
    expect(layoutCode).not.toContain("isQuickAddEnabled");
    expect(layoutCode).not.toContain("md:pb-24");
    expect(layoutCode).not.toContain("+64px");
  });

  it("PageFab is mounted inside PageFabProvider", () => {
    expect(layoutCode).toMatch(/<PageFabProvider>[\s\S]*<PageFab \/>[\s\S]*<\/PageFabProvider>/);
  });
});
