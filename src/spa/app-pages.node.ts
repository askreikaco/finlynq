/** Node-only: every page route of the Next app (file convention, route groups removed) from the filesystem. Used by vite.config.ts and deploy/web/sync-routes.mjs. */
import { readdirSync } from "node:fs";
import path from "node:path";

export function allAppPageRoutes(srcDir: string): string[] {
  const root = path.join(srcDir, "app/(app)");
  const out: string[] = [];
  const walk = (dir: string, segs: string[]) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) walk(path.join(dir, e.name), /^\(.*\)$/.test(e.name) ? segs : [...segs, e.name]);
      else if (e.name === "page.tsx") out.push("/" + segs.join("/"));
    }
  };
  walk(root, []);
  return out.sort();
}
