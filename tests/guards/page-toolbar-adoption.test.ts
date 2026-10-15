import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

/** Pages (and the workspace they embed) that carry the shared PageToolbar. Add a page here when it migrates. */
const MIGRATED = [
  "src/app/(app)/transactions/_components/transactions-workspace.tsx",
  "src/app/(app)/accounts/page.tsx",
  "src/app/(app)/accounts/_components/account-detail.tsx",
  "src/app/(app)/goals/page.tsx",
  "src/app/(app)/loans/page.tsx",
  "src/app/(app)/subscriptions/page.tsx",
  "src/app/(app)/portfolio/page.tsx",
  "src/app/(app)/portfolio/dividends/page.tsx",
  "src/app/(app)/portfolio/realized-gains/page.tsx",
  "src/app/(app)/reports/page.tsx",
  "src/app/(app)/dashboard/page.tsx",
  "src/app/(app)/categories/[id]/page.tsx",
];

/** Pages that still render the bare MetricRangeSelect on purpose (see the toolbar rollout notes). */
const BARE_RANGE_ALLOWED = [
  "src/app/(app)/budgets/page.tsx", // merging into categories (claude/cats): wired at merge
  "src/app/(app)/admin/page.tsx", // admin dashboard, not a user list
];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

describe("PageToolbar adoption", () => {
  it.each(MIGRATED)("%s imports and renders PageToolbar", (file) => {
    const src = read(file);
    expect(src).toContain('from "@/components/page-toolbar"');
    expect(src).toContain("<PageToolbar");
  });

  it("no migrated page keeps a bare MetricRangeSelect or its old ad-hoc search / sort UI", () => {
    for (const file of MIGRATED) {
      const src = read(file);
      expect(src, file).not.toContain("<MetricRangeSelect");
      expect(src, file).not.toContain('aria-label="Sort by"');
      expect(src, file).not.toContain("Search and filter");
    }
  });

  it("only the allow-listed pages render a bare MetricRangeSelect", () => {
    const root = join(process.cwd(), "src/app");
    const offenders = walk(root)
      .map((p) => p.slice(process.cwd().length + 1))
      .filter((p) => read(p).includes("<MetricRangeSelect"))
      .filter((p) => !BARE_RANGE_ALLOWED.includes(p));
    expect(offenders).toEqual([]);
  });

  it("the filter page is generic: every list config is reachable and has no label-only filter button", () => {
    const toolbar = read("src/components/page-toolbar.tsx");
    // The funnel button carries an aria-label and no visible text node next to the icon.
    expect(toolbar).toMatch(/aria-label="Filter"/);
    expect(toolbar).not.toMatch(/<Filter className="[^"]*" \/>\s*Filter/);
  });

  it("no page or component renders its own Customize / gear top-bar button (Customize cards lives in the PageHeader More menu)", () => {
    const offenders = walk(join(process.cwd(), "src"))
      .map((p) => p.slice(process.cwd().length + 1))
      .filter((p) => !p.endsWith("components/mobile/page-header.tsx"))
      .filter((p) => /customize-trigger|CustomizeButton/.test(read(p)));
    expect(offenders).toEqual([]);
    expect(read("src/components/mobile/page-header.tsx")).not.toMatch(/customize-trigger|CustomizeButton/);
  });
});

describe("subscriptions metric range", () => {
  it("the subscriptions page feeds its cards from /api/subscriptions/series and the shared range control", () => {
    const src = read("src/app/(app)/subscriptions/page.tsx");
    expect(src).toContain("/api/subscriptions/series");
    expect(src).toContain("useMetricRange");
    expect(src).toContain("range={{ selection, onChange: setSelection }}");
  });
  it("the series route is authenticated and served with the private SWR header", () => {
    const route = read("src/app/api/subscriptions/series/route.ts");
    expect(route).toContain("requireAuth");
    expect(route).toContain("withPrivateSwr");
  });
});
