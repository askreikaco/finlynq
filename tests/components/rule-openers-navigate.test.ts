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
    "src/app/(app)/categories/_components/category-management.tsx",
    "src/app/(app)/settings/categorization/page.tsx",
  ];
  it.each(files)("%s has no inline add or rename form", (file) => {
    const src = read(file);
    expect(src).not.toMatch(/newCatForm|showAddCat|editingId|setEditName|handleEditCategory|handleAddCategory/);
    expect(src).not.toMatch(/aria-label="Save category name"/);
  });

  it.each(files)("%s links to /categories/new and /categories/[id]/edit", (file) => {
    const src = read(file);
    if (file.endsWith("settings/categorization/page.tsx")) {
      // the legacy screen renders the shared list (which owns the links)
      expect(src).toMatch(/CategoryManagement/);
    } else {
      expect(src).toMatch(/\/categories\/new\?returnTo=/);
      expect(src).toMatch(/\/categories\/\$\{cat\.id\}\/edit\?returnTo=/);
    }
  });
});
