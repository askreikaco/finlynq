import { describe, it, expect } from "vitest";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const css = read("src/app/globals.css");

function block(selector: RegExp): string {
  const m = css.match(selector);
  if (!m) throw new Error(`no block ${selector}`);
  return m[0];
}

describe("--list-divider token", () => {
  it("light value (in :root) is the owner's exact shadow", () => {
    expect(css).toContain("--list-divider: rgba(100, 121, 143, 0.12) 0px -1px 0px 0px inset;");
  });
  it("dark value (in .dark) is the owner's exact shadow", () => {
    const idx = css.indexOf("--list-divider: inset 0 -1px 0 0 rgba(255, 255, 255, 0.12);");
    expect(idx).toBeGreaterThan(-1);
    // it sits inside a .dark { } block
    const before = css.slice(0, idx);
    expect(before.lastIndexOf(".dark {")).toBeGreaterThan(before.lastIndexOf("}"));
    // and the light one inside :root
    const li = css.indexOf("--list-divider: rgba(100");
    const lb = css.slice(0, li);
    expect(lb.lastIndexOf(":root {")).toBeGreaterThan(lb.lastIndexOf("}"));
    void block;
  });
});

// List / group components: separators between items are the --list-divider shadow, never divide-y / border-b.
const LIST_FILES = [
  "src/components/mobile/list-row.tsx",
  "src/components/mobile/inset-group.tsx",
  "src/components/mobile/detail-sheet.tsx",
  "src/components/mobile/column-list.tsx",
  "src/components/mobile/section-card.tsx",
  "src/components/mobile/account-row.tsx",
  "src/components/mobile/holding-row.tsx",
  "src/components/more-menu.tsx",
  "src/components/settings-hub.tsx",
  "src/components/account-hub.tsx",
  "src/components/templates/hub-page.tsx",
  "src/components/transactions/mobile-tx-list.tsx",
  "src/components/forms/form-group.tsx",
  "src/components/transactions/entry/grouped-picker.tsx",
  "src/app/(app)/accounts/page.tsx",
  "src/app/(app)/accounts/_components/manage-groups-panel.tsx",
  "src/app/(app)/categories/[id]/page.tsx",
  "src/app/(app)/categories/_page-content.tsx",
  "src/app/(app)/categories/_components/category-row.tsx",
  "src/components/mobile/progress-row.tsx",
  "src/app/(app)/goals/page.tsx",
  "src/app/(app)/loans/page.tsx",
  "src/app/(app)/subscriptions/page.tsx",
  "src/app/(app)/portfolio/_components/holding-account-groups.tsx",
  "src/app/(app)/portfolio/_components/investment-transactions.tsx",
  "src/app/(app)/reports/_components/statement-rows.tsx",
  "src/app/(app)/admin/page.tsx",
  "src/app/(app)/admin/email-inbox/page.tsx",
  "src/app/(app)/admin/inbox/page.tsx",
  "src/app/(app)/dashboard/_components/action-center.tsx",
  "src/app/(app)/dashboard/_components/insights-section.tsx",
  "src/app/(app)/settings/investments/page.tsx",
];

// Intentional non-list uses of a border, per file (regex on the line) with the reason.
const ALLOW: Array<[string, RegExp, string]> = [
  ["src/app/(app)/admin/inbox/page.tsx", /border-b px-3 pt-3|SheetHeader|border-b px-4 py-3|border-t px-4 py-3/, "tab strip / sheet header+footer frames, not list rows"],
  ["src/components/transactions/entry/grouped-picker.tsx", /SheetHeader/, "sheet header frame, not a list row"],
];

describe("list components use the divider shadow, not divide-y / border-b", () => {
  for (const f of LIST_FILES) {
    it(f, () => {
      const src = read(f);
      expect(src, "divide-y").not.toMatch(/divide-y/);
      expect(src, "divide-border").not.toMatch(/divide-border/);
      expect(src, "last:border-0").not.toMatch(/last:border-(0|b-0)/);
      expect(src, "[&>*]:border-b").not.toMatch(/\[&>\*\]:border-b/);
      const allow = ALLOW.filter(([p]) => p === f).map(([, rx]) => rx);
      const offenders = src
        .split("\n")
        .filter((l) => /(^|[\s"'`])border-b(\s|"|'|`|$)/.test(l))
        .filter((l) => !allow.some((rx) => rx.test(l)));
      expect(offenders).toEqual([]);
    });
  }

  it("the whole of src has no divide-y outside the allowlisted table", () => {
    
    const out = execSync("grep -rln 'divide-y' src --include=*.tsx --include=*.ts || true", { encoding: "utf8" })
      .split("\n")
      .filter(Boolean);
    // balance-warning-banner: a <tbody> of table rows (box-shadow on <tr> is unreliable), not a list.
    expect(out).toEqual(["src/components/staging/balance-warning-banner.tsx"]);
  });

  it("rows carry the shared utility", () => {
    for (const f of ["src/components/mobile/inset-group.tsx", "src/components/mobile/detail-sheet.tsx", "src/components/mobile/section-card.tsx"]) {
      expect(read(f)).toContain("shadow-[var(--list-divider)]");
    }
  });
});
