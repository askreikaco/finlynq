/**
 * @vitest-environment node
 *
 * Source-level wiring check: each finance page registers its FAB handler with
 * usePageFab, under the key that the registry maps its route to, and calls the
 * hook before the component's first early return (rules of hooks).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { FAB_ROUTES } from "@/components/mobile/fab-registry";

const APP = "src/app/(app)";

const PAGES = [
  { file: `${APP}/accounts/[id]/page.tsx`, component: "AccountDetailPage", route: "/accounts/[id]", key: "accounts.detail.add" },
  { file: `${APP}/budgets/page.tsx`, component: "BudgetsPage", route: "/budgets", key: "budgets.create" },
  { file: `${APP}/goals/page.tsx`, component: "GoalsPage", route: "/goals", key: "goals.create" },
] as const;

function read(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

/** Index of the first top-level early return (2-space indent) inside the named component. */
function firstEarlyReturnIndex(src: string, component: string): number {
  const start = src.search(new RegExp(`function ${component}\\(`));
  expect(start, `component ${component} found`).toBeGreaterThan(-1);
  const body = src.slice(start);
  const m = /^ {2}(if \(.*\)|return\b)/m.exec(body);
  expect(m, `early return in ${component}`).not.toBeNull();
  return start + (m as RegExpExecArray).index;
}

describe("finance pages wire usePageFab", () => {
  for (const p of PAGES) {
    describe(p.route, () => {
      const src = read(p.file);

      it("imports usePageFab from @/components/mobile/page-fab", () => {
        expect(src).toContain('from "@/components/mobile/page-fab"');
        expect(src).toMatch(/import \{[^}]*\busePageFab\b[^}]*\} from "@\/components\/mobile\/page-fab"/);
      });

      it(`calls usePageFab("${p.key}", ...)`, () => {
        expect(src).toContain(`usePageFab("${p.key}",`);
      });

      it(`registry maps ${p.route} to handler key ${p.key}`, () => {
        const entry = FAB_ROUTES[p.route];
        expect(entry.kind).toBe("handler");
        if (entry.kind === "handler") expect(entry.handlerKey).toBe(p.key);
      });

      it("calls the hook before the first early return", () => {
        const hookIdx = src.indexOf(`usePageFab("${p.key}",`);
        expect(hookIdx).toBeGreaterThan(-1);
        expect(hookIdx).toBeLessThan(firstEarlyReturnIndex(src, p.component));
      });
    });
  }
});

// Loans and subscriptions converted: the list pages no longer register a create
// handler. Their create FAB is a route to the full create page instead.
describe("loans and subscriptions FAB is a route to the create page", () => {
  for (const [route, target] of [["/loans", "/loans/new"], ["/subscriptions", "/subscriptions/new"]] as const) {
    it(`${route} routes its FAB to ${target}`, () => {
      const entry = FAB_ROUTES[route];
      expect(entry.kind).toBe("route");
      if (entry.kind === "route") expect(entry.href).toBe(target);
    });
    it(`${route} page does not register a create handler`, () => {
      const src = read(`${APP}/${route.slice(1)}/page.tsx`);
      expect(src).not.toMatch(/usePageFab\(/);
    });
  }
});
