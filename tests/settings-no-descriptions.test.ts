import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import { join, resolve, relative } from "path";

/**
 * Settings wording guard: help text lives in an InfoTip (src/components/ui/info-tip.tsx), not in visible
 * description paragraphs under headings. Pragmatic, source-level check over the settings pages and components.
 *
 * Allowed to stay visible, marked with a `data-keep="<why>"` attribute on the <p>:
 *   status / empty / data / warning / validation / label  (live feedback, empty states, record data, destructive warnings)
 * Anything else with `text-muted-foreground` on a <p> is treated as a description paragraph and fails.
 */
const ROOT = resolve(__dirname, "..");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith(".tsx")) out.push(p);
  }
  return out;
}

const FILES = [
  ...walk(join(ROOT, "src/app/(app)/settings")).filter((f) => !f.includes("/categorization/")),
  ...walk(join(ROOT, "src/components/settings")),
  ...[
    "src/components/settings-hub.tsx",
    "src/components/settings-shell.tsx",
    "src/components/active-currencies-section.tsx",
    "src/components/fx-overrides-section.tsx",
    "src/components/inbox/reconcile-hide-accounts-card.tsx",
    "src/components/rules/rule-editor-form.tsx",
  ].map((f) => join(ROOT, f)),
];

/** FormPage subtitles that name the record being edited (data, not help text). */
const SUBTITLE_ALLOW = [
  "investments/securities/[id]/link/page.tsx",
  "investments/securities/[id]/prices/page.tsx",
  "investments/accounts/[id]/link/page.tsx",
];

const rel = (f: string) => relative(ROOT, f);

describe("settings pages carry no visible description text", () => {
  it("scans a meaningful set of files", () => {
    expect(FILES.length).toBeGreaterThan(30);
  });

  it("has no unmarked <p className=text-muted-foreground> description paragraphs", () => {
    const bad: string[] = [];
    for (const f of FILES) {
      const src = readFileSync(f, "utf8");
      for (const m of src.matchAll(/<p\b[^>]*>/g)) {
        const tag = m[0];
        if (tag.includes("muted-foreground") && !tag.includes("data-keep")) {
          bad.push(`${rel(f)}:${src.slice(0, m.index).split("\n").length}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it("uses no CardDescription or AccordionItem description", () => {
    const bad: string[] = [];
    for (const f of FILES) {
      const src = readFileSync(f, "utf8");
      if (/CardDescription/.test(src)) bad.push(`${rel(f)}: CardDescription`);
      for (const m of src.matchAll(/<AccordionItem\b/g)) {
        // the attribute list ends at the first line holding only ">"
        const rest = src.slice(m.index);
        const attrs = rest.slice(0, rest.search(/\n\s*>\s*\n/));
        if (/\bdescription=/.test(attrs)) bad.push(`${rel(f)}: AccordionItem description`);
      }
    }
    expect(bad).toEqual([]);
  });

  it("sets no page-header subtitle", () => {
    const bad: string[] = [];
    for (const f of FILES) {
      if (SUBTITLE_ALLOW.some((a) => f.endsWith(a))) continue;
      const src = readFileSync(f, "utf8");
      if (/<(PageHeader|SectionPage|FormPage)\b[^>]*\bsubtitle=/.test(src)) bad.push(`${rel(f)}: subtitle=`);
      if (/\bsubtitle:\s*["`]/.test(src)) bad.push(`${rel(f)}: subtitle:`);
    }
    expect(bad).toEqual([]);
  });

  it("settings hub rows are label only (no description line)", () => {
    const src = readFileSync(join(ROOT, "src/components/settings-hub.tsx"), "utf8");
    expect(src).not.toMatch(/description/i);
  });
});
