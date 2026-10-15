// G2-02 guard v2: pure scanner for the one-adaptive-UI ratchets.
// Used by tests/design-system-guard.test.ts. No test framework imports here.
import * as fs from "fs";
import * as path from "path";

export type Counts = Record<string, number>;

// Banned adaptive patterns (ratchet via tests/fixtures/adaptive-baseline.json).
export const BANNED_PATTERN =
  /md:hidden|hidden\s+md:|hidden\s+max-md:|isMobile|window\.innerWidth|matchMedia|useMediaQuery/gi;

// Viewport breakpoint tokens (ratchet via tests/fixtures/breakpoint-baseline.json).
// `max-md:` counts as one token; `foo-md:`, `hidden-md:` and container tokens `@md:` do not.
// Container-query tokens (`@sm:`, `@lg:`, `@[24rem]:`) are NOT viewport tokens: a `@` before the name skips the match.
export const BREAKPOINT_PATTERN = /(?<![\w@.-])(max-)?(sm|md|lg|xl|2xl):/g;

// Approximate size-class wrapper usage (ratchet via tests/fixtures/size-class-wrapper-baseline.json).
export const SIZE_CLASS_WRAPPER_PATTERN = /<(CompactOnly|FromMd)\b/g;

// `regular:hidden` / `hidden regular:` show/hide pairs (the new-variant version of md:hidden pairs).
// `max-regular:hidden` is NOT matched: a `-` before `regular` skips it. Gated by an explicit keep-list
// in tests/design-system-guard.test.ts; migrate to a single responsive element or useAppSizeClass instead.
export const HIDDEN_PAIR_PATTERN = /(?<![\w-])regular:hidden|(?<![\w-])hidden\s+regular:/g;
// Files allowed to use the hidden-pair pattern: the rail/bar shell, the page header, and adaptive primitives.
export const HIDDEN_PAIR_EXEMPT: readonly string[] = [
  "src/components/nav.tsx",
  "src/components/mobile/page-header.tsx",
  "src/components/adaptive/",
];

// Source roots and extensions for the banned scan (unchanged from guard v1).
export const BANNED_DIRS = ["src/app", "src/components"] as const;
export const SOURCE_EXTS = [".tsx", ".ts", ".jsx", ".js"] as const;
// Exempt from the banned scan (unchanged from guard v1).
export const BANNED_EXEMPT: readonly string[] = [
  "src/components/ui/size-class.ts",
];

// ONE exempt list for the breakpoint and wrapper scans. Narrowed later in the
// migration (plan section 3): mobile/ is now scanned; the overlay ui files remain.
// Keep it the only place these paths are listed.
// - src/components/adaptive/: the size-class primitives themselves (G2-01).
// - overlay ui files: overlay/popover/dropdown-menu are
//   viewport-agnostic overlays and keep breakpoint classes by design.
//   (popover.tsx does not exist yet; listed so the exemption is ready.)
export const BREAKPOINT_EXEMPT: readonly string[] = [
  "src/components/adaptive/",
  "src/components/ui/overlay.tsx",
  "src/components/ui/popover.tsx",
  "src/components/ui/dropdown-menu.tsx",
];

function freshGlobal(pattern: RegExp): RegExp {
  return new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : pattern.flags + "g");
}

// Number of pattern matches in one string. Pure.
export function countMatches(content: string, pattern: RegExp): number {
  return (content.match(freshGlobal(pattern)) || []).length;
}

// True when file equals an exempt entry, or starts with an exempt directory ("x/").
export function isExempt(file: string, exempt: readonly string[]): boolean {
  return exempt.some((p) => file === p || (p.endsWith("/") && file.startsWith(p)));
}

// Per-file counts from in-memory contents. Pure; files with 0 hits are omitted.
export function scanContents(
  entries: Record<string, string>,
  pattern: RegExp,
  exempt: readonly string[] = []
): Counts {
  const out: Counts = {};
  for (const [file, content] of Object.entries(entries)) {
    if (isExempt(file, exempt)) continue;
    const n = countMatches(content, pattern);
    if (n > 0) out[file] = n;
  }
  return out;
}

// Recursively list files under the given directories (relative to root, posix separators).
export function listSourceFiles(
  root: string,
  dirs: readonly string[],
  exts: readonly string[]
): string[] {
  const out: string[] = [];
  const walk = (rel: string) => {
    const abs = path.join(root, rel);
    if (!fs.existsSync(abs)) return;
    for (const ent of fs.readdirSync(abs, { withFileTypes: true })) {
      const childRel = `${rel}/${ent.name}`;
      if (ent.isDirectory()) walk(childRel);
      else if (ent.isFile() && exts.some((e) => ent.name.endsWith(e))) out.push(childRel);
    }
  };
  for (const d of dirs) walk(d);
  return out.sort();
}

// Per-file counts for the given relative file list. Unreadable files are skipped.
export function scanPaths(
  root: string,
  files: readonly string[],
  pattern: RegExp,
  exempt: readonly string[] = []
): Counts {
  const entries: Record<string, string> = {};
  for (const f of files) {
    if (isExempt(f, exempt)) continue;
    try {
      entries[f] = fs.readFileSync(path.join(root, f), "utf-8");
    } catch {
      // File may have been deleted, skip
    }
  }
  return scanContents(entries, pattern, exempt);
}

export interface RatchetReport {
  newFiles: string[]; // in current, not in baseline (must be 0 hits)
  increased: string[]; // "file: base -> cur", cur > base
  decreased: string[]; // "file: base -> cur", 0 < cur < base (lower the baseline)
  stale: string[]; // in baseline, cur === 0
}

// Ratchet comparison. Pure.
export function ratchet(baseline: Counts, current: Counts): RatchetReport {
  const newFiles = Object.keys(current).filter((f) => !baseline[f]);
  const increased = Object.entries(baseline)
    .filter(([f, b]) => (current[f] ?? 0) > b)
    .map(([f, b]) => `${f}: ${b} -> ${current[f] ?? 0}`);
  const decreased = Object.entries(baseline)
    .filter(([f, b]) => {
      const c = current[f] ?? 0;
      return c < b && c > 0;
    })
    .map(([f, b]) => `${f}: ${b} -> ${current[f] ?? 0}`);
  const stale = Object.keys(baseline).filter((f) => (current[f] ?? 0) === 0);
  return { newFiles, increased, decreased, stale };
}
