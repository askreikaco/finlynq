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
  "src/app/(app)/transactions/new/_components/date-time-picker.tsx",
  "src/components/portfolio/lot-inspector-dialog.tsx",
  "src/components/rules/rule-editor-dialog.tsx",
];

const RAW_VH = /\d+vh\b/;

describe("dialog/sheet heights use dvh (iOS toolbar-safe)", () => {
  it.each(DIALOG_FILES)("%s has no raw vh height", (f) => {
    expect(read(f)).not.toMatch(/\d+vh\]/);
    expect(read(f)).not.toMatch(RAW_VH);
  });

  it.each(DIALOG_FILES)("%s uses dvh heights", (f) => {
    expect(read(f)).toMatch(/\d+dvh\]/);
  });

  it("lot inspector keeps its 95% height as dvh", () => {
    expect(read("src/components/portfolio/lot-inspector-dialog.tsx")).toContain(
      "h-[95dvh] max-h-[95dvh]",
    );
  });

  it("base dialog guard is still dvh-based", () => {
    expect(read("src/components/ui/dialog.tsx")).toMatch(/max-h-\[calc\(100dvh-2rem-var\(--sat\)-var\(--sab\)/);
  });
});

describe("scroll containment (overscroll-contain) on overlays", () => {
  it("ui/dialog.tsx scroll content contains overscroll", () => {
    const s = read("src/components/ui/dialog.tsx");
    expect(s).toContain("overflow-y-auto overscroll-contain rounded-xl");
  });

  it("ui/sheet.tsx popup contains overscroll", () => {
    const s = read("src/components/ui/sheet.tsx");
    expect(s).toContain("gap-4 overscroll-contain bg-background");
  });

  it("mobile detail-sheet scroll content contains overscroll", () => {
    const s = read("src/components/mobile/detail-sheet.tsx");
    expect(s).toContain("max-h-[85dvh] overflow-y-auto overscroll-contain rounded-t-2xl");
  });
});

describe("analytics consent banner: safe area and phone tab-bar clearance", () => {
  const s = read("src/components/analytics-consent.tsx");

  it("clears the phone tab bar via mobile-bar-clearance", () => {
    expect(s).toContain("max-md:bottom-[calc(var(--mobile-bar-clearance)-1rem)]");
  });

  it("keeps the desktop bottom-0 and z-[9999]", () => {
    expect(s).toContain("bottom-0 max-md:bottom-");
    expect(s).toContain("z-[9999]");
  });

  it("pads bottom, left and right by the safe-area inset", () => {
    expect(s).toContain("pb-[max(14px,var(--sab))]");
    expect(s).toContain("pl-[max(18px,var(--sal))]");
    expect(s).toContain("pr-[max(18px,var(--sar))]");
  });
});

// Mutation checks (run by hand, see report): each restored line must turn one of these red.
// 1) lot-inspector h-[95dvh] -> h-[95vh]   2) dialog.tsx overscroll-contain removed
// 3) consent max-md:bottom-[calc(...)] removed
