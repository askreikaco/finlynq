// @vitest-environment node
// Guard: every input in the split-view pane forms renders through <Field> with a VISIBLE label (not hideLabel, not
// placeholder-only, not aria-label-only), and no raw <input>/<select>/<textarea> is used. Field itself is unchanged.
// Behavioural check (getByLabelText) for the category form lives in tests/app/category-budget-form.test.tsx.
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const ROOT = path.resolve(__dirname, "../..");
const APP = "src/app/(app)";

const PANE_FORMS = [
  `${APP}/categories/_components/category-budget-form.tsx`,
  `${APP}/categories/_components/category-form-panel.tsx`,
  `${APP}/goals/_components/goal-form.tsx`,
  `${APP}/loans/_components/loan-form.tsx`,
  `${APP}/subscriptions/_components/subscription-form.tsx`,
  `${APP}/accounts/_components/account-form.tsx`,
  "src/components/transactions/entry/transaction-entry-screen.tsx",
  "src/components/transactions/entry/repeat-section.tsx",
  "src/components/transactions/split-rows/split-rows.tsx",
  "src/components/transactions/transaction-form-body.tsx",
];

/** The attribute text of every <Field ...> opening tag (braces and strings respected). */
function fieldTags(src: string): string[] {
  const out: string[] = [];
  const re = /<Field\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    let j = m.index + m[0].length;
    let depth = 0;
    let quote: string | null = null;
    for (; j < src.length; j++) {
      const c = src[j];
      if (quote) { if (c === quote) quote = null; continue; }
      if (c === '"' || c === "'" || c === "`") quote = c;
      else if (c === "{") depth++;
      else if (c === "}") depth--;
      else if (c === ">" && depth === 0) break;
    }
    out.push(src.slice(m.index + m[0].length, j));
  }
  return out;
}

describe.each(PANE_FORMS)("visible labels: %s", (rel) => {
  const src = fs.readFileSync(path.join(ROOT, rel), "utf8").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

  it("every <Field> has a label prop and none hides it", () => {
    const bad = fieldTags(src).filter((attrs) => !/(?<![\w-])label=/.test(attrs) || /\bhideLabel\b/.test(attrs));
    expect(bad.map((a) => a.replace(/\s+/g, " ").slice(0, 120))).toEqual([]);
  });

  it("no raw input, select or textarea (they would bypass Field's label)", () => {
    expect(src.match(/<(input|select|textarea)\b/g) ?? []).toEqual([]);
  });
});
