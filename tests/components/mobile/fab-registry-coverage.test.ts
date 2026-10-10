import { describe, it, expect } from "vitest";
import * as fs from "fs";
import { FAB_ROUTES, routeFromPageFile } from "@/components/mobile/fab-registry";
import { pageRoutesOnDisk } from "../../_helpers/app-routes";

// Ratchet: every page under src/app/(app) must have an explicit registry entry.
const INVENTORY = "docs/page-inventory.md";

describe("fab-registry coverage ratchet", () => {
  const routes = pageRoutesOnDisk();

  it("(a) every page.tsx under src/app/(app) has a FAB_ROUTES key", () => {
    const missing = routes.filter((r) => !Object.prototype.hasOwnProperty.call(FAB_ROUTES, r));
    expect(missing, "add an entry (or {kind:'fallback'}) to fab-registry").toEqual([]);
  });

  it("(b) every FAB_ROUTES key maps to an existing page (no stale entries)", () => {
    const stale = Object.keys(FAB_ROUTES).filter((k) => !routes.includes(k));
    expect(stale, "remove stale fab-registry entries").toEqual([]);
  });

  it("(c) docs/page-inventory.md rows match the disk and the registry", () => {
    const text = fs.readFileSync(INVENTORY, "utf8");
    const rows = [...text.matchAll(/^\| `(\/[^`]*)` \| `src\/app\/\(app\)\/(.+?)` \|/gm)];
    expect(rows).toHaveLength(routes.length);
    expect(routes).toHaveLength(Object.keys(FAB_ROUTES).length); // derived: one FAB key per page.tsx
    expect(routes.length).toBeLessThanOrEqual(93); // ratchet: the page count may only go down (was 103 before C-32/C-36)
    for (const row of rows) {
      const route = routeFromPageFile(`src/app/(app)/${row[2]}`);
      expect(Object.prototype.hasOwnProperty.call(FAB_ROUTES, route), route).toBe(true);
    }
  });

  it("(d) the fallback count is pinned at 38", () => {
    const fallbacks = Object.values(FAB_ROUTES).filter((e) => e.kind === "fallback");
    expect(fallbacks).toHaveLength(38);
  });
});
