// Icon-only toolbar / header buttons are ONE shared component (Button iconOnly shape="round"); the toolbar controls share
// CONTROL_SURFACE (card colour + border + inner shadow, light and dark).
import { describe, it, expect } from "vitest";
import * as fs from "fs";

const read = (p: string) => fs.readFileSync(p, "utf8");

describe("PageToolbar round controls", () => {
  const tb = read("src/components/page-toolbar.tsx");
  const header = read("src/components/mobile/page-header.tsx");

  it("PageToolbar arrows, search, filter and refresh are round iconOnly Buttons", () => {
    expect(tb.match(/shape="round"/g)!.length).toBeGreaterThanOrEqual(5);
    expect(tb.match(/\biconOnly\b/g)!.length).toBeGreaterThanOrEqual(5);
    expect(tb).not.toMatch(/size="icon/);
  });

  it("the top bar's icon buttons (Back, More, bulk edit, primary) are round iconOnly Buttons", () => {
    expect(header.match(/shape="round"/g)!.length).toBeGreaterThanOrEqual(5);
    expect(header).not.toMatch(/size="icon/);
  });

  it("a round iconOnly Button is a 44px circle that wears CONTROL_SURFACE", () => {
    const src = read("src/components/ui/button.tsx");
    expect(src).toContain("rounded-full");
    expect(src).toContain("size-11 pointer-coarse:size-11 dense:pointer-fine:size-11");
    expect(src).toContain("CONTROL_SURFACE");
  });

  it("range trigger, month group, search and the Spending/Income toggle share CONTROL_SURFACE", () => {
    // Every Field control (the range trigger, the search box) is built on CONTROL_SURFACE; the toolbar asks for the round shape.
    expect(read("src/components/ui/field/surface.tsx")).toContain("CONTROL_SURFACE");
    expect(read("src/components/ui/field/select-base.tsx")).toContain("CONTROL_SURFACE");
    expect(read("src/components/metric-range-select.tsx")).toContain("rounded-full");
    expect(tb).toMatch(/<Field[\s\S]*?\bpill\b/);
    expect(tb.match(/CONTROL_SURFACE/g)!.length).toBeGreaterThanOrEqual(2);
    expect(read("src/components/ui/tabs.tsx")).toContain("CONTROL_SURFACE");
    expect(read("src/app/(app)/categories/_page-content.tsx")).toContain('variant="segmented"');
  });

  it("control tokens exist for light and dark", () => {
    const css = read("src/app/globals.css");
    expect(css.match(/--control-border:/g)).toHaveLength(2);
    expect(css.match(/--control-shadow:/g)).toHaveLength(2);
  });

  it("the glass top bar has no top border and no inset top highlight", () => {
    const css = read("src/app/globals.css");
    const rule = /\n\.glass-bar \{([^}]*)\}/.exec(css)![1];
    expect(rule).toContain("border-top: 0");
    expect(rule).not.toMatch(/var\(--glass-edge\)/);
    expect(rule).not.toMatch(/inset 0 1px/);
  });
});
