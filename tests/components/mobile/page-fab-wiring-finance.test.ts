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

// Loans, subscriptions, budgets and goals create through their own form pages
// (route entries, not a usePageFab handler): the list pages must not register a
// create handler, and their FAB links to the create page.
describe("create FABs are routes to the create page (loans, subscriptions, budgets, goals)", () => {
  const LIST_PAGES = [
    { file: `${APP}/loans/page.tsx`, route: "/loans", href: "/loans/new" },
    { file: `${APP}/subscriptions/page.tsx`, route: "/subscriptions", href: "/subscriptions/new" },
    { file: `${APP}/budgets/page.tsx`, route: "/budgets", href: "/budgets/new" },
    { file: `${APP}/goals/page.tsx`, route: "/goals", href: "/goals/new" },
  ] as const;

  for (const p of LIST_PAGES) {
    it(`${p.route} FAB is a route link to ${p.href}`, () => {
      expect(FAB_ROUTES[p.route]).toMatchObject({ kind: "route", href: p.href });
    });

    it(`${p.route} list page does not register a create handler`, () => {
      expect(read(p.file)).not.toMatch(/usePageFab\(/);
    });
  }
});
