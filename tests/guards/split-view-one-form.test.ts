// @vitest-environment node
// Guard: the split-view pane and the route pages are ONE form. For every migrated entity, the route pages
// (/x/new, /x/[id]/edit) and the list page import the same shared form component, the list page mounts it inside
// ListDetailLayout, and no second implementation of the inner form exists anywhere else.
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const ROOT = path.resolve(__dirname, "../..");
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const APP = "src/app/(app)";

interface Entity {
  name: string;
  /** The shared component both surfaces import. */
  shared: string;
  /** File that defines it. */
  sharedFile: string;
  /** Route pages that must render it. */
  routes: string[];
  /** The list page (or list component) that mounts it in the pane. */
  list: string;
  /** The inner form component(s) only the shared file may render. */
  inner: string[];
  /** Directory scanned for a second implementation of the inner form. */
  scan: string;
}

// Budget + category: the single category + budget form is CategoryBudgetForm on /categories (a sheet via ?edit=),
// asserted in tests/app/category-budget-form.test.tsx; the budgets split view and the manage list are gone.
const ENTITIES: Entity[] = [
  { name: "transaction", shared: "TransactionFormScreen", sharedFile: `${APP}/transactions/_components/transaction-form-screen.tsx`,
    routes: [`${APP}/transactions/new/page.tsx`, `${APP}/transactions/[id]/edit/page.tsx`, `${APP}/transactions/transfer/[linkId]/edit/page.tsx`],
    list: `${APP}/transactions/_components/transactions-workspace.tsx`, inner: ["TransactionEntryScreen"], scan: `${APP}/transactions` },
  { name: "account", shared: "AccountFormPanel", sharedFile: `${APP}/accounts/_components/account-form-panel.tsx`,
    routes: [`${APP}/accounts/new/page.tsx`, `${APP}/accounts/[id]/edit/page.tsx`], list: `${APP}/accounts/page.tsx`, inner: ["AccountForm"], scan: `${APP}/accounts` },
  { name: "goal", shared: "GoalFormPanel", sharedFile: `${APP}/goals/_components/goal-form-panel.tsx`,
    routes: [`${APP}/goals/new/page.tsx`, `${APP}/goals/[id]/edit/page.tsx`], list: `${APP}/goals/page.tsx`, inner: ["GoalForm"], scan: `${APP}/goals` },
  { name: "loan", shared: "LoanFormPanel", sharedFile: `${APP}/loans/_components/loan-form-panel.tsx`,
    routes: [`${APP}/loans/new/page.tsx`, `${APP}/loans/[id]/edit/page.tsx`], list: `${APP}/loans/page.tsx`, inner: ["LoanForm"], scan: `${APP}/loans` },
  { name: "subscription", shared: "SubscriptionFormPanel", sharedFile: `${APP}/subscriptions/_components/subscription-form-panel.tsx`,
    routes: [`${APP}/subscriptions/new/page.tsx`, `${APP}/subscriptions/[id]/edit/page.tsx`], list: `${APP}/subscriptions/page.tsx`, inner: ["SubscriptionForm"], scan: `${APP}/subscriptions` },
];

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) out.push(...walk(rel));
    else if (/\.(tsx|ts)$/.test(e.name)) out.push(rel);
  }
  return out;
}

describe.each(ENTITIES)("split view: $name has one form", (e) => {
  it("the shared component is defined once and marks itself data-form", () => {
    const src = read(e.sharedFile);
    expect(src).toMatch(new RegExp(`export function ${e.shared}\\b`));
    // FormPage-based panels pass entity="x" (rendered as data-form); the others render data-form themselves.
    expect(src.includes(`entity="${e.name}"`) || src.includes(`data-form="${e.name}"`) || src.includes('data-form="transaction"')).toBe(true);
  });

  it("every route page renders the shared component", () => {
    for (const r of e.routes) {
      const src = read(r);
      expect(src, r).toMatch(new RegExp(`import \\{[^}]*\\b${e.shared}\\b[^}]*\\} from "[^"]*${path.basename(e.sharedFile, ".tsx")}"`));
      expect(src, r).toMatch(new RegExp(`<${e.shared}\\b`));
    }
  });

  it("the list page mounts the SAME component embedded in ListDetailLayout", () => {
    const src = code(read(e.list));
    expect(src).toMatch(new RegExp(`import \\{[^}]*\\b${e.shared}\\b[^}]*\\} from "[^"]*${path.basename(e.sharedFile, ".tsx")}"`));
    expect(src).toMatch(new RegExp(`<${e.shared}\\b`));
    expect(src).toContain("<ListDetailLayout");
    expect(src).toMatch(/embedded/);
  });

  it("no second implementation: only the shared file (and the form's own file) render the inner form", () => {
    for (const comp of e.inner) {
      const offenders = walk(e.scan).filter((f) => {
        if (f === e.sharedFile || f.endsWith(".test.tsx")) return false;
        const src = code(read(f));
        // The defining file mentions `export function X(`; a render site is `<X ` or `<X>`.
        return new RegExp(`<${comp}[\\s>/]`).test(src);
      });
      expect(offenders, `${comp} rendered outside ${e.sharedFile}`).toEqual([]);
    }
  });
});

describe("split view: shared layout", () => {
  it("one ListDetailLayout; list 2fr | pane 1fr; sticky below the top bar", () => {
    const layout = read("src/components/mobile/list-detail-layout.tsx");
    expect(layout).toContain("export function ListDetailLayout");
    const sel = read("src/lib/list-detail/selection.ts");
    expect(sel).toContain("grid-cols-[minmax(0,2fr)_minmax(0,1fr)]");
    expect(sel).toContain("top-[calc(var(--phone-header-h,3.75rem)+var(--sat,0px)+1rem)]");
  });

  it("the old opt-in transactions detail pane and its localStorage toggle are gone", () => {
    expect(fs.existsSync(path.join(ROOT, `${APP}/transactions/_components/transaction-detail-pane.tsx`))).toBe(false);
    expect(fs.existsSync(path.join(ROOT, "src/lib/transactions/split-view.ts"))).toBe(false);
  });
});
