import { describe, it, expect } from "vitest";
import * as fs from "fs";
import {
  FAB_HANDLER_KEYS,
  FAB_ROUTES,
  resolveFab,
  type FabHandlerRegistration,
} from "@/components/mobile/fab-registry";

// Source-level wiring check: each settings/categories page registers its
// primary action through usePageFab, before any early return, under the key
// the route entry in FAB_ROUTES expects.

const WIRED = [
  {
    key: "settings.categories.create",
    route: "/settings/categorization",
    file: "src/app/(app)/settings/categorization/page.tsx",
    component: "CategorizationSettingsPage",
  },
  {
    key: "categories.create",
    route: "/categories",
    file: "src/app/(app)/categories/_components/category-management.tsx",
    component: "CategoryManagement",
  },
  {
    key: "investments.security.create",
    route: "/settings/investments",
    file: "src/app/(app)/settings/investments/page.tsx",
    component: "InvestmentsSettingsPage",
  },
  {
    key: "rules.create",
    route: "/settings/rules",
    file: "src/components/settings/sections/rules-section.tsx",
    component: "RulesSection",
  },
] as const;

describe.each(WIRED)("FAB wiring: $key", ({ key, route, file, component }) => {
  const src = fs.readFileSync(file, "utf8");

  it("imports usePageFab from @/components/mobile/page-fab", () => {
    expect(src).toMatch(
      /import \{[^}]*\busePageFab\b[^}]*\} from "@\/components\/mobile\/page-fab";/,
    );
  });

  it(`calls usePageFab("${key}", ...) at component level`, () => {
    expect(src).toMatch(new RegExp(`^  usePageFab\\("${key.replace(/\./g, "\\.")}",`, "m"));
  });

  it(`FAB_ROUTES["${route}"] is a handler entry with handlerKey "${key}"`, () => {
    expect(FAB_HANDLER_KEYS).toContain(key);
    expect(FAB_ROUTES[route]).toMatchObject({ kind: "handler", handlerKey: key });
  });

  it("calls the hook before the component's first early return", () => {
    const start = src.search(new RegExp(`export (default )?function ${component}\\(`));
    expect(start, `${component} not found in ${file}`).toBeGreaterThanOrEqual(0);
    const body = src.slice(start);
    const hookIdx = body.search(new RegExp(`^  usePageFab\\("${key.replace(/\./g, "\\.")}",`, "m"));
    const earlyIdx = body.search(/^  (if \(|return\b)/m);
    expect(hookIdx, "usePageFab call missing").toBeGreaterThanOrEqual(0);
    if (earlyIdx !== -1) {
      expect(hookIdx, "usePageFab must precede the first early return").toBeLessThan(earlyIdx);
    }
  });
});

describe("rules.create is inert off /settings/rules", () => {
  // RulesSection also mounts on /settings/reconciliation and /settings/import.
  // resolveFab only reads a handler for the route whose entry names that key.
  const handlers = new Map<(typeof FAB_HANDLER_KEYS)[number], FabHandlerRegistration>([
    ["rules.create", { onClick: () => {} }],
  ]);

  it("does not render the rules button on reconciliation or import", () => {
    expect(resolveFab("/settings/reconciliation", handlers)?.type).not.toBe("button");
    expect(resolveFab("/settings/import", handlers)?.type).not.toBe("button");
  });

  it("renders the rules button on /settings/rules", () => {
    expect(resolveFab("/settings/rules", handlers)?.type).toBe("button");
  });
});
