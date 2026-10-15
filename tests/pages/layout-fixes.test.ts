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
// Budgets were merged into /categories (2026-10); /budgets redirects there.
const BUDGETS = "src/app/(app)/categories/_page-content.tsx";
const PERF_CHART = "src/components/portfolio/PerformanceChart.tsx";
const ACCOUNT_DETAIL = "src/app/(app)/accounts/[id]/page.tsx";
const HOLDINGS_TABLE = "src/app/(app)/portfolio/_components/holding-account-groups.tsx";
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
  it("PageHeader is the bare global header (no lead hack): the back control comes from the registry", () => {
    const src = read(SETTINGS_GENERAL);
    // The page header comes from the SectionPage template (single PageHeader, back from the registry when `back` is omitted).
    expect(src).toContain("<SectionPage");
    expect(src).not.toContain('lead={<span aria-hidden className="hidden" />}');
    expect(read("src/components/templates/section-page.tsx")).not.toMatch(/\blead=/);
  });

  it("Display Currency and UI Font are inline Fields: label takes the spare width, the control column is fixed", () => {
    const src = read(SETTINGS_GENERAL);
    expect(src).toMatch(/label="Currency"\s+labelPlacement="inline"\s+control="combobox"/);
    expect(src).toContain('controlWidth="w-44 regular:w-56"');
    expect(src).toMatch(/label="Font"\s+labelPlacement="inline"\s+control="select"/);
    expect(src).toContain('controlWidth="w-44 regular:w-48"');
    expect(src).not.toContain('<div className="w-56">');
  });

  it("Animations keeps label-left / switch-right on phones (inline Field)", () => {
    const src = read(SETTINGS_GENERAL);
    expect(src).toMatch(/label="Animations"\s+labelPlacement="inline"\s+control="switch"/);
  });

  it("Theme is an inline segmented Field; the control is not forced to full width", () => {
    const src = read(SETTINGS_GENERAL);
    expect(src).toMatch(/label="Theme"\s+labelPlacement="inline"\s+control="segmented"/);
    expect(src).not.toMatch(/label="Theme"[^>]*\bfill\b/);
  });

  it("general page has no hidden lead node (the settings shell bar that needed it is gone)", () => {
    expect(read(SETTINGS_GENERAL)).not.toContain('<span aria-hidden className="hidden" />');
  });
});

describe("categories (with budgets) at 390", () => {
  it("summary tiles use the shared MetricGrid (2 / 3 / 4 columns by width) and the shared Amount value style, no hand-rolled grid", () => {
    const src = read(BUDGETS);
    expect(src).toContain("<MetricGrid metrics={metrics} columns={3} />");
    expect(src).not.toMatch(/grid-cols-2 gap-3/);
    expect(src).not.toMatch(/(?<![:\w-])text-2xl font-bold/);
  });

  it("the category list is one inset SectionCard of shared CategoryRows (one layout at every width): no Card per group, no table", () => {
    const src = read(BUDGETS);
    expect(src).toMatch(/label="Categories"\s+icon=\{Tags\}\s+tone="indigo"/);
    expect(src).toContain("padded={false}");
    expect(src).toContain("<CategoryRow");
    expect(src).not.toContain("<Table");
  });

  it("month label goes through getMonthLabel and the shared locale helper (no hardcoded locale in the page)", () => {
    const src = read(BUDGETS);
    expect(src).toContain("getMonthLabel");
    expect(src).not.toMatch(/["'](vi-VN|en-CA|en-US|ja-JP)["']/);
    expect(read(CURRENCY)).toMatch(/getMonthLabel[\s\S]*formatDateNames\(date/);
  });
});

describe("portfolio performance controls at 390", () => {
  it("controls are ONE horizontally scrollable row (overflow-x-auto, overscroll-x-contain), no wrap below regular", () => {
    const src = read(PERF_CHART);
    const at = src.indexOf('aria-label="Performance controls"');
    const cls = src.slice(src.indexOf('className="', at) + 11, src.indexOf('"', src.indexOf('className="', at) + 11));
    const row = cls.split(/\s+/);
    expect(row).toEqual(expect.arrayContaining(["overflow-x-auto", "overscroll-x-contain", "flex", "items-center"]));
    expect(row).not.toContain("flex-wrap");
    expect(row).toContain("regular:flex-wrap");
  });

  it("every chip (holding, account, periods) uses the shared CHIP_CLASS: no wrap, 44px tall on coarse pointers", () => {
    const src = read(PERF_CHART);
    expect(src).toContain('const CHIP_CLASS = "shrink-0 whitespace-nowrap pointer-coarse:min-h-11";');
    expect(src.match(/className=\{CHIP_CLASS\}/g)?.length).toBe(3);
  });
});

describe("accounts/[id] at 390", () => {
  it("header actions capsule is not 100% wide (it ran off the right edge)", () => {
    const src = read(ACCOUNT_DETAIL);
    // The right group is the fixed bar layout (col 3, min-w-0, shrink-0); the page passes no override.
    expect(src).not.toMatch(/actionsClassName=/);
    const bar = read("src/components/mobile/page-header.tsx");
    expect(bar).toMatch(/data-slot="page-header-actions"\s+className="[^"]*min-w-0/);
    expect(bar).not.toMatch(/data-slot="page-header-actions"\s+className="[^"]*\bw-full/);
  });

  it("type / currency badge row sits under the bar (not in it), can wrap and is capped to the viewport", () => {
    const src = read(ACCOUNT_DETAIL);
    expect(src).not.toContain("belowTitle");
    const at = src.indexOf("account.currency}</Badge>");
    expect(src.slice(at - 200, at)).toContain("max-w-full flex-wrap");
  });

  it("bottom clearance comes from the (app) layout <main> (clearance + 16px below md), which every page inherits", () => {
    expect(read(APP_LAYOUT)).toContain("pb-[calc(var(--mobile-bar-clearance)+16px)] regular:pb-0");
  });
});

describe("holdings rows at every width (one layout)", () => {
  it("each holding is a HoldingRow inside its account's SectionCard; no table at any width", () => {
    const src = read(HOLDINGS_TABLE);
    expect(src).toContain("<HoldingRow");
    expect(src).toContain("<SectionCard");
    expect(src).not.toMatch(/<Table\b/);
  });

  it("the holding sheet offers Lots, Edit and View transactions", () => {
    const src = read(HOLDINGS_TABLE);
    expect(src).toContain(">Lots<");
    expect(src).toContain(">Edit<");
    expect(src).toContain("View transactions");
    expect(src).toContain("buildTxDrillUrl({ portfolioHolding: open.name");
  });

  it("Lots opens LotInspectorDialog, and its 'Edit all allocations' opens LotAllocationMatrix", () => {
    const table = read(HOLDINGS_TABLE);
    expect(table).toContain("<LotInspectorDialog");
    const dlg = read(LOT_DIALOG);
    expect(dlg).toContain("<LotAllocationMatrix");
    expect(dlg).toContain("onClick={() => setShowMatrix(true)}");
  });
});

describe("reporting toast on phones", () => {
  it("sits above the tab bar via the clearance var, not over content rows", () => {
    const src = read("src/components/reporting-recompute-indicator.tsx");
    expect(src).toContain("max-regular:bottom-[calc(var(--mobile-bar-clearance)+0.5rem)]");
    expect(src).not.toContain("max-regular:bottom-[calc(var(--mobile-bar-clearance)+16px)]");
  });
});
