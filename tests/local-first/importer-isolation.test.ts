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

/** Strips a line comment: `//` only at line start or after whitespace, and never inside a quoted string. */
function stripLine(line: string): string {
  let quote: string | null = null;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quote) {
      if (c === "\\") i++;
      else if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") quote = c;
    else if (c === "/" && line[i + 1] === "/" && (i === 0 || /\s/.test(line[i - 1]))) return line.slice(0, i);
  }
  return line;
}

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map(stripLine).join("\n");
}

// Group 1: from/import/require with a quoted specifier. Group 2: dynamic import() with a literal (quote or backtick).
const SPEC_RE = /\b(?:from|import|require)\s*\(?\s*["']([^"']+)["']|\bimport\s*\(\s*["'`]([^"'`]+)["'`]/g;
// import( whose argument is not a plain literal (variable, concatenation, interpolated template).
const DYN_NONLITERAL_RE = /\bimport\s*\(\s*(?!["'`][^"'`$]*["'`]\s*\))/;
/**
 * The in-memory read cache (L2a) is the only module group that calls the app's own JSON APIs.
 * Exemptions are per file and pinned by the test "network exemptions match their current call sites".
 * Any other file in src/lib/local-first/** still fails the network check.
 */
const NETWORK_ALLOWED: Record<string, string> = {
  "src/lib/local-first/read-cache/hydrate.ts": "GET /api/accounts, /api/categories, /api/transactions via injected fetchImpl (L2a)",
  "src/lib/local-first/read-cache/use-local-balances.ts": "browser fetch passed to hydrate (L2a)",
};
const FORBIDDEN_PKG_RE = /^(pg|postgres|axios|undici|node:https?|https?)$|^drizzle-orm\/(node-postgres|postgres-js)/;
const NETWORK_RE = /\bfetch\s*\(|\b(?:globalThis|window|self)\s*\.\s*fetch\b|\bXMLHttpRequest\b|\bWebSocket\b|\bEventSource\b|\bsendBeacon\b|["'`][^"'`\n]*\/api\/[^"'`\n]*["'`]/;

/** Returns a list of violation strings for one file's source (comments already allowed in input). */
export function scanSource(file: string, src: string): string[] {
  const code = stripComments(src);
  const violations: string[] = [];
  for (const m of code.matchAll(SPEC_RE)) {
    const spec = m[1] ?? m[2];
    const forbiddenAlias = spec === "@/db" || spec.startsWith("@/db/") || spec === "@/lib/queries" || FORBIDDEN_PKG_RE.test(spec);
    let forbiddenRel = false;
    if (spec.startsWith(".")) {
      const target = relative(REPO, resolve(dirname(file), spec)).replace(/\\/g, "/");
      forbiddenRel = target === "src/db" || target.startsWith("src/db/") || target === "src/lib/queries" || target === "src/lib/queries.ts";
    }
    if (forbiddenAlias || forbiddenRel) violations.push(`${file}: import "${spec}"`);
  }
  if (DYN_NONLITERAL_RE.test(code)) violations.push(`${file}: import() with non-literal argument`);
  const rel = relative(REPO, file).replace(/\\/g, "/");
  const net = NETWORK_ALLOWED[rel] ? null : NETWORK_RE.exec(code);
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

  it("hardened controls: dynamic, package, network-alias and comment-stripping patterns are flagged", () => {
    const planted: Array<[string, string]> = [
      ["dynamic template import of @/db", "const m = await import(`@/db`);"],
      ["pg import", 'import pg from "pg";'],
      ["axios import", 'import axios from "axios";'],
      ["globalThis.fetch", "const f = globalThis.fetch;"],
      ["x//y string then import", 'const s = "x//y"; import { db } from "@/db";'],
      ["import(variable)", "const m = await import(spec);"],
    ];
    for (const [label, src] of planted) {
      expect(scanSource(join(LOCAL_FIRST, "planted.ts"), src).length, `control: ${label}`).toBeGreaterThan(0);
    }
  });

  it("network exemptions match their current call sites (no stale or wider exemption)", () => {
    const hydrate = readFileSync(join(LOCAL_FIRST, "read-cache/hydrate.ts"), "utf8");
    const hydrateCode = stripComments(hydrate);
    expect(hydrateCode.match(/\/api\//g)?.length ?? 0).toBeGreaterThan(0);
    expect(hydrateCode).not.toMatch(/\bfetch\s*\(/);
    expect(hydrateCode).not.toMatch(/\b(?:globalThis|window|self)\s*\.\s*fetch\b/);
    const hook = stripComments(readFileSync(join(LOCAL_FIRST, "read-cache/use-local-balances.ts"), "utf8"));
    expect(hook.match(/\bfetch\s*\(/g)?.length ?? 0).toBe(1);
    expect(hook).not.toMatch(/\/api\//);
    expect(Object.keys(NETWORK_ALLOWED).sort()).toEqual([
      "src/lib/local-first/read-cache/hydrate.ts",
      "src/lib/local-first/read-cache/use-local-balances.ts",
    ]);
  });

  it("comments that name forbidden modules are not counted", () => {
    const src = "// import x from '@/db'\n/* fetch('/api/x') */\nexport const ok = 1;";
    expect(scanSource(join(LOCAL_FIRST, "doc.ts"), src)).toEqual([]);
  });
});
