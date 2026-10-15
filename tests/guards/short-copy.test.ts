import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync, existsSync } from "fs";
import { join, resolve, relative } from "path";

/**
 * Short-copy guard: visible copy is a label, a value/input and at most a very short hint. Explanations, field
 * descriptions and helper paragraphs live in the shared (i) InfoTip (src/components/ui/info-tip.tsx), reached through
 * `FieldLabel` / `FormField` (field help), `Overlay info` (dialog / sheet help), `CardTitle info` (card help),
 * `SectionPage info` / `PageHeader info` (page help) or a bare `<InfoTip>`.
 *
 * Source-level and pragmatic (same approach as tests/settings-no-descriptions.test.ts, which covers settings).
 * A muted paragraph that may stay visible carries `data-keep="<why>"`: status | empty | data | label | warning.
 */
const ROOT = resolve(__dirname, "..", "..");
const SRC = join(ROOT, "src");
const rel = (f: string) => relative(ROOT, f);

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith(".tsx")) out.push(p);
  }
  return out;
}

const ALL = walk(SRC);
const read = (f: string) => readFileSync(f, "utf8");
const lineOf = (src: string, index: number) => src.slice(0, index).split("\n").length;

/** Form / panel files: no unmarked muted <p> (a description under an input or a title). */
const FORM_FILES = [
  "src/app/(app)/accounts/_components/account-form.tsx",
  "src/app/(app)/accounts/_components/account-form-panel.tsx",
  "src/app/(app)/accounts/_components/group-field.tsx",
  "src/app/(app)/goals/_components/goal-form.tsx",
  "src/app/(app)/loans/_components/loan-form.tsx",
  "src/app/(app)/subscriptions/_components/subscription-form.tsx",
  "src/app/(app)/categories/_components/category-budget-form.tsx",
  "src/components/holdings/holding-edit-form.tsx",
  "src/components/inbox/mode-picker.tsx",
  "src/components/inbox/import-prefs-picker.tsx",
  "src/components/forms/field-label.tsx",
  "src/components/forms/form-row.tsx",
  "src/components/onboarding-tips.tsx",
  "src/components/reports/income-expense-trend-card.tsx",
  "src/app/(app)/tax/page.tsx",
  "src/app/(app)/fire/page.tsx",
  "src/app/(app)/family/_components/section-checklist.tsx",
  "src/app/(app)/import/components/edit-template-dialog.tsx",
  "src/app/(app)/import/components/save-template-dialog.tsx",
  "src/app/(app)/import/components/column-mapping-dialog.tsx",
  "src/app/(app)/import/components/csv-mapper-dialog.tsx",
  "src/app/(app)/import/components/excel-mapper-dialog.tsx",
  "src/app/(app)/import/components/import-preview-dialog.tsx",
  "src/app/(app)/import/components/ofx-confirm-dialog.tsx",
  "src/app/(app)/import/components/connector-tab.tsx",
  "src/app/(app)/import/components/moneypro-connector-tab.tsx",
  "src/app/(app)/import/components/generic-csv-connector-tab.tsx",
  "src/app/(app)/import/components/investment-statement-importer.tsx",
  "src/app/(app)/account/info/page.tsx",
  "src/components/portfolio/lot-inspector-dialog.tsx",
  "src/app/(app)/portfolio/_components/etf-xray-card.tsx",
  "src/app/(app)/admin/instance/page.tsx",
  "src/app/(app)/admin/email-inbox/page.tsx",
].map((f) => join(ROOT, f));

/**
 * Files that may still render a visible Card description (Overlay has no description element: its `info` is an (i) tip). Each entry says why.
 * New entries need a reason a reviewer would accept (destructive confirm, record data, short warning).
 */
const DESCRIPTION_ALLOWLIST: Record<string, string> = {
  "src/app/(app)/transactions/audit/page.tsx": "record data (recorded amount and account currency)",
  "src/app/(app)/reports/page.tsx": "data lines (group counts and totals)",
  "src/app/(app)/dev/gallery/page.tsx": "component gallery showing the primitives",
};

describe("short copy: help text lives in (i) tips", () => {
  it("scans a meaningful set of files and they all exist", () => {
    expect(ALL.length).toBeGreaterThan(300);
    const missing = FORM_FILES.filter((f) => !existsSync(f)).map(rel);
    expect(missing).toEqual([]);
  });

  it("has no unmarked muted <p> in form / panel files (use FieldLabel info, Overlay info, CardTitle info)", () => {
    const bad: string[] = [];
    for (const f of FORM_FILES) {
      const src = read(f);
      for (const m of src.matchAll(/<p\b[^>]*>/g)) {
        if (m[0].includes("muted-foreground") && !m[0].includes("data-keep")) {
          bad.push(`${rel(f)}:${lineOf(src, m.index!)}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it("uses no FormDescription anywhere", () => {
    const bad = ALL.filter((f) => /<FormDescription\b/.test(read(f))).map(rel);
    expect(bad).toEqual([]);
  });

  it("renders Dialog / Sheet / Card descriptions only in allow-listed files", () => {
    const bad: string[] = [];
    for (const f of ALL) {
      const r = rel(f);
      if (/<(DialogDescription|SheetDescription|CardDescription|AlertDialogDescription)\b/.test(read(f)) && !(r in DESCRIPTION_ALLOWLIST)) {
        bad.push(r);
      }
    }
    expect(bad).toEqual([]);
  });

  it("the Overlay has no visible description: explanations go through its info tip, with an sr-only copy", () => {
    const src = read(join(ROOT, "src/components/ui/overlay.tsx"));
    expect(src).toContain("InfoTip");
    for (const m of src.matchAll(/<DialogPrimitive\.Description\b[^>]*>/g)) expect(m[0]).toContain("sr-only");
    expect(src).not.toMatch(/<(DialogDescription|SheetDescription)\b/);
  });

  it("keeps the allow-list honest (every entry still renders a description)", () => {
    const stale = Object.keys(DESCRIPTION_ALLOWLIST).filter(
      (r) => !/<(DialogDescription|SheetDescription|CardDescription|AlertDialogDescription)\b/.test(read(join(ROOT, r))),
    );
    expect(stale).toEqual([]);
  });

  it("account form: every field label carries its help in an InfoTip, no hint paragraph under an input", () => {
    const src = read(join(ROOT, "src/app/(app)/accounts/_components/account-form.tsx"));
    expect(src).toContain("FormField");
    expect(src).toContain("FieldLabel");
    expect(src).not.toMatch(/hint=/);
    expect(src).not.toMatch(/<p\b[^>]*muted/);
    for (const key of ["name", "alias", "type", "group", "currency", "note", "openingBalance", "isInvestment", "invisible"]) {
      expect(src, `INFO.${key}`).toContain(`info={INFO.${key}}`);
    }
  });
});
