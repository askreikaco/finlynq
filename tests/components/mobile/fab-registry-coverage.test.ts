import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { FAB_ROUTES, routeFromPageFile } from "@/components/mobile/fab-registry";

// Ratchet: every page under src/app/(app) must have an explicit registry entry.
const APP_DIR = "src/app/(app)";
const INVENTORY = "docs/page-inventory.md";

function pageRoutesOnDisk(): string[] {
  const files = fs.readdirSync(APP_DIR, { recursive: true }) as string[];
  return files
    .map((f) => f.split(path.sep).join("/"))
    .filter((f) => f.endsWith("page.tsx"))
    .map((f) => routeFromPageFile(`${APP_DIR}/${f}`));
}

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
    expect(routes).toHaveLength(79);
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
