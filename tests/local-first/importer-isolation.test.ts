/**
 * Static isolation scan (local-first P1, PKG-09). Proves src/lib/local-first/** has no import of
 * the server DB or query layer, and no network call sites (fetch, XHR, WebSocket, /api/ routes).
 * Comments are stripped before scanning, so doc comments that name forbidden modules do not count.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve, dirname } from "node:path";

const REPO = resolve(__dirname, "../..");
const LOCAL_FIRST = join(REPO, "src/lib/local-first");

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out.sort();
}

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1");
}

const SPEC_RE = /\b(?:from|import|require)\s*\(?\s*["']([^"']+)["']/g;
const NETWORK_RE = /\bfetch\s*\(|\bXMLHttpRequest\b|\bWebSocket\b|\bEventSource\b|\bsendBeacon\b|["'`][^"'`\n]*\/api\/[^"'`\n]*["'`]/;

/** Returns a list of violation strings for one file's source (comments already allowed in input). */
export function scanSource(file: string, src: string): string[] {
  const code = stripComments(src);
  const violations: string[] = [];
  for (const m of code.matchAll(SPEC_RE)) {
    const spec = m[1];
    const forbiddenAlias = spec === "@/db" || spec.startsWith("@/db/") || spec === "@/lib/queries";
    let forbiddenRel = false;
    if (spec.startsWith(".")) {
      const target = relative(REPO, resolve(dirname(file), spec)).replace(/\\/g, "/");
      forbiddenRel = target === "src/db" || target.startsWith("src/db/") || target === "src/lib/queries" || target === "src/lib/queries.ts";
    }
    if (forbiddenAlias || forbiddenRel) violations.push(`${file}: import "${spec}"`);
  }
  const net = NETWORK_RE.exec(code);
  if (net) violations.push(`${file}: network site "${net[0]}"`);
  return violations;
}

describe("importer isolation (static scan of src/lib/local-first)", () => {
  const files = walk(LOCAL_FIRST);

  it("the scan covers the module tree including the importer", () => {
    expect(files.length).toBeGreaterThan(20);
    expect(files.map((f) => relative(REPO, f).replace(/\\/g, "/"))).toContain("src/lib/local-first/importer/import-fixture.ts");
  });

  it("no file imports '@/db', '@/lib/queries' (alias or relative), or makes a network call", () => {
    const violations = files.flatMap((f) => scanSource(f, readFileSync(f, "utf8")));
    expect(violations).toEqual([]);
  });

  it("positive control: the scanner flags planted violations", () => {
    const planted = [
      'import { db } from "@/db";\nexport const x = db;',
      'import { getAccountBalances } from "@/lib/queries";',
      'export * from "../../db/index";',
      'const r = await fetch("https://example.invalid/x");',
      'const u = "/api/dashboard";',
    ];
    const found = planted.map((src) => scanSource(join(LOCAL_FIRST, "planted.ts"), src).length);
    expect(found).toEqual([1, 1, 1, 1, 1]);
  });

  it("comments that name forbidden modules are not counted", () => {
    const src = "// import x from '@/db'\n/* fetch('/api/x') */\nexport const ok = 1;";
    expect(scanSource(join(LOCAL_FIRST, "doc.ts"), src)).toEqual([]);
  });
});
