import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const root = path.resolve(__dirname, "../..");
const read = (rel: string) => fs.readFileSync(path.join(root, rel), "utf-8");

describe("W5-14 aria-labels on icon-only buttons", () => {
  it("admin inbox: delete and close-thread buttons are labelled", () => {
    const src = read("src/app/(app)/admin/inbox/page.tsx");
    expect(src).toContain('aria-label="Delete email"');
    expect(src).toContain('aria-label="Close thread"');
    expect(src).toContain("text-destructive hover:text-destructive hover:bg-destructive/10");
    expect(src).not.toContain("text-rose-700 hover:text-rose-800 hover:bg-rose-50");
  });

  it("email rule dialog: remove-condition button is labelled", () => {
    const src = read("src/components/inbox/email-rule-dialog.tsx");
    expect(src).toContain('aria-label="Remove condition"');
    expect(src).toContain("hover:text-destructive");
    expect(src).not.toContain("hover:text-rose-600");
  });

  it("rule editor form: condition/action remove and move buttons are labelled in their rows", () => {
    const src = read("src/components/rules/rule-editor-form.tsx");
    const condStart = src.indexOf("function ConditionRow");
    const actStart = src.indexOf("function ActionRow");
    expect(condStart).toBeGreaterThan(-1);
    expect(actStart).toBeGreaterThan(condStart);
    const condPart = src.slice(condStart, actStart);
    const actPart = src.slice(actStart);
    expect(condPart).toContain('aria-label="Remove condition"');
    expect(actPart).toContain('aria-label="Remove action"');
    expect(actPart).toContain('aria-label="Move up"');
    expect(actPart).toContain('aria-label="Move down"');
    expect(src.indexOf('aria-label="Remove condition"')).toBeLessThan(actStart);
    expect(src.indexOf('aria-label="Remove action"')).toBeGreaterThan(actStart);
  });
});
