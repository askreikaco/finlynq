// @vitest-environment node
// iOS goal 3a: dialog/sheet heights use dvh (not vh) so the Safari toolbar cannot hide footers;
// overlay scroll regions contain overscroll; the analytics consent banner clears the safe area
// and the phone tab bar. Source-level: the behaviour is CSS-only, so we assert class strings.
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const read = (p: string) => readFileSync(join(__dirname, "../../", p), "utf8");

const DIALOG_FILES = [
  "src/app/(app)/dashboard/_components/health-info-dialog.tsx",
  "src/app/(app)/import/components/column-mapping-dialog.tsx",
  "src/app/(app)/import/components/connector-mapping-dialog.tsx",
  "src/app/(app)/import/components/connector-reconciliation-dialog.tsx",
  "src/app/(app)/import/components/csv-mapper-dialog.tsx",
  "src/app/(app)/import/components/edit-template-dialog.tsx",
  "src/app/(app)/import/components/excel-mapper-dialog.tsx",
  "src/app/(app)/import/components/import-preview-dialog.tsx",
  "src/app/(app)/import/components/investment-statement-preview.tsx",
  "src/app/(app)/import/components/ofx-confirm-dialog.tsx",
  "src/app/(app)/import/components/pdf-preview.tsx",
  "src/app/(app)/import/components/save-template-dialog.tsx",
  "src/components/portfolio/lot-inspector-dialog.tsx",
  "src/components/rules/rule-editor-dialog.tsx",
];

const RAW_VH = /\d+vh\b/;

describe("dialog/sheet heights use dvh (iOS toolbar-safe)", () => {
  it.each(DIALOG_FILES)("%s has no raw vh height", (f) => {
    expect(read(f)).not.toMatch(/\d+vh\]/);
    expect(read(f)).not.toMatch(RAW_VH);
  });

  it("the Overlay owns the heights, all in dvh", () => {
    const s = read("src/components/ui/overlay.tsx");
    expect(s).toMatch(/max-h-\[calc\(100dvh-2rem-var\(--sat\)-var\(--sab\)/);
    expect(s).toMatch(/max-h-\[calc\(100dvh-var\(--kb-inset,0px\)-var\(--sat\)\)\]/);
    expect(s).not.toMatch(RAW_VH);
  });

  it("the full size (lot inspector matrix) keeps its 95% height as dvh", () => {
    expect(read("src/components/ui/overlay.tsx")).toContain("h-[95dvh] max-h-[95dvh]");
    expect(read("src/components/portfolio/lot-inspector-dialog.tsx")).toContain('"full"');
  });
});

describe("scroll containment (overscroll-contain) on overlays", () => {
  it("the Overlay popup and its scrolling body contain overscroll", () => {
    const s = read("src/components/ui/overlay.tsx");
    expect(s).toContain("overflow-hidden overscroll-contain bg-background");
    expect(s).toContain("overflow-y-auto overscroll-contain px-4");
  });
});

describe("analytics consent banner: safe area and phone tab-bar clearance", () => {
  const s = read("src/components/analytics-consent.tsx");

  it("clears the phone tab bar via mobile-bar-clearance", () => {
    expect(s).toContain("max-regular:bottom-[calc(var(--mobile-bar-clearance)-1rem)]");
  });

  it("keeps the desktop bottom-0 and z-[9999]", () => {
    expect(s).toContain("bottom-0 max-regular:bottom-");
    expect(s).toContain("z-[9999]");
  });

  it("pads bottom, left and right by the safe-area inset", () => {
    expect(s).toContain("pb-[max(14px,var(--sab))]");
    expect(s).toContain("pl-[max(18px,var(--sal))]");
    expect(s).toContain("pr-[max(18px,var(--sar))]");
  });
});

// Mutation checks (run by hand, see report): each restored line must turn one of these red.
// 1) overlay full size h-[95dvh] -> h-[95vh]   2) overlay.tsx overscroll-contain removed
// 3) consent max-regular:bottom-[calc(...)] removed
