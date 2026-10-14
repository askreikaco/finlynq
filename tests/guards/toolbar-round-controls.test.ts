// Icon-only toolbar / header buttons are ONE shared component (RoundIconButton); the toolbar controls share
// CONTROL_SURFACE (card colour + border + inner shadow, light and dark).
import { describe, it, expect } from "vitest";
import * as fs from "fs";

const read = (p: string) => fs.readFileSync(p, "utf8");

describe("PageToolbar round controls", () => {
  const tb = read("src/components/page-toolbar.tsx");
  const header = read("src/components/mobile/page-header.tsx");

  it("PageToolbar arrows, search and filter use RoundIconButton, not hand-built icon Buttons", () => {
    expect(tb).toContain('from "@/components/ui/round-icon-button"');
    expect(tb.match(/<RoundIconButton/g)!.length).toBeGreaterThanOrEqual(4);
    expect(tb).not.toMatch(/size="icon"\s*$/m);
    expect(tb).not.toMatch(/<Button[^>]*size="icon"(?!-)/);
  });

  it("the top bar's icon buttons (More, bulk edit) use RoundIconButton", () => {
    expect(header).toContain("<RoundIconButton");
    expect(header).not.toMatch(/<Button[^>]*size="icon"/);
  });

  it("RoundIconButton is a round 44px circle", () => {
    const src = read("src/components/ui/round-icon-button.tsx");
    expect(src).toContain("rounded-full");
    expect(src).toContain("size-11");
  });

  it("range trigger, month group, search and the Spending/Income toggle share CONTROL_SURFACE", () => {
    expect(read("src/components/metric-range-select.tsx")).toContain("CONTROL_SURFACE");
    expect(tb.match(/CONTROL_SURFACE/g)!.length).toBeGreaterThanOrEqual(3);
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
