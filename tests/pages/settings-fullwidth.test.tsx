// Settings inner pages (and other form/detail pages) are full width with up to 3 columns on desktop
// (owner 2026-10-13). Static checks: no max-w page wrapper on the listed pages; grid classes present.
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const root = join(__dirname, "../..");
const read = (f: string) => readFileSync(join(root, f), "utf8");
const code = (f: string) => read(f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const CAP = /max-w-(report|section|form|doc|console|2xl|3xl|4xl|5xl|6xl|7xl|screen-\w+)\b/;

const GRID_PAGES = [
  "general", "developer", "integrations", "reconciliation", "about",
];
const NO_CAP_FILES = [
  ...["general", "developer", "integrations", "reconciliation", "about", "categorization", "backfill", "investments"].map(
    (p) => `src/app/(app)/settings/${p}/page.tsx`,
  ),
  "src/app/(app)/settings/import/reconcile-visibility/page.tsx",
  "src/app/(app)/account/info/page.tsx",
  "src/components/account-shell.tsx",
  "src/components/manage-accounts.tsx",
  "src/app/(app)/accounts/groups/page.tsx",
  "src/components/templates/detail-page.tsx",
  "src/components/templates/hub-page.tsx",
];

describe("tokens: the 3-column card grid", () => {
  it("TW.grid3 is 1 col phone, 2 at regular, 3 at wide, items-start", () => {
    const t = code("src/lib/design/tokens.ts");
    expect(t).toContain("grid grid-cols-1 items-start gap-6 regular:grid-cols-2 wide:grid-cols-3");
    expect(t).toMatch(/prose:\s*"max-w-prose"/);
  });
});

describe("settings: no page-level max-w or mx-auto wrapper", () => {
  for (const f of NO_CAP_FILES) {
    it(f, () => {
      const src = code(f);
      expect(src).not.toMatch(CAP);
      expect(src).not.toMatch(/\bmx-auto\b/);
    });
  }
  it("SectionPage widths all resolve to no cap", () => {
    const sp = code("src/components/templates/section-page.tsx");
    const block = sp.slice(sp.indexOf("const WIDTH_CLASS"), sp.indexOf("const PAD_CLASS"));
    expect(block).not.toMatch(/TW\./);
  });
});

describe("settings: independent cards sit in the 3-column grid", () => {
  for (const p of GRID_PAGES) {
    it(`/settings/${p} uses SectionPage grid`, () => {
      expect(code(`src/app/(app)/settings/${p}/page.tsx`)).toMatch(/\n\s+grid\n/);
    });
  }
  it("SectionPage renders the body in TW.grid3 when grid is set", () => {
    const sp = code("src/components/templates/section-page.tsx");
    expect(sp).toMatch(/grid \? <SectionGrid>/);
    expect(sp).toMatch(/<div data-slot="section-grid" className=\{TW\.grid3\}>/);
  });
  it("wide blocks span the full row", () => {
    expect(read("src/app/(app)/settings/general/page.tsx")).toMatch(/col-span-full[\s\S]*<FxOverridesSection \/>/);
    for (const p of ["developer", "integrations", "reconciliation"]) {
      expect(read(`src/app/(app)/settings/${p}/page.tsx`)).toMatch(/col-span-full[\s\S]*<Accordion/);
    }
  });
  it("account info and security cards use the grid", () => {
    expect(code("src/app/(app)/account/info/page.tsx")).toContain("TW.grid3");
    expect(code("src/components/settings/account-content.tsx")).toContain("TW.grid3");
  });
  it("hub and detail templates lay sections out in the grid", () => {
    expect(code("src/components/templates/hub-page.tsx")).toContain("TW.grid3");
    expect(code("src/components/templates/detail-page.tsx")).toContain("TW.grid3");
  });
});

describe("form pages: root full width, fields keep a readable column", () => {
  it("FormPage body is capped by BODY_WIDTH_CLASS, the root is not", () => {
    const fp = code("src/components/templates/form-page.tsx");
    expect(fp).toContain("BODY_WIDTH_CLASS[width]");
    expect(fp).toMatch(/cn\("w-full", WIDTH_CLASS\[width\]/);
  });
  for (const f of [
    "src/app/(app)/loans/[id]/edit/page.tsx",
    "src/app/(app)/subscriptions/new/page.tsx",
    "src/app/(app)/subscriptions/[id]/edit/page.tsx",
    "src/app/(app)/categories/_components/category-form.tsx",
    "src/app/(app)/transactions/_components/transaction-edit-form.tsx",
    "src/app/(app)/transactions/_components/transaction-split-form.tsx",
    "src/app/(app)/accounts/[id]/edit/page.tsx",
  ]) {
    it(`${f}: no mx-auto root`, () => {
      expect(code(f)).not.toMatch(/\bmx-auto\b/);
    });
  }
});
