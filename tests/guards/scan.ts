// Shared scanner for the tests/guards ratchets. Built on tests/helpers/adaptive-scan.ts.
// Ownership: a file under src/app/(app) belongs to the route of its nearest ancestor directory that holds a page.tsx,
// and that route's family (ALL_ROUTES). Shared components outside src/app/(app) have no family and are not scanned here.
import * as fs from "fs";
import * as path from "path";
import { countMatches, isExempt, listSourceFiles, scanContents, type Counts } from "../helpers/adaptive-scan";
import { ALL_ROUTES } from "../../src/lib/routes";
import type { RouteDef, RouteFamily } from "../../src/lib/routes/types";

export const ROOT = path.join(__dirname, "../..");
export const APP_DIR = "src/app/(app)";
export const BASELINE_DIR = path.join(__dirname, "baselines");

/** One entry per file in src/lib/routes/families. Checked against the directory listing in page-template.test.ts. */
export const FAMILIES: readonly RouteFamily[] = [
  "goals",
  "loans",
  "subscriptions",
  "budgets",
  "categories",
  "rules",
  "investments",
  "accounts",
  "transactions",
  "portfolio",
  "reports",
  "hubs",
  "settings",
  "admin",
  "family-import",
  "misc",
  "aliases",
];

export interface FamilyBaseline {
  family: RouteFamily;
  /** page.tsx files (repo-relative) that do not import @/components/templates yet. Only shrinks. */
  unmigrated: string[];
  /** file -> rule id -> count. Zero counts are omitted. Only shrinks. */
  chrome: Record<string, Record<string, number>>;
}

export interface ChromeRule {
  id: string;
  /** Literal text shown in failure messages. */
  label: string;
  pattern: RegExp;
  /** Literal that must match the pattern exactly once (checked by the mutation self-check). */
  sample: string;
  /** Only page.tsx files are scanned for this rule. */
  pageOnly: boolean;
  /** Repo-relative files never counted for this rule. */
  exempt?: readonly string[];
}

export const CHROME_RULES: readonly ChromeRule[] = [
  { id: "shrink", label: "w-2[48] shrink-0", pattern: /w-2[48] shrink-0/g, sample: 'className="w-24 shrink-0"', pageOnly: false },
  { id: "min-h", label: "min-h-1[12]", pattern: /min-h-1[12]/g, sample: 'className="min-h-11"', pageOnly: false },
  { id: "rounded-2xl", label: "rounded-2xl", pattern: /rounded-2xl/g, sample: 'className="rounded-2xl"', pageOnly: false },
  { id: "max-w-xl", label: "max-w-xl", pattern: /max-w-xl/g, sample: 'className="max-w-xl"', pageOnly: false },
  {
    id: "sab-pad",
    label: "pb-[calc(var(--sab",
    pattern: /pb-\[calc\(var\(--sab/g,
    sample: 'className="pb-[calc(var(--sab-bottom))]"',
    pageOnly: false,
  },
  { id: "title-prop", label: "titleClassName=", pattern: /titleClassName=/g, sample: 'titleClassName="text-xl"', pageOnly: false },
  {
    id: "subtitle-prop",
    label: "subtitleClassName=",
    pattern: /subtitleClassName=/g,
    sample: 'subtitleClassName="text-xs"',
    pageOnly: false,
  },
  {
    id: "suspense-null",
    label: "Suspense fallback={null}",
    pattern: /Suspense fallback=\{null\}/g,
    sample: "<Suspense fallback={null}>",
    pageOnly: true,
  },
  {
    id: "return-to",
    label: 'searchParams.get("returnTo")',
    pattern: /searchParams\.get\("returnTo"\)/g,
    sample: 'const r = searchParams.get("returnTo")',
    pageOnly: false,
  },
  { id: "backdrop-blur", label: "backdrop-blur", pattern: /backdrop-blur/g, sample: 'className="backdrop-blur-sm"', pageOnly: false },
  {
    id: "oklch",
    label: "oklch(",
    pattern: /oklch\(/g,
    sample: "color: oklch(0.5 0.1 200);",
    pageOnly: false,
    exempt: ["src/app/globals.css", "src/lib/design/tokens.ts"],
  },
];

const TEMPLATES_IMPORT = /from\s+["']@\/components\/templates(?:\/[^"']*)?["']/;

/** True when a page source imports from @/components/templates. Pure. */
export function importsTemplates(src: string): boolean {
  return TEMPLATES_IMPORT.test(src);
}

/** Files a rule scans, from a file list. Pure. */
export function scopeFiles(rule: ChromeRule, files: readonly string[]): string[] {
  return files.filter((f) => (!rule.pageOnly || isPageFile(f)) && !isExempt(f, rule.exempt ?? []));
}

export function isPageFile(file: string): boolean {
  return file.endsWith("/page.tsx");
}

/** Repo-relative .ts/.tsx files under src/app/(app), sorted. */
export function listAppFiles(): string[] {
  return listSourceFiles(ROOT, [APP_DIR], [".tsx", ".ts"]);
}

export function readFiles(files: readonly string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of files) out[f] = fs.readFileSync(path.join(ROOT, f), "utf-8");
  return out;
}

/** URL route for a directory under APP_DIR: route groups "(x)" are dropped. Pure. */
export function routeOfDir(dirRel: string): string {
  const rel = path.posix.relative(APP_DIR, dirRel);
  const segs = rel.split("/").filter((s) => s !== "" && s !== "." && !/^\(.*\)$/.test(s));
  return "/" + segs.join("/");
}

/** Route (URL pattern) owning a file: nearest ancestor directory holding a page.tsx. Null when none. */
export function ownerRouteOf(file: string): string | null {
  let dir = path.posix.dirname(file);
  for (;;) {
    if (fs.existsSync(path.join(ROOT, dir, "page.tsx"))) return routeOfDir(dir);
    if (dir === APP_DIR || !dir.startsWith(APP_DIR)) return null;
    dir = path.posix.dirname(dir);
  }
}

export const ROUTE_BY_PATTERN: ReadonlyMap<string, RouteDef> = new Map(ALL_ROUTES.map((r) => [r.pattern, r]));

export function familyOfRoute(route: string | null): RouteFamily | null {
  if (route === null) return null;
  return ROUTE_BY_PATTERN.get(route)?.family ?? null;
}

export function ownerFamilyOf(file: string): RouteFamily | null {
  return familyOfRoute(ownerRouteOf(file));
}

/** Route kind of a page file, or null when the page has no registry entry. */
export function kindOfPage(pageFile: string): RouteDef["kind"] | null {
  return ROUTE_BY_PATTERN.get(routeOfDir(path.posix.dirname(pageFile)))?.kind ?? null;
}

export function loadBaselines(): Record<string, FamilyBaseline> {
  const out: Record<string, FamilyBaseline> = {};
  for (const name of fs.readdirSync(BASELINE_DIR).sort()) {
    if (!name.endsWith(".json")) continue;
    out[name.replace(/\.json$/, "")] = JSON.parse(fs.readFileSync(path.join(BASELINE_DIR, name), "utf-8"));
  }
  return out;
}

/** Flat per-file counts for one rule, across all family baselines. */
export function flattenChrome(baselines: Record<string, FamilyBaseline>, ruleId: string): Counts {
  const out: Counts = {};
  for (const b of Object.values(baselines)) {
    for (const [file, rules] of Object.entries(b.chrome)) {
      const n = rules[ruleId];
      if (n !== undefined) out[file] = n;
    }
  }
  return out;
}

/** Regenerates every family baseline from the current tree. Used only to write tests/guards/baselines. */
export function computeFamilyBaselines(): Record<RouteFamily, FamilyBaseline> {
  const files = listAppFiles();
  const contents = readFiles(files);
  const out = {} as Record<RouteFamily, FamilyBaseline>;
  for (const f of FAMILIES) out[f] = { family: f, unmigrated: [], chrome: {} };

  for (const file of files) {
    const family = ownerFamilyOf(file);
    if (!family) continue;
    if (isPageFile(file) && kindOfPage(file) !== "alias" && !importsTemplates(contents[file])) {
      out[family].unmigrated.push(file);
    }
    for (const rule of CHROME_RULES) {
      if (scopeFiles(rule, [file]).length === 0) continue;
      const n = countMatches(contents[file], rule.pattern);
      if (n > 0) {
        out[family].chrome[file] ??= {};
        out[family].chrome[file][rule.id] = n;
      }
    }
  }
  for (const f of FAMILIES) {
    out[f].unmigrated.sort();
    const sorted: Record<string, Record<string, number>> = {};
    for (const k of Object.keys(out[f].chrome).sort()) sorted[k] = out[f].chrome[k];
    out[f].chrome = sorted;
  }
  return out;
}

/** Per-file counts for one rule over the current tree. */
export function currentChrome(rule: ChromeRule, files: readonly string[], contents: Record<string, string>): Counts {
  const scoped: Record<string, string> = {};
  for (const f of scopeFiles(rule, files)) scoped[f] = contents[f];
  return scanContents(scoped, rule.pattern, rule.exempt ?? []);
}

/** Pure page-template ratchet. `pages` maps page file -> source. */
export function pageRatchet(
  pages: Record<string, string>,
  aliasPages: ReadonlySet<string>,
  unmigrated: ReadonlySet<string>
): { newPages: string[]; stale: string[] } {
  const pending = Object.keys(pages).filter((f) => !aliasPages.has(f) && !importsTemplates(pages[f]));
  const newPages = pending.filter((f) => !unmigrated.has(f));
  const stale = [...unmigrated].filter((f) => !(f in pages) || aliasPages.has(f) || importsTemplates(pages[f]));
  return { newPages, stale };
}
