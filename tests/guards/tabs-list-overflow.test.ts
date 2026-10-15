// @vitest-environment node
// Guard: the shared tab bar keeps the three rules that fixed the clipped / vertically scrolling tab strip in the 25% split pane.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const src = readFileSync(resolve(process.cwd(), "src/components/ui/tabs.tsx"), "utf8");
const base = src.slice(src.indexOf("const tabsListVariants = cva("), src.indexOf("variants: {"));

describe("TabsList base classes", () => {
  it("is positioned, so base-ui's scroll-active-tab-into-view measures offsets against the list (not the page)", () => {
    expect(base).toMatch(/group\/tabs-list relative /);
  });
  it("centers only when it fits (justify-center-safe), never plain justify-center (clips the first tab when it overflows)", () => {
    expect(base).toContain("justify-center-safe");
    expect(base).not.toMatch(/justify-center(?!-safe)/);
  });
  it("scrolls horizontally only: overflow-y-hidden stops the vertical scrollbar", () => {
    expect(base).toContain("overflow-x-auto");
    expect(base).toContain("overflow-y-hidden");
  });
  it("the line underline sits inside the bar (bottom-0), not 5px below it", () => {
    expect(src).not.toContain("after:bottom-[-5px]");
  });
});
