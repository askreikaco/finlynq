/**
 * Static guard (PKG5): the rule and category openers navigate to the full
 * create/edit pages. They must not render RuleEditorDialog or an inline add or
 * rename form. The dialog file stays only for transaction-dialog.tsx, and it
 * carries its removal note.
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";

const read = (p: string) => fs.readFileSync(p, "utf8");

describe("rule openers use navigation", () => {
  const openers = [
    "src/components/settings/sections/rules-section.tsx",
    "src/components/staging/unresolved-categories-banner.tsx",
  ];
  it.each(openers)("%s does not import or render RuleEditorDialog", (file) => {
    const src = read(file);
    expect(src).not.toMatch(/RuleEditorDialog/);
    expect(src).not.toMatch(/rule-editor-dialog/);
    expect(src).not.toMatch(/showEditor|setShowEditor/);
  });

  it.each(openers)("%s links or routes to /settings/rules/new", (file) => {
    expect(read(file)).toMatch(/\/settings\/rules\/new/);
  });

  it("the transaction-rule editor dialog keeps its removal note", () => {
    const src = read("src/components/rules/rule-editor-dialog.tsx");
    expect(src).toMatch(/To be removed once \/settings\/rules\/new is used by transactions/);
  });

  it("the shared form has no dialog chrome", () => {
    const src = read("src/components/rules/rule-editor-form.tsx");
    expect(src).not.toMatch(/@\/components\/ui\/dialog/);
  });
});

describe("category openers use navigation", () => {
  const files = [
    "src/app/(app)/categories/_page-content.tsx",
    "src/app/(app)/categories/_components/category-budget-form.tsx",
  ];
  it.each(files)("%s has no inline add or rename form", (file) => {
    const src = read(file);
    expect(src).not.toMatch(/newCatForm|showAddCat|editingId|setEditName|handleEditCategory|handleAddCategory/);
    expect(src).not.toMatch(/aria-label="Save category name"/);
  });

  it("the categories page opens the one shared form (the pane at wide, /categories/new and /categories/[id]/edit below)", () => {
    const src = read("src/app/(app)/categories/_page-content.tsx");
    expect(src).toContain("/categories/new");
    expect(src).toContain("openEdit(id)");
  });
});
