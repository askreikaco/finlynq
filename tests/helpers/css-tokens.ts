// Resolve CSS custom properties for source-level tests of globals.css.
// Literal values moved into tokens (--glass-*, --phone-header-h, ...), so class bodies now read var(--x).
// These helpers parse the stylesheet, collect top-level :root (light) and .dark (dark) declarations,
// and substitute var(--x) so tests can assert the same resolved values as before.
// Only top-level blocks define tokens; @media / @supports blocks are not token sources.

export type Theme = "light" | "dark";
type Decl = [prop: string, value: string];
interface Block {
  selector: string;
  atRules: string[];
  decls: Decl[];
}

const norm = (s: string) => s.replace(/\s+/g, " ").replace(/\s*,\s*/g, ", ").trim();

function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

function matchBrace(src: string, open: number): number {
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") {
      depth--;
      if (depth === 0) return i;
    }
  }
  throw new Error("unbalanced braces in stylesheet");
}

function parseDecls(inner: string): Decl[] {
  const out: Decl[] = [];
  for (const raw of inner.split(";")) {
    const idx = raw.indexOf(":");
    if (idx < 0) continue;
    const prop = raw.slice(0, idx).trim();
    const value = raw.slice(idx + 1).trim();
    if (prop) out.push([prop, value]);
  }
  return out;
}

function parseSeq(src: string, from: number, end: number, ctx: string[], out: Block[]): void {
  let i = from;
  let preludeStart = from;
  while (i < end) {
    const ch = src[i];
    if (ch === ";") {
      preludeStart = i + 1;
    } else if (ch === "{") {
      const prelude = norm(src.slice(preludeStart, i));
      const close = matchBrace(src, i);
      if (prelude.startsWith("@")) {
        parseSeq(src, i + 1, close, [...ctx, prelude], out);
      } else {
        out.push({ selector: prelude, atRules: ctx, decls: parseDecls(src.slice(i + 1, close)) });
      }
      i = close;
      preludeStart = close + 1;
    }
    i++;
  }
}

function parseBlocks(css: string): Block[] {
  const src = stripComments(css);
  const out: Block[] = [];
  parseSeq(src, 0, src.length, [], out);
  return out;
}

const TOP_ROOT = ":root";
const TOP_DARK = ".dark";

/** Raw (unresolved) value of a token declared directly in a top-level `:root` block. */
export function rootValue(css: string, name: string): string | undefined {
  let found: string | undefined;
  for (const b of parseBlocks(css)) {
    if (b.atRules.length || b.selector !== TOP_ROOT) continue;
    for (const [p, v] of b.decls) if (p === name) found = v;
  }
  return found;
}

/** Token map for a theme: top-level :root, with top-level .dark declarations layered on top in dark mode. */
export function tokenMap(css: string, theme: Theme): Map<string, string> {
  const blocks = parseBlocks(css).filter((b) => b.atRules.length === 0);
  const map = new Map<string, string>();
  const apply = (sel: string) => {
    for (const b of blocks) if (b.selector === sel) for (const [p, v] of b.decls) if (p.startsWith("--")) map.set(p, v);
  };
  apply(TOP_ROOT);
  if (theme === "dark") apply(TOP_DARK);
  return map;
}

/** Replace var(--x) / var(--x, fallback) with the token value for the theme, recursively. */
export function resolveVars(value: string, map: Map<string, string>, depth = 0): string {
  if (depth > 10) throw new Error(`token cycle while resolving: ${value}`);
  return value.replace(/var\((--[\w-]+)(?:\s*,\s*([^)]*))?\)/g, (m, name: string, fb?: string) => {
    if (map.has(name)) return resolveVars(map.get(name)!, map, depth + 1);
    if (fb !== undefined) return fb.trim();
    return m;
  });
}

/**
 * Resolved declarations of the first rule whose selector is exactly `selector` (source order, any
 * at-rule context), as "prop: value;" lines with var() substituted for `theme`.
 * Dark tests must name the base rule (e.g. `.mobile-glass-bar`), not a `.dark ...` fallback.
 */
export function resolvedDecls(css: string, selector: string, theme: Theme): string {
  const want = norm(selector);
  const block = parseBlocks(css).find((b) => b.selector === want);
  if (!block) throw new Error(`rule not found: ${selector}`);
  const map = tokenMap(css, theme);
  return block.decls.map(([p, v]) => `${p}: ${resolveVars(v, map)};`).join("\n  ");
}

/** Resolved value of one token (top-level :root plus .dark overlay in dark mode). */
export function resolvedToken(css: string, name: string, theme: Theme): string | undefined {
  const v = tokenMap(css, theme).get(name);
  return v === undefined ? undefined : resolveVars(v, tokenMap(css, theme));
}
