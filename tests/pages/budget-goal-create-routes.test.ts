// @vitest-environment node
/**
 * Static guard for the budgets and goals create/edit flows: the list pages
 * navigate to full pages (iOS multi-level navigation), the old dialogs are
 * gone, and each form lives in a shared component the route page renders.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const APP = "src/app/(app)";
const read = (rel: string) => readFileSync(resolve(process.cwd(), rel), "utf8");

const BUDGETS = read(`${APP}/budgets/page.tsx`);
const GOALS = read(`${APP}/goals/page.tsx`);

describe("budgets list: openers navigate, no create/edit dialog", () => {
  it("renders no Dialog and holds no dialog-open state", () => {
    expect(BUDGETS).not.toMatch(/<Dialog\b/);
    expect(BUDGETS).not.toMatch(/DialogTrigger|DialogContent/);
    expect(BUDGETS).not.toMatch(/setDialogOpen|setTemplateDialogOpen|setApplyTemplateDialogOpen|setMoveMoneyDialogOpen/);
  });

  it("links to each form page and passes the list URL as returnTo", () => {
    expect(BUDGETS).toContain("/budgets/new?");
    expect(BUDGETS).toContain("/budgets/templates/new?");
    expect(BUDGETS).toContain("/budgets/templates/apply?");
    expect(BUDGETS).toContain("/budgets/move-money?");
    expect(BUDGETS).toMatch(/returnTo=\$\{encodeURIComponent\(listUrl\)\}/);
  });

  it("keeps the delete confirmation as a dialog", () => {
    expect(BUDGETS).toContain("<ConfirmDialog");
  });
});

describe("goals list: openers navigate, no create/edit dialog", () => {
  it("renders no Dialog and no GoalEditForm", () => {
    expect(GOALS).not.toMatch(/<Dialog\b/);
    expect(GOALS).not.toMatch(/GoalEditForm|setAddOpen|setEditGoal|seedForm/);
  });

  it("links the create and edit actions to their pages", () => {
    expect(GOALS).toContain('href="/goals/new"');
    expect(GOALS).toContain("href={`/goals/${g.id}/edit`}");
  });

  it("keeps the delete confirmation as a dialog", () => {
    expect(GOALS).toContain("<ConfirmDialog");
  });
});

describe("route pages render the shared form components", () => {
  const WIRING: [string, string, string][] = [
    [`${APP}/budgets/new/page.tsx`, "SetBudgetForm", "../_components/set-budget-form"],
    [`${APP}/budgets/templates/new/page.tsx`, "SaveTemplateForm", "../../_components/save-template-form"],
    [`${APP}/budgets/templates/apply/page.tsx`, "ApplyTemplateForm", "../../_components/apply-template-form"],
    [`${APP}/budgets/move-money/page.tsx`, "MoveMoneyForm", "../_components/move-money-form"],
    [`${APP}/goals/new/page.tsx`, "GoalForm", "../_components/goal-form"],
    [`${APP}/goals/[id]/edit/page.tsx`, "GoalForm", "../../_components/goal-form"],
  ];
  for (const [file, component, from] of WIRING) {
    it(`${file} renders <${component}> from ${from}`, () => {
      const src = read(file);
      expect(src).toMatch(new RegExp(`import \\{[^}]*\\b${component}\\b[^}]*\\} from "${from.replace(/[./]/g, (c) => `\\${c}`)}"`));
      expect(src).toMatch(new RegExp(`<${component}\\b`));
    });
  }

  it("every form-page back/return target is validated with safeReturnTo", () => {
    for (const f of [
      `${APP}/budgets/new/page.tsx`,
      `${APP}/budgets/templates/new/page.tsx`,
      `${APP}/budgets/templates/apply/page.tsx`,
      `${APP}/budgets/move-money/page.tsx`,
      `${APP}/goals/new/page.tsx`,
      `${APP}/goals/[id]/edit/page.tsx`,
    ]) {
      expect(read(f), f).toMatch(/safeReturnTo\(searchParams\.get\("returnTo"\)/);
    }
  });

  it("the goal edit page keeps Delete in the overflow menu and behind a confirm dialog", () => {
    const src = read(`${APP}/goals/[id]/edit/page.tsx`);
    expect(src).toMatch(/label: "Delete goal"[^}]*destructive: true/);
    expect(src).toContain("<ConfirmDialog");
  });
});
