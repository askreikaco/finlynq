import { describe, it, expect } from "vitest";
import * as fs from "fs";
import { FAB_ROUTES, resolveFab } from "@/components/mobile/fab-registry";

// PKG5: create actions for categories and rules are navigation (full pages),
// not usePageFab handlers. Each list screen's FAB is a route to the create page,
// and the create/edit pages themselves are hidden from the FAB.

const ROUTE_FABS = [
  { route: "/settings/categorization", href: "/categories/new", label: "Add category" },
  { route: "/categories", href: "/categories/new", label: "Add category" },
  { route: "/settings/rules", href: "/settings/rules/new", label: "Add rule" },
] as const;

describe.each(ROUTE_FABS)("FAB route: $route", ({ route, href, label }) => {
  it(`is a route entry to ${href} labelled "${label}"`, () => {
    expect(FAB_ROUTES[route]).toMatchObject({ kind: "route", href, label });
  });

  it("resolves to a link, not a button", () => {
    const resolved = resolveFab(route, new Map());
    expect(resolved?.type).toBe("link");
    expect(resolved && resolved.type === "link" ? resolved.href : null).toBe(href);
  });
});

describe("create/edit pages are hidden from the FAB", () => {
  it.each([
    "/categories/new",
    "/categories/[id]/edit",
    "/settings/rules/new",
    "/settings/rules/[id]/edit",
  ])("%s is a hidden entry", (pattern) => {
    expect(FAB_ROUTES[pattern]).toMatchObject({ kind: "hidden" });
  });
});

describe("converted screens no longer register the old handler keys", () => {
  const files = [
    "src/app/(app)/settings/categorization/page.tsx",
    "src/app/(app)/categories/_components/category-management.tsx",
    "src/components/settings/sections/rules-section.tsx",
  ];
  it.each(files)("%s does not call usePageFab for create", (file) => {
    const src = fs.readFileSync(file, "utf8");
    expect(src).not.toMatch(/usePageFab\(\s*"(categories\.create|settings\.categories\.create|rules\.create)"/);
  });
});
