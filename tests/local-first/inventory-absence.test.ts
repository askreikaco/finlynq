// @vitest-environment node
/**
 * The dev page is hidden (local-first P1, PKG-10): no nav or alias entry, and no app file mentions it.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";
import { NAV_REGISTRY, ALIASES, REDIRECTS } from "@/lib/nav-config";

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(tsx|ts|jsx|js|md|json)$/.test(name)) out.push(p);
  }
  return out;
}

describe("local-first dev page is hidden", () => {
  it("no NAV_REGISTRY, ALIASES or REDIRECTS entry mentions local-first", () => {
    expect(NAV_REGISTRY.filter((e) => JSON.stringify(e).includes("local-first"))).toEqual([]);
    expect(ALIASES.filter((e) => JSON.stringify(e).includes("local-first"))).toEqual([]);
    expect(REDIRECTS.filter((e) => JSON.stringify(e).includes("local-first"))).toEqual([]);
  });

  // The bare word "local-first" already appears in a pre-existing comment at
  // src/app/(app)/transactions/_hooks/use-transactions.ts (base commit), so this test pins the dev
  // page's own identifiers instead: its module path, its route, its flag and its DB prefix.
  it("no file under src/app/(app) or src/components references the dev page's identifiers", () => {
    const pattern = /lib\/local-first|dev\/local-first|FINLYNQ_LOCAL_FIRST_DEV|finlynq-lf-proto/;
    const files = [...walk("src/app/(app)"), ...walk("src/components")];
    expect(files.length).toBeGreaterThan(100); // anti-vacuity: the walk really visited the trees
    const hits = files.filter((f) => pattern.test(readFileSync(f, "utf8")));
    expect(hits).toEqual([]);
  });
});
