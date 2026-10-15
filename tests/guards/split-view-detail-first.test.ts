// @vitest-environment node
// Guard: goals, loans and subscriptions show the DETAIL first in the split-view pane (owner 2026-10-15). The pane and the
// /x/[id] route render the SAME detail component; the list page opts in with renderDetail and keeps its form for Edit / New.
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const ROOT = path.resolve(__dirname, "../..");
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const APP = "src/app/(app)";

const ENTITIES = [
  { name: "goal", dir: "goals", detail: "GoalDetail", file: "goal-detail.tsx" },
  { name: "loan", dir: "loans", detail: "LoanDetail", file: "loan-detail.tsx" },
  { name: "subscription", dir: "subscriptions", detail: "SubscriptionDetail", file: "subscription-detail.tsx" },
];

describe.each(ENTITIES)("split view detail first: $name", (e) => {
  const detailFile = `${APP}/${e.dir}/_components/${e.file}`;

  it("the list page renders the detail through renderDetail and the form through renderForm", () => {
    const src = code(read(`${APP}/${e.dir}/page.tsx`));
    expect(src).toMatch(/renderDetail=\{/);
    expect(src).toMatch(new RegExp(`<${e.detail}\\b`));
    expect(src).toMatch(/renderForm=\{/);
    expect(src).toContain(`detailHref={(id) => \`/${e.dir}/\${id}\`}`);
    // The pane's cancel goes back to the detail, not away.
    expect(src).toContain("onCancel={api.cancel}");
  });

  it("/x/[id] renders the SAME detail component inside DetailPage", () => {
    const src = code(read(`${APP}/${e.dir}/[id]/page.tsx`));
    expect(src).toMatch(new RegExp(`import \\{[^}]*\\b${e.detail}\\b[^}]*\\} from "[^"]*${e.file.replace(".tsx", "")}"`));
    expect(src).toMatch(new RegExp(`<${e.detail}\\b`));
    expect(src).toContain("<DetailPage");
  });

  it("the detail has no page chrome of its own, sets the pane title and uses the shared DetailList", () => {
    const src = code(read(detailFile));
    expect(src).not.toMatch(/<PageHeader\b/);
    expect(src).not.toMatch(/<PageToolbar\b/);
    expect(src).toContain("usePaneTitle(");
    expect(src).toContain("<DetailList");
  });

  it("only the list page opens the phone detail Overlay (phones keep the sheet; the pane never does)", () => {
    expect(code(read(detailFile))).not.toMatch(/<Overlay\b/);
    expect(code(read(`${APP}/${e.dir}/page.tsx`))).toMatch(/<Overlay\b/);
  });
});

describe("split view detail first: loans amortization", () => {
  it("one amortization component serves the phone panel and the pane (compact)", () => {
    const amort = code(read(`${APP}/loans/_components/loan-amortization.tsx`));
    expect(amort).toContain("export function LoanAmortization");
    expect(amort).toMatch(/compact/);
    expect(code(read(`${APP}/loans/page.tsx`))).toContain("<LoanAmortization");
    expect(code(read(`${APP}/loans/_components/loan-detail.tsx`))).toContain("<LoanAmortization");
    expect(code(read(`${APP}/loans/page.tsx`))).not.toMatch(/<ResponsiveContainer\b/);
  });
});
