// Desktop pages are full width and lay independent cards in 1 / 2 / 3 columns (owner 2026-10-13).
// Static source checks, no rendering: no max-w page wrapper, grid classes present, transactions single column.
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const read = (f: string) => readFileSync(join(__dirname, "../..", f), "utf8");
const code = (f: string) => read(f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const GRID3 = /grid-cols-1[^"`]*regular:grid-cols-2[^"`]*wide:grid-cols-3/;
const APP = "src/app/(app)";

describe("desktop columns: the app pages are full width", () => {
  const PAGES = [
    `${APP}/transactions/page.tsx`,
    `${APP}/categories/_page-content.tsx`,
    `${APP}/categories/[id]/page.tsx`,
    `${APP}/subscriptions/page.tsx`,
    `${APP}/dashboard/page.tsx`,
    `${APP}/family/page.tsx`,
    `${APP}/scenarios/page.tsx`,
    `${APP}/fire/page.tsx`,
    `${APP}/tax/page.tsx`,
    `${APP}/import/page.tsx`,
    `${APP}/whats-new/page.tsx`,
    `${APP}/feedback/page.tsx`,
    `${APP}/api-docs/page.tsx`,
    `${APP}/admin/page.tsx`,
    `${APP}/admin/instance/page.tsx`,
    `${APP}/admin/announcements/page.tsx`,
    `${APP}/admin/(env)/system/page.tsx`,
    `${APP}/admin/(env)/integrations/page.tsx`,
    "src/components/account-hub.tsx",
    "src/app/about/page.tsx",
    "src/app/privacy/page.tsx",
    "src/app/terms/page.tsx",
    "src/app/glossary/page.tsx",
    "src/app/blog/page.tsx",
    "src/app/releases/page.tsx",
    "src/app/roadmap/page.tsx",
    "src/app/vs/page.tsx",
    "src/app/mcp-guide/tools/page.tsx",
    "src/components/mcp-guide/mcp-guide.tsx",
  ];
  for (const f of PAGES) {
    it(`${f} has no max-w page wrapper`, () => {
      const src = code(f);
      expect(src).not.toMatch(/max-w-(report|section|form|doc|console|[2-7]xl|screen-\w+)\b/);
      expect(src).not.toMatch(/\bmx-auto\b.*\bpx-6\b|\bmax-w-\w+\b[^"]*\bpx-6\b\s*py-1[026]/);
    });
  }
});

describe("desktop columns: transactions", () => {
  it("date cards are ONE column at every width (no regular/wide 2-col grid), each card unbroken", () => {
    const src = code("src/components/transactions/mobile-tx-list.tsx");
    expect(src).toMatch(/data-slot="tx-date-groups"/);
    expect(src).toMatch(/grid grid-cols-1 items-start gap-6/);
    expect(src).not.toMatch(/wide:grid-cols-2/);
    expect(src).not.toMatch(/regular:grid-cols-2/);
  });

  it("the opt-in split view keeps a single-column list beside the detail pane", () => {
    const ws = code(`${APP}/transactions/_components/transactions-workspace.tsx`);
    expect(ws).toContain("singleColumn={splitView}");
    expect(ws).toMatch(/splitView \? "grid grid-cols-\[minmax\(0,3fr\)_minmax\(0,2fr\)\]/);
    expect(code("src/components/transactions/mobile-tx-list.tsx")).not.toMatch(/wide:grid-cols-2/);
  });
});

describe("desktop columns: card grids", () => {
  it("TW.grid3 is 1 / 2 / 3 columns", () => {
    expect(code("src/lib/design/tokens.ts")).toMatch(GRID3);
  });

  it("categories: ONE full-width SectionCard list (single column, rows reflow by container width); metric cards max 3 columns", () => {
    const src = code(`${APP}/categories/_page-content.tsx`);
    expect(src).toMatch(/label="Categories"[\s\S]*shadow-\[var\(--list-divider\)\]/);
    expect(src).toContain("<MetricGrid metrics={metrics} columns={3} />");
    expect(code(`${APP}/categories/_components/category-row.tsx`)).toContain("@container");
  });

  it("categories/[id]: summary and recent span the row, chart spans 2", () => {
    const src = code(`${APP}/categories/[id]/page.tsx`);
    expect(src).toMatch(/data-slot="category-detail-cards" className=\{TW\.grid3\}/);
    expect(src).toContain('"col-span-full"');
    expect(src).toContain('"regular:col-span-2"');
  });

  it("subscriptions: status group and suggestion cards span the full row with inner row grids; empty state is a card", () => {
    const src = code(`${APP}/subscriptions/page.tsx`);
    expect(src).toMatch(/data-slot="subscription-groups" className="grid grid-cols-1 gap-6"/);
    expect(src).toMatch(/Found in your transactions" icon=\{Search\} tone="cyan" padded=\{false\} className="col-span-full/);
    expect(src).toMatch(/col-span-full[^`]*\$\{CARD_ROW_GRID\}/);
    expect(src).toMatch(/<Card className="col-span-full"><CardContent className="p-0"><EmptyState/);
  });

  it("dashboard: the 3-card row is a counted grid (columns follow rendered cards: 1 / 2 / 3)", () => {
    expect(code(`${APP}/dashboard/page.tsx`)).toMatch(/ROW3_GRID = \{[^}]*counted: true/);
    expect(code(`${APP}/dashboard/_components/counted-grid.tsx`)).toMatch(/insightColumns\(count\)/);
  });

  it("dashboard: chart + insight rows are equal-width 1 / 2 / 3 grids; Income vs Expenses spans 2 of 3", () => {
    const src = code(`${APP}/dashboard/page.tsx`);
    expect(src).toMatch(/CHARTS_GRID = \{[^}]*grid-cols-1 regular:grid-cols-2 wide:grid-cols-3 items-stretch/);
    expect(src).toMatch(/SPEND_GRID = \{[^}]*grid-flow-dense items-start[^}]*counted: true/);
    expect(src).toMatch(/spending-category-chart" minHeight=\{260\} className=\{`[^`]*h-full/);
    expect(src).toMatch(/income-expense-chart" minHeight=\{300\} className=\{`[^`]*wide:col-span-2/);
  });

  it("accounts: Assets / Liabilities headings are SectionCard labels inside the card; group headers are not monospace", () => {
    const src = code(`${APP}/accounts/page.tsx`);
    expect(src).toMatch(/<SectionCard\s+label=\{/);
    expect(src).not.toMatch(/font-mono/);
    expect(src).not.toMatch(/<h2 className="text-xl font-semibold">/);
  });

  it("family, tax, fire, scenarios, admin, import, utility pages", () => {
    expect(code(`${APP}/family/_components/overview-tab.tsx`)).toMatch(/data-slot="household-charts"[^>]*wide:grid-cols-2/);
    expect(code(`${APP}/tax/page.tsx`)).toMatch(/data-slot="tax-cards" className=\{TW\.grid3\}/);
    expect(code(`${APP}/fire/page.tsx`)).toMatch(/data-slot="fire-layout"[^>]*wide:grid-cols-3/);
    expect(code(`${APP}/scenarios/page.tsx`)).toMatch(/data-slot="scenario-tab"[^>]*wide:grid-cols-3/);
    expect(code(`${APP}/import/page.tsx`)).toMatch(/data-slot="import-top"[^>]*wide:has-\[>:nth-child\(2\)\]:grid-cols-2/);
    expect(code(`${APP}/whats-new/page.tsx`)).toMatch(/data-slot="announcement-cards" className=\{TW\.grid3\}/);
    expect(code(`${APP}/feedback/page.tsx`)).toMatch(/data-slot="feedback-cards" className=\{TW\.grid3\}/);
    expect(code(`${APP}/api-docs/page.tsx`)).toMatch(/data-slot="api-route-groups" className=\{TW\.grid3\}/);
    expect(code(`${APP}/admin/page.tsx`)).toMatch(/value="activity" className=\{`mt-4 \$\{TW\.grid3\}`\}/);
    expect(code(`${APP}/admin/instance/page.tsx`)).toMatch(/data-slot="instance-sections" className=\{TW\.grid3\}/);
    expect(code(`${APP}/admin/(env)/system/page.tsx`)).toMatch(/data-slot="system-cards" className=\{TW\.grid3\}/);
    expect(code(`${APP}/admin/(env)/integrations/page.tsx`)).toMatch(/data-slot="integration-cards" className=\{TW\.grid3\}/);
    expect(code(`${APP}/admin/announcements/page.tsx`)).toMatch(/data-slot="announcement-layout"[^>]*wide:grid-cols-3/);
    expect(code(`${APP}/admin/feedback/page.tsx`)).toMatch(/data-slot="feedback-cards" className=\{TW\.grid3\}/);
    expect(code("src/components/account-hub.tsx")).toContain("TW.grid3");
  });
});

describe("desktop columns: prose pages", () => {
  const PROSE = [
    "src/app/about/page.tsx",
    "src/app/privacy/page.tsx",
    "src/app/terms/page.tsx",
    "src/app/account-deletion/page.tsx",
    "src/app/glossary/[term]/page.tsx",
    "src/app/blog/finlynq-mobile-app/page.tsx",
  ];
  for (const f of PROSE) {
    it(`${f}: full width container, prose element capped at max-w-prose`, () => {
      const src = code(f);
      expect(src).toMatch(/className="w-full px-6 py-16"/);
      expect(src).toMatch(/prose prose-invert max-w-prose/);
      expect(src).not.toMatch(/prose-invert max-w-none/);
    });
  }

  it("list pages (glossary, blog, releases, vs, roadmap) put their cards in the grid", () => {
    for (const f of ["glossary", "blog", "releases", "vs"]) {
      expect(code(`src/app/${f}/page.tsx`), f).toMatch(/grid-cols-1[^"]*regular:grid-cols-2[^"]*wide:grid-cols-3/);
    }
    expect(code("src/app/roadmap/page.tsx")).toMatch(/regular:grid-cols-2 wide:grid-cols-3/);
  });

  it("MCP tool catalog groups are a grid; the guide's card sets are 3 columns at wide", () => {
    expect(code("src/app/mcp-guide/tools/page.tsx")).toMatch(/data-slot="tool-groups"[^>]*wide:grid-cols-3/);
    expect(code("src/components/mcp-guide/mcp-guide.tsx").match(/regular:grid-cols-2 wide:grid-cols-3/g)?.length).toBe(3);
  });
});
