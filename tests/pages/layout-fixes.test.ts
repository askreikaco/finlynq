/**
 * Static assertions for the page-level visual fixes at 390 and 1280
 * (settings/general, budgets, portfolio performance chips, accounts/[id],
 * dashboard bottom clearance, holdings table containment, lot matrix entry).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf-8");

const SETTINGS_GENERAL = "src/app/(app)/settings/general/page.tsx";
const BUDGETS = "src/app/(app)/budgets/page.tsx";
const PERF_CHART = "src/components/portfolio/PerformanceChart.tsx";
const ACCOUNT_DETAIL = "src/app/(app)/accounts/[id]/page.tsx";
const HOLDINGS_TABLE = "src/app/(app)/portfolio/_components/holdings-table.tsx";
const LOT_DIALOG = "src/components/portfolio/lot-inspector-dialog.tsx";
const APP_LAYOUT = "src/app/(app)/layout.tsx";
const CURRENCY = "src/lib/currency.ts";

const TOUCHED = [SETTINGS_GENERAL, BUDGETS, PERF_CHART, ACCOUNT_DETAIL, HOLDINGS_TABLE];

/** class tokens of the first element whose class string contains `marker` */
function classTokensAround(src: string, marker: string): string[] {
  const at = src.indexOf(marker);
  if (at < 0) return [];
  const start = src.lastIndexOf('className="', at);
  const end = src.indexOf('"', start + 'className="'.length);
  return src.slice(start + 'className="'.length, end).split(/\s+/).filter(Boolean);
}

describe("no fixed-px text on touched pages (system font sizes only)", () => {
  for (const f of TOUCHED) {
    it(`${f} has no text-[Npx]`, () => {
      expect(read(f)).not.toMatch(/text-\[\d+(\.\d+)?px\]/);
    });
  }
});

describe("settings/general at 390", () => {
  it("PageHeader gets a lead so the 44px phone spacer band is not rendered", () => {
    const src = read(SETTINGS_GENERAL);
    expect(src).toContain('lead={<span aria-hidden className="hidden" />}');
  });

  it("Display Currency row is a column below md and a row from md (control full width below md)", () => {
    const src = read(SETTINGS_GENERAL);
    expect(src).toContain('<div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between md:gap-4">');
    expect(src).toContain('<div className="w-full md:w-56 md:shrink-0">');
    expect(src).not.toContain('<div className="w-56">');
  });

  it("UI Font and Animation rows keep label-left / control-right on phones (label takes the spare width)", () => {
    const src = read(SETTINGS_GENERAL);
    expect(src).toContain('<div className="flex items-center justify-between gap-3">\n            <div className="min-w-0 flex-1">\n              <Label>UI Font</Label>');
    expect(src).toContain('<div className="flex items-center justify-between gap-3">\n            <div className="min-w-0 flex-1">\n              <Label htmlFor="animation-toggle">');
    expect(src).toContain('<SelectTrigger className="w-44 shrink-0 md:w-48">');
  });

  it("Appearance row stacks below md; segmented control is not forced to full width", () => {
    const src = read(SETTINGS_GENERAL);
    expect(src).toContain('<div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between md:gap-3">');
    expect(src).toContain('self-start rounded-lg border p-0.5 md:self-auto');
  });

  it("PageHeader keeps desktop placement (lead is display:none, so no gap is added at md+)", () => {
    expect(read(SETTINGS_GENERAL)).toContain('<span aria-hidden className="hidden" />');
  });
});

describe("budgets at 390", () => {
  it("summary values are text-xl with tabular figures and step up to text-2xl only at md+", () => {
    const src = read(BUDGETS);
    expect(src).not.toMatch(/(?<![:\w-])text-2xl font-bold/);
    expect(src.match(/min-w-0 break-words text-xl font-bold tabular-nums regular:text-2xl/g)?.length).toBe(5);
  });

  it("essentials (group) cards use gap-1 so the header is not 16px + padding away from the first row", () => {
    const src = read(BUDGETS);
    expect(src).toContain('<Card key={group} className="gap-1">');
  });

  it("month label goes through getMonthLabel and the shared locale helper (no hardcoded locale in the page)", () => {
    const src = read(BUDGETS);
    expect(src).toContain("getMonthLabel");
    expect(src).not.toMatch(/["'](vi-VN|en-CA|en-US|ja-JP)["']/);
    expect(read(CURRENCY)).toMatch(/getMonthLabel[\s\S]*formatDateNames\(date/);
  });
});

describe("portfolio performance controls at 390", () => {
  it("controls are ONE horizontally scrollable row (overflow-x-auto, overscroll-x-contain), no wrap below md", () => {
    const src = read(PERF_CHART);
    const at = src.indexOf('aria-label="Performance controls"');
    const cls = src.slice(src.indexOf('className="', at) + 11, src.indexOf('"', src.indexOf('className="', at) + 11));
    const row = cls.split(/\s+/);
    expect(row).toEqual(expect.arrayContaining(["overflow-x-auto", "overscroll-x-contain", "flex", "items-center"]));
    expect(row).not.toContain("flex-wrap");
    expect(row).toContain("md:flex-wrap");
  });

  it("every chip (holding, account, periods) uses the shared CHIP_CLASS: no wrap, 44px tall below md", () => {
    const src = read(PERF_CHART);
    expect(src).toContain('const CHIP_CLASS = "shrink-0 whitespace-nowrap max-md:min-h-11";');
    expect(src.match(/className=\{CHIP_CLASS\}/g)?.length).toBe(3);
  });
});

describe("accounts/[id] at 390", () => {
  it("header actions capsule is not 100% wide (it ran off the right edge)", () => {
    const src = read(ACCOUNT_DETAIL);
    const actions = src.match(/actionsClassName="([^"]*)"/)?.[1] ?? "";
    expect(actions).not.toMatch(/(^|\s)w-full(\s|$)/);
    expect(actions).toContain("min-w-0");
  });

  it("type / currency badge row can wrap inside the header and is capped to the viewport", () => {
    const src = read(ACCOUNT_DETAIL);
    const row = src.slice(src.indexOf("belowTitle={"), src.indexOf("belowTitle={") + 200);
    expect(row).toContain("max-w-full flex-wrap");
  });

  it("bottom clearance comes from the (app) layout <main> (clearance + 80px below md), which every page inherits", () => {
    expect(read(APP_LAYOUT)).toContain("pb-[calc(var(--mobile-bar-clearance)+80px)] regular:pb-0");
  });
});

describe("holdings table at 1280", () => {
  it("per-account sub-table is contained in its card with its own horizontal scroller", () => {
    const src = read(HOLDINGS_TABLE);
    expect(src).toContain("w-0 min-w-full overflow-x-auto overscroll-x-contain rounded-md border border-border");
    expect(src).not.toContain("rounded-md border border-border overflow-hidden");
  });

  it("Lots and View txns actions do not wrap", () => {
    const src = read(HOLDINGS_TABLE);
    expect(src).toContain('className="inline-flex items-center gap-1 whitespace-nowrap text-xs');
    expect(src).toContain("flex items-center justify-end gap-2 whitespace-nowrap");
  });

  it("Lots opens LotInspectorDialog, and its 'Edit all allocations' opens LotAllocationMatrix", () => {
    const table = read(HOLDINGS_TABLE);
    expect(table).toMatch(/title="Inspect lots[^"]*"[\s\S]{0,200}?<Layers/);
    expect(table).toContain("<LotInspectorDialog");
    const dlg = read(LOT_DIALOG);
    expect(dlg).toContain("<LotAllocationMatrix");
    expect(dlg).toContain("onClick={() => setShowMatrix(true)}");
  });
});

describe("reporting toast on phones", () => {
  it("sits above the tab bar via the clearance var, not over content rows", () => {
    const src = read("src/components/reporting-recompute-indicator.tsx");
    expect(src).toContain("max-md:bottom-[calc(var(--mobile-bar-clearance)+0.5rem)]");
    expect(src).not.toContain("max-md:bottom-[calc(var(--mobile-bar-clearance)+80px)]");
  });
});
